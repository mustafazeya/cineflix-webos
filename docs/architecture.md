# Architecture

CineFlix is a static web app. There is no build step, no bundler and no runtime dependency, so the files in this repository are the files the TV runs.

```
appinfo.json        webOS manifest (id, icons, permissions, Back-key behaviour)
index.html          all screens: home, browse, details, search, settings, player, trailer
css/app.css         1920x1080 styles, focus states, skeleton loaders
fonts/              Inter (SIL OFL), self-hosted so the TV needs no font download
icons/              app icon, launcher icon, logo marks
js/config.js        defaults (MF_DEFAULTS)
js/config.local.js  your private overrides (git-ignored)
js/store.js         settings, watch progress, My List, watched flags (localStorage)
js/tmdb.js          TMDB client with response caching
js/server.js        client for your media server (streams, catalog, token handling)
js/nav.js           D-pad spatial navigation and remote key codes
js/ui.js            cards, rows, hero, toast, skeletons
js/icons.js         inline SVG icons (the TV font lacks many symbols)
js/player.js        native video and HLS, page-player mode, progress, next episode
js/subs.js          SubDL search, parsing, the subtitle clock and its panel
js/explore.js       Browse screen (TMDB discover filters)
js/app.js           router and all screens, Back handling
js/vendor/          fflate (MIT), used to open subtitle zips
tools/              reference media server, sample library, optional page bridge
package.sh          builds the .ipk and installs it
```

Scripts are plain ES5-style files that attach to a global `MF` object. They load in the order listed in `index.html`.

## Data flow

1. `app.js` starts, reads settings from `store.js`, and asks `tmdb.js` for the rows on the Home screen.
2. When you pick a title, details are fetched in parallel with the catalog, so the page opens quickly. Images and logos are prefetched when a card gets focus.
3. Play asks `server.js` for the stream: either a Stream URL (`{base}/movie/{id}`), or a catalog server (`/streams/...`).
4. `player.js` plays MP4 or HLS natively, or opens a web page in a frame (see [Player pages](player-pages.md)).
5. Progress is saved to local storage every few seconds, which drives Continue Watching, resume and the watched state.
6. `subs.js` listens for the clock from the player and draws the current subtitle line.

## Navigation

`nav.js` implements spatial navigation: every element with the `focusable` class can receive focus and the arrow keys move to the nearest one in
that direction. The Magic Remote pointer works through ordinary mouse events, and the wheel scrolls lists.

## webOS behaviour worth knowing

These were found by testing on a real TV and shape the code. Behaviour can differ between webOS versions and models.

- The app runs from `file://`. YouTube rejects embeds without a referrer (error 153), which is why trailers use a [hosted wrapper page](trailer-page.md).
- The Back key arrives as a browser history step (`disableBackHistoryAPI` is `false`). A sentinel history entry in `app.js` catches it, so Back works
  even when an embedded player page has keyboard focus and the app receives no key event.
- Keys go only to the focused frame. CineFlix gives the player page focus so Left, Right and OK reach it.
- The app may read the DOM of a cross-origin frame it opened, and fetch without CORS works. CineFlix uses this to follow a page's `<video>`
  (see [Player pages](player-pages.md)). A desktop browser blocks this, so the code treats it as optional.
- The Luna media pipeline service is not available to a normal app, so playback state is read from the video element instead.
- The TV font lacks many Unicode symbols, so all icons are inline SVG.
- Every playback in page mode gets a brand-new iframe; reusing one keeps old history that the Back key would walk through.

## Design rules

- Neutral near-black palette. White is the focus colour. The coral accent is used only for the logo, progress and the active marker.
- No emoji or symbol characters outside basic Latin in the UI.
- Layout is fixed at 1920x1080 and scaled by the TV.
