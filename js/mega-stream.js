(function () {
  'use strict';

  // Plays a MEGA file in the app's own <video>, so it gets exactly the same controls as everything else (pause, 10 s skips,
  // a clickable progress bar, subtitles). The decrypted file is fed to the video piece by piece through Media Source, which
  // works whether the file's index ("moov") is at the start or at the very end, and seeking fetches only what is needed.
  //   MF.megaStream.attach(video, download, { onError(message) })  ->  { ready: Promise, destroy() }
  // `ready` rejects when the file cannot be streamed this way (not an MP4, a codec this TV lacks, no index); the error then
  // may carry .codecs. The caller falls back to the hosted player page.
  var MF = window.MF;
  var MP4BOX = 'js/vendor/mp4box.min.js';
  var loading = null;

  function loadMp4box() {
    if (window.MP4Box) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = MP4BOX;
      s.onload = resolve;
      s.onerror = function () { loading = null; reject(new Error('Could not load MP4 support')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function attach(v, dl, opts) {
    opts = opts || {};
    var CH = 4 * 1048576, PROBE = 2 * 1048576, AHEAD = 50, BEHIND = 25;
    var size = dl.size;
    var mp4 = null, ms = null, url = null, timer = null;
    var tracks = [];
    var loadPos = 0, gen = 0, busy = false, eof = false, dead = false, lastRestart = 0, lastAppendAt = 0;
    var listeners = [];

    function on(name, fn) { v.addEventListener(name, fn); listeners.push([name, fn]); }
    function die(text) { if (dead) return; dead = true; if (opts.onError) opts.onError(text); }

    // The decrypted bytes start..end (inclusive) as their own ArrayBuffer.
    function readPlain(start, end, attempt) {
      attempt = attempt || 0;
      return MF.mega.range(dl, start, end).then(function (u8) {
        return u8.byteOffset === 0 && u8.buffer.byteLength === u8.length ? u8.buffer : u8.slice().buffer;
      }, function (e) {
        if (attempt >= 3) throw e;
        return new Promise(function (ok) { setTimeout(ok, 700 * (attempt + 1)); }).then(function () { return readPlain(start, end, attempt + 1); });
      });
    }

    // Reads from the start until mp4box has found the index, following it to the end of the file when it is there.
    function probe() {
      return new Promise(function (resolve, reject) {
        var got = false, pos = 0, rounds = 0;
        mp4.onError = function (e) { reject(new Error(String(e))); };
        mp4.onReady = function (i) { got = true; resolve(i); };
        (function step() {
          if (got || dead) return;
          if (rounds++ > 60 || pos >= size) { reject(new Error('no index in file')); return; }
          var end = Math.min(size - 1, pos + PROBE - 1);
          readPlain(pos, end).then(function (ab) {
            ab.fileStart = pos;
            var next = mp4.appendBuffer(ab);
            if (got) return;
            pos = (typeof next === 'number' && next > pos) ? next : end + 1;
            step();
          }, reject);
        })();
      });
    }

    function rangeAt(t, sb) {
      var b = sb.buffered;
      for (var i = 0; i < b.length; i++) if (b.start(i) - 0.35 <= t && b.end(i) > t) return b.end(i);
      return -1;
    }
    function aheadSeconds() {
      var min = Infinity;
      tracks.forEach(function (t) { var e = rangeAt(v.currentTime, t.sb); min = Math.min(min, e < 0 ? 0 : e - v.currentTime); });
      return min === Infinity ? 0 : min;
    }
    function isBuffered(t) { return tracks.every(function (x) { return rangeAt(t, x.sb) >= 0; }); }

    function drain(t) {
      if (dead || t.sb.updating || !t.queue.length || ms.readyState === 'closed') return;
      var seg = t.queue.shift();
      try { t.sb.appendBuffer(seg.buffer); lastAppendAt = Date.now(); }
      catch (e) {
        if (e && e.name === 'QuotaExceededError') { t.queue.unshift(seg); trim(8); return; }
        die('This video could not be played here.');
        return;
      }
      if (seg.id !== undefined) mp4.releaseUsedSamples(seg.id, seg.next);
    }

    // Removing buffered video also removes every frame that depends on the removed ones, up to the next keyframe.
    // So the cut must land on a keyframe, or it would eat the frames being played.
    function keyframeAtOrBefore(rec, t) {
      var syncs = rec.syncs, lo = 0, hi = syncs.length - 1, best = -1;
      while (lo <= hi) { var mid = (lo + hi) >> 1; if (syncs[mid] <= t) { best = mid; lo = mid + 1; } else hi = mid - 1; }
      return best < 0 ? 0 : syncs[best];
    }

    function trim(keep) {
      tracks.forEach(function (t) {
        if (t.sb.updating || !t.sb.buffered.length) return;
        var cut = v.currentTime - (keep || BEHIND);
        if (t.syncs) cut = keyframeAtOrBefore(t, cut);
        if (cut > t.sb.buffered.start(0) + 1) { try { t.sb.remove(t.sb.buffered.start(0), cut); } catch (e) { /* retried on the next update */ } }
      });
    }

    function finish() {
      if (!eof || dead) return;
      if (tracks.some(function (t) { return t.sb.updating || t.queue.length; })) return;
      if (ms.readyState === 'open') { try { ms.endOfStream(); } catch (e) { /* already ended */ } }
    }

    function pump() {
      if (dead || busy || eof) return;
      if (tracks.some(function (t) { return t.queue.length > 6; })) return;
      if (aheadSeconds() > AHEAD) return;
      busy = true;
      var mine = gen, start = loadPos, end = Math.min(size - 1, start + CH - 1);
      readPlain(start, end).then(function (ab) {
        if (mine !== gen || dead) return;
        ab.fileStart = start;
        var last = end >= size - 1;
        mp4.appendBuffer(ab, last);
        loadPos = end + 1;
        if (last) { mp4.flush(); eof = true; }
        busy = false;
        tracks.forEach(drain);
        finish();
        pump();
      }).catch(function () {
        if (mine !== gen) return;
        busy = false;
        die('MEGA stopped sending this video. It may have reached its transfer limit; try again later.');
      });
    }

    // mp4box's own seek() skips bytes it believes it still holds, but their samples were already released.
    // So the file position is worked out here from the sample tables, and all half-built state is dropped.
    function seekTo(t) {
      var off = Infinity, from = Infinity;
      tracks.forEach(function (x) {
        var trak = mp4.getTrackById(x.id);
        mp4.releaseUsedSamples(x.id, trak.samples.length);
        mp4.fragmentedTracks.forEach(function (f) { if (f.id === x.id) f.segmentStream = null; });
        var r = mp4.seekTrack(t, true, trak);
        trak.lastValidSample = trak.nextSample;
        off = Math.min(off, r.offset);
        from = Math.min(from, r.time);
      });
      return { offset: off === Infinity ? 0 : off, time: from === Infinity ? 0 : from };
    }

    // Loading again over frames that are already buffered up to the playhead would replace what is being decoded and
    // freeze playback, so in that case everything is dropped first and the video is refilled from a keyframe.
    function clearBuffers() {
      tracks.forEach(function (x) {
        x.queue = x.queue.filter(function (q) { return q.id === undefined; });
        if (x.sb.updating) { x.wantClear = true; return; }
        try { x.sb.remove(0, Number(ms.duration) || 1e9); } catch (e) { /* nothing buffered */ }
      });
    }

    function restartAt(t) {
      lastRestart = Date.now();
      gen++; busy = false; eof = false;
      tracks.forEach(function (x) { x.queue = x.queue.filter(function (q) { return q.id === undefined; }); });
      var at = seekTo(t);
      var overlaps = tracks.some(function (x) {
        var b = x.sb.buffered;
        for (var i = 0; i < b.length; i++) if (b.end(i) > at.time + 0.05 && b.start(i) < t) return true;
        return false;
      });
      if (overlaps) clearBuffers();
      loadPos = at.offset;
      pump();
    }

    function onSeek() {
      if (dead || !tracks.length) return;
      if (isBuffered(v.currentTime)) { pump(); return; }
      restartAt(v.currentTime);
    }

    // Playback is about to run dry. If loading is not feeding the playhead (it jumped past a gap earlier, or the network
    // stalled), restart loading from the playhead.
    function onWaiting() {
      if (dead || !tracks.length || v.ended) return;
      var t = v.currentTime, ahead = Infinity;
      tracks.forEach(function (x) { var e = rangeAt(t, x.sb); ahead = Math.min(ahead, e < 0 ? 0 : e - t); });
      if (ahead > 1.0) { pump(); return; }
      if (eof && t >= Number(ms.duration) - 0.5) return;
      if (Date.now() - Math.max(lastRestart, lastAppendAt) > 1200) restartAt(t); else pump();
    }

    function destroy() {
      dead = true;
      clearInterval(timer);
      listeners.forEach(function (l) { v.removeEventListener(l[0], l[1]); });
      listeners = [];
      if (ms && ms.readyState === 'open') { try { ms.endOfStream(); } catch (e) { /* already closed */ } }
      if (url) { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } url = null; }
    }

    var ready = loadMp4box().then(function () {
      if (dead) throw new Error('closed');
      if (!window.MediaSource) throw new Error('no streaming');
      mp4 = window.MP4Box.createFile();
      ms = new MediaSource();
      return probe();
    }).then(function (i) {
      if (dead) throw new Error('closed');
      var vt = i.videoTracks[0], at = i.audioTracks[0];
      if (!vt) throw new Error('no video track');
      var wanted = [{ t: vt, type: 'video' }].concat(at ? [{ t: at, type: 'audio' }] : []);
      var mimes = wanted.map(function (w) { return w.type + '/mp4; codecs="' + w.t.codec + '"'; });
      var bad = mimes.filter(function (m) { return !MediaSource.isTypeSupported(m); });
      if (bad.length) { var e = new Error('codec'); e.codecs = bad; throw e; }
      return new Promise(function (resolve, reject) {
        ms.addEventListener('sourceopen', function () {
          try {
            ms.duration = i.duration / i.timescale;
            wanted.forEach(function (w, n) {
              var sb = ms.addSourceBuffer(mimes[n]);
              var rate = w.t.nb_samples / Math.max(1, w.t.duration / w.t.timescale);
              var rec = { sb: sb, queue: [], id: w.t.id };
              if (w.type === 'video') {
                rec.syncs = [];
                mp4.getTrackById(w.t.id).samples.forEach(function (smp) { if (smp.is_sync) rec.syncs.push(smp.cts / smp.timescale); });
              }
              tracks.push(rec);
              mp4.setSegmentOptions(w.t.id, rec, { nbSamples: Math.max(1, Math.round(rate * 4)) });
              sb.addEventListener('updateend', function () {
                if (rec.wantClear) { rec.wantClear = false; try { sb.remove(0, Number(ms.duration) || 1e9); } catch (e2) { /* nothing buffered */ } return; }
                drain(rec); trim(); finish(); pump();
              });
            });
            mp4.initializeSegmentation().forEach(function (init) {
              var rec = tracks.filter(function (x) { return x.id === init.id; })[0];
              rec.queue.push({ buffer: init.buffer });
            });
            mp4.onSegment = function (id, user, buffer, next) { user.queue.push({ buffer: buffer, id: id, next: next }); drain(user); };
            mp4.start();
            loadPos = mp4.seek(0, true).offset;
            tracks.forEach(drain);
            resolve();
          } catch (e3) { reject(e3); }
        }, { once: true });
        url = URL.createObjectURL(ms);
        v.src = url;
      });
    }).then(function () {
      on('seeking', onSeek);
      on('timeupdate', pump);
      on('waiting', onWaiting);
      // Watchdog: data buffered ahead but the picture not moving means the decoder needs a nudge (a re-seek to the same time).
      var lastT = -1, same = 0;
      timer = setInterval(function () {
        if (v.paused || v.ended) { same = 0; return; }
        same = Math.abs(v.currentTime - lastT) < 0.01 ? same + 1 : 0;
        lastT = v.currentTime;
        if (same >= 2 && isBuffered(v.currentTime + 1)) { same = 0; v.currentTime = v.currentTime; return; }
        if (v.readyState < 4) onWaiting();
      }, 700);
      pump();
      // The player asked to play before this stream existed, which browsers drop; start it now that data is coming.
      var started = v.play();
      if (started && started.catch) started.catch(function () { /* autoplay may need a key press; the controls handle that */ });
    });

    return { ready: ready, destroy: destroy };
  }

  MF.megaStream = { attach: attach };
})();
