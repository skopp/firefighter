
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
  try {
    var fbRef = new Firebase(feed.value.firebase);
    if (feed.value.secret) {
      fbRef.auth(feed.value.secret, function(err) {
        if (err) {
          feed.status.set(err.toString());
        } else {
          doRequest(feed.value.url, feed.status, fbRef);
        }
      });
    } else {
      doRequest(feed.value.url, feed.status, fbRef);
    }
  } catch(e) {
    feed.status.set(e.toString());
  }
}

function doRequest(url, status, fbRef) {
  Parser.parseUrl(url, function(err, meta, articles) {
    if (err) {
      status.set(err.toString());
      return;
    }
    try {
      fbRef.child("meta").set(sanitizeObject(meta), function(err) {
        if (err) {
          status.set(err.toString());
          return;
        }
        var total = articles.length, done = 0;
        function _writeArticle(article) {
          var id = article.guid || article.link || article.title;
          id = new Buffer(id).toString("base64");
          fbRef.child("articles/" + id).set(sanitizeObject(article), function(err) {
            if (err) {
              status.set(err.toString());
            } else {
              done++;
              if (done == total - 1) {
                status.set("Last Sync:<br/>" + new Date());
              } else {
                _writeArticle(articles[done]);
              }
            }
          });
        }
        _writeArticle(articles[done]);
      });
    } catch(e) {
      status.set(e.toString());
    }
  });
}
