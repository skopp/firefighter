
var request = require("request")
  , Parser = require("feedparser")
  , Firebase = require("firebase");

var ref = new Firebase("https://feedthefire.firebaseio.com/persona");
ref.auth(process.env.SECRET, function(err) {
  if (err) {
    console.log("Firebase authentication failed!", err);
  } else {
    setupHandlers();
    setInterval(parseFeeds, 600000);
  }
});

function setupHandlers() {
  ref.on("child_added", function(snap) {
    var childRef = ref.child(snap.name()).child("feeds");
    childRef.on("child_added", editUserFeed);
    childRef.on("child_changed", editUserFeed);
    childRef.on("child_removed", function(snap) {
      delete feeds[snap.ref().toString()];
    });
  });
  ref.on("child_removed", function(snap) {
    var childRef = ref.child(snap.name()).child("feeds");
    childRef.off();
  });
}

var feeds = {};
function editUserFeed(snap) {
  var id = snap.name();
  feeds[id] = {
    status: new Firebase(snap.ref().toString()).parent().parent().child("status/" + id),
    value: snap.val()
  };
  parseFeeds();
}

function sanitizeObject(obj) {
  if (typeof obj != typeof {}) {
    return obj;
  }

  var newObj = {};
  var special = [".", "$", "/", "[", "]"];
  for (var key in obj) {
    var sum = -1;
    for (var i in special) {
      sum += (key.indexOf(special[i])) + 1;
    }
    if (sum < 0) {
      if (key == "date" || key == "pubdate" || key == "pubDate") {
        if (obj[key]) {
          newObj[key] = obj[key].toString();
        }
      } else if (key == "#") {
        newObj["value"] = sanitizeObject(obj[key]);
      } else if (key.indexOf("#") >= 0) {
        newObj["@" + key.replace("#", "")] = sanitizeObject(obj[key]);
      } else if (sanitizeObject(obj[key]) && key != "") {
        newObj[key] = sanitizeObject(obj[key]);
      }
    }
  }
  return newObj;
}

function parseFeeds() {
  for (var id in feeds) {
    getAndSetFeed(feeds[id]);
  }
}

function getAndSetFeed(feed) {
  var abort = false;
  request(feed.value.url, function(err) {
    if (err) {
      abort = true;
      feed.status.set(err);
    }  
  }).
  pipe(new Parser({addmeta: false})).
  on("error", function(err) {
    abort = true;
    feed.status.set(err);
  }).
  on("meta", function(meta) {
    try {
      var fbRef = new Firebase(feed.value.firebase);
      fbRef.child("meta").set(sanitizeObject(meta));
    } catch(e) {
      abort = true;
      console.log("Error for object: ");
      console.log(sanitizeObject(meta));
      feed.status.set(e.toString());
    }
  }).
  on("article", function(article) {
    var id = article.guid || article.link || article.title;
    id = new Buffer(id).toString("base64");
    try {
      var fbRef = new Firebase(feed.value.firebase);
      fbRef.child("articles/" + id).set(sanitizeObject(article));
    } catch(e) {
      abort = true;
      console.log("Error for object: ");
      console.log(sanitizeObject(article));
      feed.status.set(e.toString());
    }
  }).
  on("end", function() {
    if (!abort) {
      feed.status.set("Last Sync:<br/>" + new Date());
    }
  });
}
