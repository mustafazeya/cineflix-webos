# Development

## Run on a desktop

```bash
node tools/media-server.js --port 8090
npx http-server . -p 8080
```

Open `http://localhost:8080` in Chrome and set your TMDB key and the server URL in Settings. Serve the app over `http://`; opening
`index.html` from `file://` breaks cross-origin frames in desktop Chrome.

Keys: arrows move focus, Enter selects, Esc or Backspace is Back. Chrome's `Network > Throttling` and a 1920x1080 window approximate a TV.
HLS in desktop Chrome loads hls.js from jsDelivr on demand; the TV plays HLS natively and loads nothing.

### Behaving like a TV

webOS lets the app read the DOM of a frame it opened, which desktop Chrome does not. To test that path, start Chrome with
`--disable-web-security --disable-site-isolation-trials` and a throw-away profile (`--user-data-dir=/tmp/cf-chrome`). Without those
flags you exercise the fallback path, which is also worth testing.

## Debug on the TV

```bash
ares-inspect -d my-lg-tv --app com.makeflix.catalog --open
```

## Checks

CI runs these, and you can run them locally:

```bash
for f in js/*.js js/vendor/*.js tools/*.js; do node --check "$f" || exit 1; done   # syntax
node -e "for (const f of ['appinfo.json','tools/library.json']) JSON.parse(require('fs').readFileSync(f))"
```

There is no unit-test framework. Behaviour is checked end to end with a browser. A good manual pass after a change:

1. Home loads, rows scroll, focus is visible and never lost.
2. Open a title, press Play, and check resume after backing out.
3. Page mode: Back warns once, a second Back returns to the details page, and replaying several titles in a row keeps working.
4. Subtitles on a movie and on a series episode: pause freezes the text, seeking moves it.
5. Browse filters, Search with the on-screen keyboard, My List and Already Watched.

## Code style

- Plain JavaScript, no transpiling. Keep to widely supported features. The TV used for testing runs Chrome 120, but older webOS versions ship older engines.
- Attach to the `MF` global, keep functions small, and comment only where the reason is not obvious.
- Fonts and icons are local. Do not add runtime requests to third-party CDNs.
- Respect `.editorconfig`.
- Never log or commit keys. `js/config.local.js` and `*.ipk` stay out of version control.

## Releasing

1. Update the version in `appinfo.json` and add an entry to [CHANGELOG.md](../CHANGELOG.md).
2. Tag the commit `vX.Y.Z` and create a GitHub release. Do not attach `.ipk` files built with your own keys.
