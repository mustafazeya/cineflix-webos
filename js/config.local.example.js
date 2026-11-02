// Copy this file to js/config.local.js and fill in your values.
// config.local.js is git-ignored and gets bundled into the .ipk, so the TV needs no setup.
// Anything set in the in-app Settings screen still overrides these values.
Object.assign(window.MF_DEFAULTS, {
  tmdbKey: 'PASTE_YOUR_TMDB_READ_ACCESS_TOKEN_HERE',
  serverBase: 'http://192.168.1.20:8090',
  // Plays {streamBase}/movie/{tmdbId} and {streamBase}/tv/{tmdbId}/{season}/{episode}
  streamBase: '',
  serverToken: '',
  language: 'en-US',
  region: '',
  subdlKey: ''
});
