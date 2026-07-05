/*
 * Single source of truth for the reel's timing, shared by the composition
 * (index.html, loaded as a browser <script>) and the build/audio pipeline
 * (build.mjs, which evaluates this file in Node). All times are in SECONDS.
 *
 * The scene cuts and the 104 BPM beat grid are fixed constants, so the
 * synthesized BGM, the SFX, and the visual entrances all lock to the same
 * grid without any runtime beat-detection.
 */
(function (g) {
  // [id, start, end] in seconds — the nine beats of "きょうの1フレーズ"
  const BEATS = [
    ['b1', 0.0, 1.4],    // hook slam
    ['b2', 1.4, 5.0],    // JP phrase — reading time
    ['b3', 5.0, 8.0],    // countdown, 1s per digit — thinking time
    ['b4', 8.0, 11.2],   // kinetic answer, word by word
    ['b5', 11.2, 14.4],  // answer settled EN+JP
    ['b6', 14.4, 17.0],  // patient reply EN
    ['b7', 17.0, 19.4],  // patient reply JP + framework
    ['b8', 19.4, 23.0],  // CTA — held long enough to read the app pitch + link
    ['b9', 23.0, 26.4],  // loop bridge — held long enough to read the closing copy
  ];
  const TOTAL = 26.4;
  const BPM = 104;

  // fixed beat grid — every downbeat from 0 to TOTAL
  const beatInterval = 60 / BPM;
  const beatTimes = [];
  for (let b = 0; b < TOTAL - 0.15; b += beatInterval) beatTimes.push(Math.round(b * 1000) / 1000);

  const beat = id => BEATS.find(b => b[0] === id);

  /* `count` grid points inside [from, until] for quantized word pops.
     Tries half-beats first, then quarter- and eighth-notes, so every word
     still lands on a musical subdivision even in a short scene. */
  function gridTimes(from, count, until) {
    if (beatTimes.length < 2) return null;
    for (const div of [2, 4, 8]) {
      const pts = [];
      for (let i = 0; i < beatTimes.length - 1; i++) {
        const step = (beatTimes[i + 1] - beatTimes[i]) / div;
        for (let k = 0; k < div; k++) pts.push(beatTimes[i] + k * step);
      }
      pts.push(beatTimes[beatTimes.length - 1]);
      const usable = pts.filter(p => p >= from && p <= until);
      if (usable.length >= count) return usable.slice(0, count);
    }
    return null;
  }

  /* Times (seconds) at which each answer word pops in b4. Falls back to an
     even stagger when the grid can't supply enough points. */
  function wordTimes(count) {
    const b4 = beat('b4');
    const grid = gridTimes(b4[1] + 0.15, count, b4[2] - 0.8);
    const stagger = Math.min(0.22, 2.0 / Math.max(1, count));
    return Array.from({ length: count }, (_, i) =>
      grid ? grid[i] : b4[1] + 0.2 + i * stagger);
  }

  g.REEL = { BEATS, TOTAL, BPM, beatTimes, beat, gridTimes, wordTimes };
})(typeof window !== 'undefined' ? window : globalThis);
