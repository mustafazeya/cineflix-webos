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
js/store.js         settings, watch progress, My List, watched flags, episode marks, thumbs ratings, saved positions of My Videos and MEGA files (localStorage)
js/kids.js          kids profile rules: certification filter, blocked genres, which screens a kids profile may open
js/recs.js          "Because you watched" rows for Home
js/tmdb.js          TMDB client with response caching (every listing goes through the kids filter)
js/server.js        client for your media server (streams, catalog, token handling)
js/nav.js           D-pad spatial navigation and remote key codes
js/ui.js            cards, rows, hero, toast, skeletons
js/icons.js         inline SVG icons (the TV font lacks many symbols)
js/player.js        native video and HLS, page-player mode, progress, next episode card and countdown
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

## Profiles, kids and ratings

- Per-profile data syncs by kind: `list`, `progress`, `watched`, `episode`, `video`, `rating` and `resume`. A removal is a tombstone (`deleted`) for the same key.
  `rating` items use the key `movie:ID` or `tv:ID` and the value `{ id, media_type, title, poster_path, backdrop_path, genre_ids, rating: 1 | -1, ratedAt }`.
- `resume` items remember the playback position of My Videos and MEGA files, which have no TMDB id. The key is `v:<videoId>` for a saved link and
  `m:<videoId>:<nodeId>` for a file inside a saved MEGA link (`nodeId` is the MEGA node handle). A key must match `/^[A-Za-z0-9:._-]{1,64}$/`; a part that is
  too long or has other characters is replaced by the 8-digit hex FNV-1a (32-bit, over UTF-16 code units) hash of that part. The value is
  `{ key, position, duration, title, updatedAt }` (seconds, milliseconds). The player saves at most every 5 s and on close or when the app is hidden, never
  before 10 s, and past 95% the entry is deleted (a tombstone is synced) so the next play starts at 0. A saved position is used when it is over 10 s and more
  than 15 s before the end. Native video, the MEGA stream and hls.js seek once the metadata is ready; a web player page is only resumed (and saved) when it
  reports its progress. Starting over (hold OK on a row that shows `Resume`) deletes the entry. Sync schema 4 downloads older `resume` items once.
- A kids profile (`kids`, `maxRating` G, PG or PG-13) only gets titles whose US certification is at or below the maximum: movies from `release_dates`,
  TV from `content_ratings` (TV-Y, TV-Y7 and TV-G count as G, TV-PG as PG, TV-14 as PG-13). Unrated titles are blocked. Searches and lists are filtered by
  genre first, then checked with one small request per remaining title (cached). Opening a blocked title shows "Not available on this profile".
- Kids profiles hide Browse, My Videos and Settings, and cannot reach the profile picker or Profile page without the profile's PIN (if it has one).
  A normal profile with a PIN asks for it when chosen, and on launch. The PIN is checked by the sync server (`verify-pin`); it is never stored on the TV.
- Press and hold OK (or use the "..." button, or right click) on a Continue Watching card or an episode for its options menu.

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
