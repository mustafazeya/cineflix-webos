# Trailer page

Trailers play inside the app through a small public page, [`trailer.html`](https://github.com/mustafazeya/movies/blob/main/trailer.html),
hosted on GitHub Pages. TV apps run from local files and send no referrer, and YouTube rejects embeds without one
(player error 153). Loading the embed through an https page gives it a valid origin. No server of yours is involved.

The default in `js/config.js` points to the maintainer's page:

```js
trailerPage: 'https://www.zeyamustafa.online/movies/trailer.html'
```

The page receives the YouTube video id as `?v=<id>`, embeds the player and reports playback state back to the app with `postMessage`
(state changes and errors), which is how the app closes the trailer when it ends and shows a message if YouTube refuses to play it.

## Host your own

You may not want a stranger's page in your app, and you should not depend on one. To host your own:

1. Copy `trailer.html` from [mustafazeya/movies](https://github.com/mustafazeya/movies) into any https static host (GitHub Pages, Cloudflare Pages, Netlify).
2. Set `trailerPage` in `js/config.local.js` to its URL.
3. Rebuild and install: `./package.sh install my-lg-tv`.

Trailers are optional; the rest of the app works without them.

If `trailerPage` is empty, the app uses `{serverBase}/trailer?v=<id>`, which the reference media server also serves, but that is an http page
and only works when the server is reachable. With neither, it falls back to a plain YouTube embed, which may fail with error 153 on the TV.

## Privacy

Opening a trailer loads the YouTube player, which is subject to Google's policies. The wrapper page itself stores nothing.
