// Defaults. Everything here can be overridden from the in-app Settings screen.
window.MF_DEFAULTS = {
  tmdbBase: 'https://api.themoviedb.org/3',
  tmdbImageBase: 'https://image.tmdb.org/t/p/',
  // TMDB v3 API key or v4 read access token.
  tmdbKey: '',
  language: 'en-US',
  region: '',
  // Base URL of your licensed media server (see README for the API contract).
  serverBase: '',
  // Optional: videos are played from {streamBase}/movie/{tmdbId} and {streamBase}/tv/{tmdbId}/{season}/{episode}.
  // Each URL must return the video itself (MP4 or HLS .m3u8).
  streamBase: '',
  // What the Stream URL returns: 'auto' (detect), 'page' (a web page with its own player) or 'video' (MP4/HLS).
  streamType: 'auto',
  // Public https page that wraps YouTube trailers (see trailer-page/). Avoids YouTube error 153 on the TV.
  // SubDL key for the subtitle search (free at subdl.com/panel/api) and the languages to look for.
  subdlKey: '',
  subLangs: 'EN',
  // Where the sync server lives, e.g. 'https://cineflix-sync.example.workers.dev'. Empty keeps the app fully local.
  syncServer: '',
  trailerPage: 'https://www.zeyamustafa.online/movies/trailer.html',
  serverToken: '',
  refreshMinutes: 60
};
