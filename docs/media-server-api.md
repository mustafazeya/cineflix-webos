# Media server API

CineFlix plays video only from a server you control. There are two ways to connect it; you can use either or both.
The [iPhone app](https://github.com/mustafazeya/cineflix-ios) uses the same contract.

## Option A: Stream URL (simplest)

Set **Stream URL** in Settings, or `streamBase` in `js/config.local.js`. The app plays:

```
{Stream URL}/movie/{tmdbId}
{Stream URL}/tv/{tmdbId}/{season}/{episode}
```

- Each URL returns either the video itself (MP4 or HLS `.m3u8`, directly or through a redirect) or a web page with its own player ([Player pages](player-pages.md)).
- `404` means "not available" and the app shows a message.
- If the stream server has a different address from the catalog server, its responses must allow CORS.
- With only a Stream URL, the catalog comes from `{Stream URL}/catalog` when your server provides it. That gives the Available badges and the "Recently Added" row.
  A `404` or non-JSON response there means every title stays playable.
- The reference server below supports these routes too, so `http://<server-ip>:8090` works as a Stream URL.

**Settings > What the Stream URL returns** chooses between *Detect automatically* (default), *Web page with its own player* and *Video file / HLS stream*.

## Option B: Catalog server

Point the app at any server that implements these endpoints. All responses are JSON and must allow CORS from the TV.
If you set an access token, the app sends `Authorization: Bearer <token>` on API calls and appends `?token=<token>`
to media URLs on the same origin, because a `<video>` element cannot send headers.

### `GET /catalog`

Every title you can play. Used for the "Recently Added" row, the Available badges and enabling Play.

```json
{ "items": [
  { "tmdbId": 10378, "type": "movie", "addedAt": "2026-11-01T12:00:00Z" },
  { "tmdbId": 1399,  "type": "tv",    "addedAt": "2026-10-20T09:00:00Z" }
] }
```

### `GET /streams/movie/{tmdbId}` and `GET /streams/tv/{tmdbId}/{season}/{episode}`

```json
{
  "sources": [
    { "url": "https://media.example.com/hls/10378/master.m3u8", "type": "hls", "label": "Auto" },
    { "url": "/media/10378/1080p.mp4", "type": "mp4", "label": "1080p" }
  ],
  "subtitles": [
    { "url": "/media/10378/en.vtt", "lang": "en", "label": "English" }
  ]
}
```

- `type` is `hls` or `mp4`. If omitted it is inferred from the URL.
- Relative URLs are resolved against the server URL.
- The first source plays first. The others are offered under **Quality** and used as automatic fallbacks.
- Subtitles from your server must be **WebVTT**. (Subtitles from the internet are a separate feature, see [Subtitles](subtitles.md).)
- Return `404` when a title is not available.

## Reference server

`tools/media-server.js` is a zero-dependency Node server that implements this API from `tools/library.json`. It is meant for
development and as a template; it is not hardened for exposure to the internet.

```bash
node tools/media-server.js --port 8090 --library tools/library.json --media ./media
MEDIA_TOKEN=secret node tools/media-server.js      # require a token
```

- `library.json` lists `movies[]` and `tv[]` by TMDB id. Each source is a remote `url` or a local `file` inside `--media`.
- Local files are served with HTTP Range support, so seeking works.
- The library is re-read on every request. Add a title and the app picks it up at the next refresh.

```json
{
  "movies": [
    { "tmdbId": 603692, "addedAt": "2026-11-01T00:00:00Z",
      "sources": [{ "file": "movies/603692/master.m3u8", "type": "hls", "label": "Auto" }],
      "subtitles": [{ "file": "movies/603692/en.vtt", "lang": "en", "label": "English" }] }
  ],
  "tv": [
    { "tmdbId": 1399, "addedAt": "2026-11-01T00:00:00Z",
      "episodes": { "1x1": { "sources": [{ "file": "tv/1399/s01e01.mp4", "label": "1080p" }] } } }
  ]
}
```

The bundled `tools/library.json` points at the Blender Foundation's open movies (CC BY 3.0), served from third-party test hosts.

## Codecs

Use H.264 or HEVC video with AAC audio in MP4 or HLS. LG webOS TVs play these natively.

## Reaching the server from the TV

`localhost` on the TV means the TV itself. Use an address the TV can reach, such as `http://192.168.1.20:8090`.
Serve over HTTPS if the server is on the internet and protect it with the access token or your own authentication.
