# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Continue Watching options menu (press and hold OK, the "..." button, or right click): mark as watched, or remove from Continue Watching
- Mark a single episode watched or not watched from the season list; Continue Watching follows
- Thumbs up and thumbs down ratings on the details page, synced as `rating` items
- "Because you watched" rows on Home (up to two), from titles you rated up or finished
- Kids profiles with a maximum rating (G, PG, PG-13), kid-safe catalog, search and details, and hidden Browse, My Videos and Settings
- Profile PIN (4 to 6 digits, number keys or on-screen keypad): asked when choosing a PIN profile, and when leaving a kids profile
- Voice search: a mic button next to the Search field. It clears the field and opens the TV keyboard, whose voice key dictates into it, and the search runs when the words arrive

### Fixed
- Subtitles stayed hidden when the page's video went fullscreen; they are now drawn on the page's own video while it is fullscreen
- Fullscreen in player pages: the frame now allows fullscreen for the page after a redirect to another address, which was blocked before
- Back leaves fullscreen first, before the "press Back again" warning

## [1.0.0] - 2026-11-02

First public release.

### Added
- Home, Movies, TV Shows, Browse, Search, My List and Already Watched screens with D-pad and Magic Remote navigation
- TMDB catalog with hero, rows, Top 10, details, cast, trailers, seasons and episodes
- Browse filters: type, sort, genre, year or decade, actor, minimum rating, hide watched
- Player for MP4 and HLS with resume, Continue Watching, next episode, quality switching and media keys
- Web player page mode with Back confirmation, direct reading of the page's video, and an optional page bridge
- Subtitle search through SubDL with a real-clock subtitle engine, per-title memory, delay, and season pack handling for series
- Reference media server and sample library of open-licensed films
- Documentation in `docs/`
