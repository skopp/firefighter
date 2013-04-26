
var crypto = require("crypto")
  , request = require("request")
  , Parser = require("feedparser")
  , Firebase = require("firebase");

var feeds = {};
var feedContent = {};

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

function setupHandlers() {
  var self = this;
  ref.on("child_added", function(snap) {
    var userid = snap.name();
    if (!feeds[userid]) {
      feeds[userid] = {};
    }
    var childRef = ref.child(userid).child("feeds");
    childRef.on("child_added", editUserFeed.bind(self, userid));
    childRef.on("child_changed", editUserFeed.bind(self, userid));
    childRef.on("child_removed", function(childSnap) {
      delete feeds[userid][childSnap.name()];
    });
  });
  ref.on("child_removed", function(remSnap) {
    var childRef = ref.child(remSnap.name()).child("feeds");
    childRef.off();
  });
}

function editUserFeed(userid, snap) {
  var id = snap.name();
  var entry = feeds[userid][id] = {
    status: new Firebase(snap.ref().toString()).parent().parent().child("status/" + id),
    value: snap.val()
  };
  parseFeed(entry);
}

function parseFeeds() {
  for (var uid in feeds) {
    var user = feeds[uid];
    for (var index in user) {
      parseFeed(user[index]);
    }
  }
}

function parseFeed(feed) {
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
  var urlHash = getHash(url);
  if (feedContent[urlHash]) {
    if (new Date().getTime() - feedContent[urlHash].lastSync > REFRESH_INTERVAL) {
      getAndSet(url, urlHash, status, fbRef);
    } else {
      setFeed(feedContent[urlHash].content, status, fbRef);
    }
  } else {
    getAndSet(url, urlHash, status, fbRef);
  }
}

function getAndSet(url, hash, status, fbRef) {
  request(url, function(err, resp, body) {
    if (!err && resp.statusCode == 200) {
      feedContent[hash] = {time: new Date().getTime(), content: body};
      setFeed(body, status, fbRef);
    } else {
      if (err) {
        status.set(err.toString());
      } else {
        status.set("Got status code " + resp.statusCode);
      }
    }
  });
}

function setFeed(feed, status, fbRef) {
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
        setArticles(articles, 0, articles.length, status, fbRef);
      });
    } catch(e) {
      status.set(e.toString());
    }
  });
}

function setArticles(articles, done, total, status, fbRef) {
  if (total <= 0) {
    status.set(new Date().toString());
    return;
  }

  var article = articles[done];
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
        status.set(new Date().toString());
      } else {
        setArticles(articles, done, total, status, fbRef);
      }
    }
  });
}
