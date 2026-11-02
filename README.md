# CineFlix for LG webOS

[![CI](https://github.com/mustafazeya/cineflix-webos/actions/workflows/ci.yml/badge.svg)](https://github.com/mustafazeya/cineflix-webos/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A TV-first streaming catalog for LG webOS, built for the remote's D-pad and the Magic Remote pointer.
Posters, backdrops, cast, trailers and seasons come from [TMDB](https://www.themoviedb.org/).
**Video plays only from a media server that you run and have the rights to use.** No ads, no trackers, no accounts,
no third-party video hosts. Plain HTML, CSS and JavaScript, with no build step and no runtime dependencies.

> **This project does not provide, host, index or link to any video content.** It is a client for your own server.
> You are responsible for having the rights to everything you play. See [Legal](#legal).

The iPhone version lives in [cineflix-ios](https://github.com/mustafazeya/cineflix-ios) and uses the same server contract.

## Features

- Home, Movies, TV Shows, Browse, Search, My List and Already Watched, with a side rail that works with the D-pad and the Magic Remote
- Hero area that follows the focused title, and rows for Trending, Top 10, New Releases, Popular, Top Rated, Coming Soon and genres
- **Browse** with filters: movies or TV, sort, genre, year or decade, actor, minimum rating, hide watched. Endless scrolling
- Details page with rating, runtime, certification, cast, trailer, More Like This, and season and episode browsing
- Player for MP4 and HLS with resume, Continue Watching, auto next episode, quality switching and remote media keys
- Your own **web player page** can be opened full screen inside the app, with the remote, resume and next episode still working
- **Subtitle search** from SubDL for the exact movie or episode, kept in step with the real video clock ([details](docs/subtitles.md))
- Watched tracking (automatic at 95 percent, or manual), per-title My List, everything stored locally on the TV
- Optional server catalog: "Available" badges and a "Recently Added" row for what your server really has

## Requirements

- An LG webOS TV with [Developer Mode](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app) turned on
- [webOS CLI](https://webostv.developer.lge.com/develop/tools/cli-installation) (`ares-*` commands) and Node.js 18 or later
- A free [TMDB](https://www.themoviedb.org/settings/api) API read access token
- A media server that follows the [server contract](docs/media-server-api.md), or the included reference server for testing
- Optional: a free [SubDL](https://subdl.com/panel/api) API key for subtitle search

## Quick start on a desktop browser

```bash
git clone https://github.com/mustafazeya/cineflix-webos.git
cd cineflix-webos

node tools/media-server.js --port 8090     # reference server with a sample library of open-licensed films
npx http-server . -p 8080                  # or any static file server

# Open http://localhost:8080 in Chrome, then in Settings enter:
#   TMDB key:   your read access token
#   Server URL: http://localhost:8090
```

Arrow keys move focus, Enter selects, Esc or Backspace goes back.

## Install on your TV

```bash
ares-setup-device                          # once: register the TV (see docs/deployment.md)
cp js/config.local.example.js js/config.local.js    # put your TMDB token and server URL in it
./package.sh install my-lg-tv              # build, install and launch
```

`js/config.local.js` is git-ignored and is bundled into the `.ipk` so the TV opens straight to Home.
**Never publish an `.ipk` you built with your own keys.** More in [docs/deployment.md](docs/deployment.md).

## Documentation

| Topic | |
|---|---|
| [Configuration](docs/configuration.md) | Every setting, in the app and in `config.local.js` |
| [Media server API](docs/media-server-api.md) | Stream URLs, catalog, reference server, `library.json` |
| [Player pages](docs/player-pages.md) | Using your own web player, the page bridge, message protocol |
| [Subtitles](docs/subtitles.md) | SubDL search, clock rules, season packs |
| [Deployment](docs/deployment.md) | webOS CLI, Developer Mode, installing, several TVs |
| [Architecture](docs/architecture.md) | Code layout, data flow, webOS behaviour worth knowing |
| [Trailer page](docs/trailer-page.md) | Why trailers need a small https page, and how to host your own |
| [Development](docs/development.md) | Running, checking and testing changes |
| [Troubleshooting](docs/troubleshooting.md) | Common problems and fixes |

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md). To report a security problem, see [SECURITY.md](SECURITY.md).

## Legal

- CineFlix contains **no media** and no code that locates, scrapes or bypasses protection on content. It plays what *your* server returns.
- You must have the legal right to store and stream everything you serve. The authors accept no responsibility for how this software is used.
- The sample library uses the Blender Foundation's open movies (Big Buck Bunny, Sintel, Tears of Steel, CC BY 3.0), hosted by third parties.
- This product uses the TMDB API but is not endorsed or certified by TMDB. Subtitles are provided by SubDL, and you must follow their terms.
- LG, webOS and other names are trademarks of their owners. This project is not affiliated with or endorsed by them.

Code is released under the [MIT License](LICENSE). Third-party components and the terms for the name and artwork are listed in [NOTICE.md](NOTICE.md).
