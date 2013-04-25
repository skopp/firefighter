Feed the Fire
=============
Feed the Fire is a combination of web frontend and a backend process to
synchronize RSS or Atom feeds with [Firebase](https://www.firebase.com/).

Feeds are fetched every 10 minutes and updated if neccessary. Changes in the
feed's content will show up through the usual Firebase events like
`child_added`. For example, to fetch the latest XKCD comics:

```js
var ref = new Firebase("https://feeds.firebaseio.com/xkcd");
ref.child("meta").once("value", function(snapshot) {
  $("#e-title").html(snapshot.val().description);
});
ref.child("articles").on("child_added", function(snapshot) {
  var article = snapshot.val();
  var link = $("<a>", {"href": article.link, "target": "_blank"});
  $("#e-list").append($("<li>").append(link.html(article.title)));
});
```

### A live version of this service is running at [FeedTheFire.in](http://feedthefire.in).

A public Firebase hosting 50 of the most popular feeds is also available 
at `https://feeds.fireabaseio.com`. Forge access is unavailable, please use
the [JS client](https://www.firebase.com/docs/web-quickstart.html),
[iOS](https://www.firebase.com/docs/ios-quickstart.html) /
[Node.JS](https://www.firebase.com/docs/nodejs-quickstart.html) SDK, or the
[REST API](https://www.firebase.com/docs/rest-api-quickstart.html) to access the data.

Architecture
------------
The project is split into two components:

* The frontend is contained in its entirety in [index.html](https://github.com/firebase/feedthefire/blob/gh-pages/index.html).
This code is responsible for accepting an RSS/Atom URL, a Firebase URL and optionally,
a secret from the user and storing it in a Firebase dedicated to this application.

* The backend, [app.js](https://github.com/firebase/feedthefire/blob/gh-pages/app.js), is a
node process responsible for listening to changes to user data, fetching feeds every
10 minutes, writing the feeds to the appropriate Firebases, and updating the
status of each feed.

The backend writes the content of the feed under two top-level keys, `articles`
and `meta`. The `meta` object contains information about the feed, such as
its description, title and published date. The `articles` object contains
the individual feed items, ordered by date. The prirority for each of these
articles is set to the timestamp at which the article was published, so all
the `child_added` callbacks will be invoked in order.

License
-------
[MIT](http://firebase.mit-license.org).
