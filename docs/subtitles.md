# Subtitles

CineFlix can search subtitles on the internet through [SubDL](https://subdl.com), so you do not have to build that into your own player page.
Subtitles you serve yourself (WebVTT in the stream response, see [Media server API](media-server-api.md)) work separately and need no key.

## Setup

1. Get a free API key at [subdl.com/panel/api](https://subdl.com/panel/api).
2. Put it in `js/config.local.js` as `subdlKey`, or enter it under **Settings > Subtitles**.
3. Set the languages to look for, for example `EN` or `EN,SV`. The first language is listed first.

## Using it

While a title plays, press the **yellow** remote button, or click **CC** with the Magic Remote.
Pick a result: CineFlix downloads it, draws it over the video and remembers the choice for that movie or episode.
Delay buttons shift the timing if a file is slightly off. Results are sorted by your language order, then regular before hearing-impaired.

## How the clock works

Subtitles follow the real video clock and nothing else.

- They **stop when the video pauses**, stalls, buffers or ends, and they **jump when you seek**.
- If the clock goes quiet for more than one second, the text stops rather than guessing.
- For videos CineFlix plays itself, the clock is the video element. For your own web player page, see [Player pages](player-pages.md).

## TV series: season packs

For episodes, SubDL often only has a zip containing a whole season. CineFlix handles this for you:

- Results made for your exact episode come first. Full-season zips follow, labelled "Full season zip, episode N picked for you".
- When you choose one, CineFlix opens the zip and loads only the file for the episode you are watching. It recognises common
  names such as `S01E03`, `1x03`, `[3.10]`, `Episode 3` and `03 - Title`.
- If a pack has no file for your episode, you get a message to try another result, and a wrong episode is never loaded.

## Details

- Search: `GET https://api.subdl.com/api/v1/subtitles` with the TMDB id, `type`, and for series `season_number` and `episode_number`.
- Download: `https://dl.subdl.com{url}`. The API key is stripped from download links; it is not needed to download.
- Formats: SRT and WebVTT, zipped or plain. Legacy encodings are guessed from the language. HTML-style italics are rendered; ASS codes are removed.
- A rejected key shows "SubDL did not accept your API key". Daily download limits are SubDL's and show a clear message.
- Choices are stored in the TV's local storage (the 12 most recent titles).
