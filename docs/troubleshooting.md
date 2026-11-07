# Troubleshooting

## The app asks for a TMDB key
Enter it in Settings, or put it in `js/config.local.js` and reinstall. Use the **read access token** (v4) or the v3 API key from your TMDB account.

## Posters appear but Play says the title is not available
- The Stream URL must be reachable from the TV. `localhost` on the TV is the TV itself; use the server's LAN address.
- A `404` from your server means "not available". Check `{Stream URL}/movie/{tmdbId}` in a browser.
- If the Stream URL and the catalog server differ, the stream server must allow CORS.
- Settings > **Test connections** reports which part fails.

## Video does not start or stutters
Use H.264 or HEVC with AAC in MP4 or HLS. Other codecs may not play on every TV. For HLS, check that segments are reachable and allow Range requests.

## Trailer shows an error
YouTube error 153 means the embed had no referrer; the hosted [trailer page](trailer-page.md) fixes this. If you changed `trailerPage`, check the URL is https and loads in a browser.
Some trailers are blocked by their owners from being embedded, which no setting can fix.

## Subtitle search says "did not accept your API key"
Check the SubDL key under Settings > Subtitles. SubDL also has daily limits; the app shows a message when you hit them.

## Subtitles do not appear for my web player page
On the TV, CineFlix reads the page's `<video>` directly. If the panel says it could not read the page's video time, the page may use a video the app
cannot reach, or the platform blocks reading the frame. Add the [page bridge](player-pages.md#the-optional-page-bridge) to your page.

## Fullscreen (maximize) button does nothing in my player page
CineFlix allows fullscreen for the player page, including after your server redirects it to another address. If it still does nothing, the page may
embed its player in a nested frame that lacks `allowfullscreen`; add `allow="fullscreen"` to that nested frame in your page. While the page is fullscreen,
Back leaves fullscreen first.

## Back leaves the player immediately, or does nothing
In page mode the first Back shows a warning and the second (within 3 seconds) leaves. If Back does nothing, make sure `disableBackHistoryAPI` is `false` in `appinfo.json`.

## `ares-install` cannot reach the TV
Developer Mode must be on and not expired (about 50 hours). Check the IP and that the TV and computer are on the same network.
`./package.sh install my-lg-tv` tries any `my-lg-tv-*` alternates automatically.

## Reset everything
Settings > **Clear watch history** removes progress and Continue Watching. My List and your settings stay. Uninstalling the app removes all local data.
