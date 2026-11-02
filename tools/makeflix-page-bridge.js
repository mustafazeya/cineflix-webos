/*
 * CineFlix page bridge: add to your player page with <script src="makeflix-page-bridge.js"></script>
 *
 * When the page runs inside the CineFlix TV app it:
 *   - applies remote commands (play/pause/seek/resume) to your <video> element
 *   - reports progress so CineFlix can resume and show Continue Watching
 *   - tells CineFlix when the video ends, so it can start the next episode
 * Outside CineFlix it does nothing.
 *
 * Optional hooks for custom players (set before or after this script loads):
 *   MakeflixBridge.getVideo = function () { return myVideoElement; };
 *   MakeflixBridge.onKey = function (msg) { ... return true to skip the default handling ... };
 *   MakeflixBridge.back();                 // close the player and return to CineFlix
 *   MakeflixBridge.error('message');       // show an error in CineFlix
 */
(function () {
  'use strict';

  var embedded = window.parent && window.parent !== window;
  var bridge = window.MakeflixBridge = window.MakeflixBridge || {};

  function send(msg) {
    if (!embedded) return;
    msg.source = 'makeflix-page';
    window.parent.postMessage(msg, '*');
  }

  bridge.back = function () { send({ type: 'back' }); };
  bridge.error = function (message) { send({ type: 'error', message: String(message || '') }); };

  if (!embedded) return;

  function findVideo() {
    if (typeof bridge.getVideo === 'function') return bridge.getVideo();
    var tagged = document.querySelector('video[data-makeflix]');
    if (tagged) return tagged;
    var best = null;
    var bestArea = 0;
    Array.prototype.forEach.call(document.querySelectorAll('video'), function (v) {
      var r = v.getBoundingClientRect();
      if (r.width * r.height > bestArea) { bestArea = r.width * r.height; best = v; }
    });
    return best;
  }

  var pendingSeek = 0;
  var hooked = null;
  var lastSent = 0;

  function applySeek(v) {
    if (pendingSeek && v.duration && isFinite(v.duration)) {
      v.currentTime = Math.min(pendingSeek, Math.max(0, v.duration - 10));
      pendingSeek = 0;
    }
  }

  function hook() {
    var v = findVideo();
    if (!v || v === hooked) return;
    hooked = v;
    v.addEventListener('loadedmetadata', function () { applySeek(v); });
    // Frequent clock for CineFlix's subtitle search; the slower "progress" message feeds resume.
    // "paused" is true whenever the picture is not actually moving: paused, ended, seeking or buffering.
    var lastTime = 0;
    function moving() { return !(v.paused || v.ended || v.seeking || v.readyState < 3); }
    function sendTime() { lastTime = Date.now(); send({ type: 'time', position: v.currentTime, paused: !moving() }); }
    v.addEventListener('timeupdate', function () {
      var now = Date.now();
      if (now - lastTime >= 250) sendTime();
      if (now - lastSent < 4000) return;
      lastSent = now;
      send({ type: 'progress', position: v.currentTime, duration: v.duration || 0 });
    });
    ['seeking', 'seeked', 'play', 'playing', 'waiting', 'stalled', 'canplay', 'ended', 'ratechange'].forEach(function (name) {
      v.addEventListener(name, sendTime);
    });
    v.addEventListener('pause', function () {
      sendTime();
      send({ type: 'progress', position: v.currentTime, duration: v.duration || 0 });
    });
    // Heartbeat: covers players whose timeupdate events are sparse.
    setInterval(function () { if (moving() && Date.now() - lastTime >= 400) sendTime(); }, 500);
    v.addEventListener('ended', function () { send({ type: 'ended' }); });
    applySeek(v);
  }

  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (e.source !== window.parent || d.source !== 'makeflix') return;
    if (typeof bridge.onKey === 'function' && d.type === 'key' && bridge.onKey(d) === true) return;
    hook();
    var v = hooked;
    if (d.cmd === 'seek-to') {
      pendingSeek = Number(d.value) || 0;
      if (v) applySeek(v);
      return;
    }
    if (!v) return;
    if (d.cmd === 'toggle') { if (v.paused) v.play(); else v.pause(); }
    else if (d.cmd === 'play') v.play();
    else if (d.cmd === 'pause') v.pause();
    else if (d.cmd === 'seek' && v.duration) v.currentTime = Math.max(0, Math.min(v.duration - 1, v.currentTime + Number(d.value || 0)));
  });

  // Players often create their <video> late; keep looking until one exists.
  var tries = 0;
  var timer = setInterval(function () {
    hook();
    if (hooked || ++tries > 120) clearInterval(timer);
  }, 500);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { hook(); send({ type: 'ready' }); });
  else { hook(); send({ type: 'ready' }); }
})();
