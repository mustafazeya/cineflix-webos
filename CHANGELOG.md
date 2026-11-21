# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- My Videos and MEGA files remember the playback position (saved at most every 5 s, on close, and not in the first 10 s; a finished video is forgotten). Playing them again resumes with a "Resuming from 12:34" toast, in the native player, the MEGA stream, hls.js and in web player pages that report progress. List rows show a thin progress bar and "Resume 12:34"; hold OK (or right click) on such a row to Start over. The next file of a MEGA folder resumes with its own position. Positions sync per profile as `resume` items (`v:<videoId>` and `m:<videoId>:<nodeId>`), the newest wins, and older data downloads once (sync schema 4)
- Next Episode card in the player: the next episode (or MEGA folder file) is resolved when an episode starts, including the first episode of the next season. In the last 30 seconds of videos longer than 5 minutes a card appears at the bottom right with the still, "S1:E3  Title" and a "Starting in 10" countdown, with Play now and Watch credits. Back or Watch credits dismisses it (the first Back never leaves the player), seeking back re-arms it, and at the real end it returns without a countdown. The finished episode is marked watched
- Next episode control in the player bar for series at any time, and the Channel Up key plays the next episode
- Setting "Autoplay next episode" (On by default); Off keeps the card but never starts the countdown. Stored on the device only, never synced
- Continue Watching options menu (press and hold OK, the "..." button, or right click): mark as watched, or remove from Continue Watching
- Mark a single episode watched or not watched from the season list; Continue Watching follows
- Thumbs up and thumbs down ratings on the details page, synced as `rating` items
- "Because you watched" rows on Home (up to two), from titles you rated up or finished
- Kids profiles with a maximum rating (G, PG, PG-13), kid-safe catalog, search and details, and hidden Browse, My Videos and Settings
- Profile PIN (4 to 6 digits, number keys or on-screen keypad): asked when choosing a PIN profile, and when leaving a kids profile
- Voice search: a mic button next to the Search field. It clears the field and opens the TV keyboard, whose voice key dictates into it, and the search runs when the words arrive

### Fixed
- Position changes that keep coming in while a video plays no longer postpone the background send to the sync server until playback stops
- MEGA streaming: a late buffer event after closing the player no longer throws
- Left and Right in the player controls now step through the buttons in order, so the Next episode button can be reached with the D-pad
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
