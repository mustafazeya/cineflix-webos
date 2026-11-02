# Configuration

Settings come from three layers, from lowest to highest priority:

1. **Defaults** in [`js/config.js`](../js/config.js) (`window.MF_DEFAULTS`).
2. **Your private overrides** in `js/config.local.js`. Copy [`js/config.local.example.js`](../js/config.local.example.js).
   The file is git-ignored and is bundled into the `.ipk` by `package.sh`, so the TV needs no setup on first launch.
3. **In-app Settings**, saved to the TV's local storage. Values saved there always win.

## Options

| Key | Settings field | Default | Meaning |
|---|---|---|---|
| `tmdbKey` | TMDB API key or read access token | empty | v3 API key or v4 read access token from [themoviedb.org](https://www.themoviedb.org/settings/api). Required |
| `language` | Language | `en-US` | TMDB language for titles and descriptions |
| `region` | Region | empty | Region for release dates and certifications, for example `US` |
| `streamBase` | Stream URL | empty | Plays `{url}/movie/{tmdbId}` and `{url}/tv/{tmdbId}/{season}/{episode}` |
| `streamType` | What the Stream URL returns | `auto` | `auto`, `page` (a web page with its own player) or `video` (MP4 or HLS) |
| `serverBase` | Catalog server URL | empty | Optional. Defaults to the Stream URL |
| `serverToken` | Access token | empty | Optional. Sent as a bearer token and as `?token=` on same-origin media URLs |
| `refreshMinutes` | Refresh catalog every | `60` | How often TMDB lists and your catalog are refreshed (minimum 5) |
| `subdlKey` | SubDL API key | empty | Enables subtitle search ([Subtitles](subtitles.md)) |
| `subLangs` | Subtitle languages | `EN` | Comma separated, for example `EN,SV` |
| `trailerPage` | not shown | maintainer's hosted page | https page that wraps YouTube trailers ([Trailer page](trailer-page.md)) |
| `tmdbBase`, `tmdbImageBase` | not shown | TMDB URLs | Override only for a TMDB proxy |

## Example `js/config.local.js`

```js
Object.assign(window.MF_DEFAULTS, {
  tmdbKey: 'YOUR_TMDB_READ_ACCESS_TOKEN',
  streamBase: 'http://192.168.1.20:8090',
  streamType: 'auto',
  subdlKey: '',
  subLangs: 'EN',
  language: 'en-US',
  region: 'US'
});
```

## Keeping secrets safe

Anything in `config.local.js` ends up inside the package you install. A TMDB read token only gives read access to public metadata,
which is acceptable for your own TV, but anyone who has your `.ipk` can read it. Do not publish packages you built with your own keys.
Both `js/config.local.js` and `*.ipk` are in `.gitignore`.
