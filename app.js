
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
    var childRef = ref.child(snap.name());
    childRef.on("child_added", editUserFeed);
    childRef.on("child_changed", editUserFeed);
    childRef.on("child_removed", function(snap) {
      delete feeds[snap.ref().toString()];
    });
  });
  ref.on("child_removed", function(snap) {
    var childRef = ref.child(snap.name());
    childRef.off();
  });
}

var feeds = {};
function editUserFeed(snap) {
  feeds[snap.ref().toString()] = snap.val();
  parseFeeds();
}

function parseFeeds() {
  for (var path in feeds) {
    var abort = false;
    var feed = feeds[path];
    var statusRef = new Firebase(path + "/status");
    request(feed.url, function(err) {
      if (err) {
        abort = true;
        statusRef.set(err);
      }  
    })
      .pipe(new Parser())
      .on("error", function(err) {
        abort = true;
        statusRef.set(err);
      })
      .on("meta", function(meta) {
        try {
          var fbRef = new Firebase(feed.firebase);
          fbRef.child("meta").set(meta);
        } catch(e) {
          abort = true;
          statusRef.set("Error: " + e);
        }
      })
      .on("article", function(article) {
        var id = article.guid || article.link || article.title;
        id = new Buffer(id).toString("base64");
        try {
          var fbRef = new Firebase(feed.firebase);
          fbRef.child(id).set(article);
        } catch(e) {
          abort = true;
          statusRef.set("Error: " + e);
        }
      })
      .on("end", function() {
        if (!abort) {
          statusRef.set("Last Sync: " + new Date());
        }
      });
  }
}
