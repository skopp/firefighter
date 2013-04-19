
var request = require("request")
  , Parser = require("feedparser")
  , Firebase = require("firebase");

var ref = new Firebase("https://feedthefire.firebaseio.com/persona");
ref.auth(process.env.SECRET, function(err) {
  if (err) {
    console.log("Firebase authentication failed!", err);
  } else {
    setupHandlers();
    setInterval(parseFeeds, 1200000);
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

function parseFeeds() {
  for (var id in feeds) {
    var abort = false;
    var feed = feeds[id];
    request(feed.value.url, function(err) {
      if (err) {
        abort = true;
        feed.status.set(err);
      }  
    })
      .pipe(new Parser())
      .on("error", function(err) {
        abort = true;
        feed.status.set(err);
      })
      .on("meta", function(meta) {
        try {
          var fbRef = new Firebase(feed.value.firebase);
          fbRef.child("meta").set(meta);
        } catch(e) {
          abort = true;
          feed.status.set(e.toString());
        }
      })
      .on("article", function(article) {
        var id = article.guid || article.link || article.title;
        id = new Buffer(id).toString("base64");
        try {
          var fbRef = new Firebase(feed.value.firebase);
          fbRef.child(id).set(article);
        } catch(e) {
          abort = true;
          console.log(e);
          feed.status.set(e.toString());
        }
      })
      .on("end", function() {
        if (!abort) {
          feed.status.set("Last Sync: " + new Date());
        }
      });
  }
}
