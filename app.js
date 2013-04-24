
var crypto = require("crypto")
  , request = require("request")
  , Parser = require("feedparser")
  , Firebase = require("firebase");

var REFRESH_INTERVAL = 600000;

var ref = new Firebase("https://feedthefire.firebaseio.com/persona");
ref.auth(process.env.SECRET, function(err) {
  if (err) {
    console.log("Firebase authentication failed!", err);
  } else {
    setupHandlers();
    setInterval(parseFeeds, REFRESH_INTERVAL);
  }
});

function getHash(value) {
  var shasum = crypto.createHash("sha1");
  shasum.update(value);
  return shasum.digest("hex");
}

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
var feedContent = {};
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
    var feed = feeds[id];
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
}

function doRequest(url, status, fbRef) {
  var urlHash = getHash(url);
  if (feedContent[urlHash]) {
    if (new Date().getTime() - feedContent[urlHash].lastSync > REFRESH_INTERVAL) {
      getAndParse(url, urlHash, status, fbRef);
    } else {
      parseFeed(feedContent[urlHash].content, status, fbRef);
    }
  } else {
    getAndParse(url, urlHash, status, fbRef);
  }
}

function getAndParse(url, hash, status, fbRef) {
  request(url, function(err, resp, body) {
    if (!err && resp.statusCode == 200) {
      feedContent[hash] = {time: new Date().getTime(), content: body};
      parseFeed(body, status, fbRef);
    } else {
      status.set(err.toString());
    }
  });
}

function parseFeed(feed, status, fbRef) {
  Parser.parseString(feed, {addmeta: false}, function(err, meta, articles) {
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
          var id = getHash(article.guid || article.link || article.title);
          var date = article.pubDate || article.pubdate || article.date ||
            article["rss:pubdate"] || new Date().toString();
          var timestamp = Date.parse(date);

          var arRef = fbRef.child("articles/" + id);
          arRef.setWithPriority(sanitizeObject(article), timestamp, function(err) {
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
