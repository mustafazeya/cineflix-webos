# Player pages

If `{Stream URL}/movie/{tmdbId}` returns an HTML page with its own player instead of a video file, CineFlix opens that page
full screen inside the app. Use this when your server already has a web player you like.

Set **Settings > What the Stream URL returns** to *Web page with its own player*, or leave it on *Detect automatically*.

## What CineFlix does for you

- **Remote control.** CineFlix gives the page keyboard focus, so Left, Right and OK reach the page's own player.
  Other keys are also forwarded to the page with `postMessage` (see the protocol below).
- **Back.** The first press shows "Press Back again to return to the movie page"; a second press within 3 seconds closes the player.
  This stops a stray press from dropping the video. Closing by itself (video ended) skips the warning.
- **Clean start.** Every playback gets a brand-new frame, so history from earlier titles can never come back.
- **Subtitles.** The yellow remote key or the **CC** button opens the subtitle search ([Subtitles](subtitles.md)).

## Reading the page's video (no change to your page)

On the webOS versions tested, an app may look inside the frame it opened. CineFlix uses that to find the page's own `<video>`
element, including inside nested frames, and follows its real state. That provides, with **no change to your page**:

- subtitles that follow the real video clock (they stop when the video pauses, stalls or ends, and jump when you seek)
- progress for Continue Watching and resume
- automatic next episode when the video ends

If the platform blocks this (a normal desktop browser does, for example), CineFlix quietly does nothing here and the optional bridge
below still works. Without any clock CineFlix does not guess: no subtitle is drawn and the panel says why.

## The optional page bridge

[`tools/makeflix-page-bridge.js`](../tools/makeflix-page-bridge.js) is a small script for your page. Add one line:

```html
<script src="makeflix-page-bridge.js"></script>
```

It finds your `<video>` element and:

- applies remote commands: OK pauses and plays, Left and Right seek 10 s, rewind and fast-forward seek 30 s
- reports progress, so resume and Continue Watching work
- reports when the video ends, so the next episode can start
- reports the real playback clock, with `paused` true whenever the picture is not moving
- does nothing when the page is opened outside CineFlix

The bridge keeps its original `Makeflix` identifiers (`MakeflixBridge`, `source: 'makeflix'`) so existing pages keep working.

Optional hooks for custom players, set before or after the script loads:

```js
MakeflixBridge.getVideo = function () { return myVideoElement; };
MakeflixBridge.onKey = function (msg) { /* return true to skip the default handling */ };
MakeflixBridge.back();                // close the player and return to CineFlix
MakeflixBridge.error('message');      // show an error in CineFlix
```

## Message protocol

If you prefer to write your own handling, use `window.postMessage`:

| Direction | Message |
|---|---|
| app to page | `{source:'makeflix', type:'key', key:'ArrowLeft', keyCode:37, cmd:'seek', value:-10}`; `cmd` is `toggle`, `play`, `pause`, `seek` (relative seconds) or `seek-to` (absolute, used for resume) |
| page to app | `{source:'makeflix-page', type:'ready'}` |
| | `{source:'makeflix-page', type:'time', position, paused}`, several times per second; `paused` is true whenever the picture is not moving |
| | `{source:'makeflix-page', type:'progress', position, duration}` |
| | `{source:'makeflix-page', type:'ended'}`, `{…type:'back'}`, `{…type:'error', message}` |
