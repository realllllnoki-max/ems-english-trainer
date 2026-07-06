/*
 * Single source of truth for the VOCAB reel's timing, shared by the
 * composition (index.html, browser <script>) and the build/audio pipeline
 * (build.mjs --kind vocab, evaluated in Node). All times are in SECONDS.
 *
 * Format: 3-word quiz. Each round shows the Japanese word (think time),
 * then reveals the English with native TTS pronunciation.
 */
(function (g) {
  // [id, start, end] — hook, 3 × (question / answer), CTA, loop bridge
  const BEATS = [
    ['b1', 0.0, 1.6],    // hook 「この救急単語言える？」
    ['b2', 1.6, 4.2],    // round 1 — JP word, think time
    ['b3', 4.2, 7.0],    // round 1 — EN answer + pronunciation ×2
    ['b4', 7.0, 9.6],    // round 2 — JP word
    ['b5', 9.6, 12.4],   // round 2 — EN answer
    ['b6', 12.4, 15.0],  // round 3 — JP word
    ['b7', 15.0, 17.8],  // round 3 — EN answer
    ['b8', 17.8, 21.4],  // CTA (same hold as the phrase reel)
    ['b9', 21.4, 24.8],  // loop bridge
  ];
  const TOTAL = 24.8;
  const BPM = 104;

  const beatInterval = 60 / BPM;
  const beatTimes = [];
  for (let b = 0; b < TOTAL - 0.15; b += beatInterval) beatTimes.push(Math.round(b * 1000) / 1000);

  const beat = id => BEATS.find(b => b[0] === id);

  g.REEL = { BEATS, TOTAL, BPM, beatTimes, beat,
    QUESTIONS: ['b2', 'b4', 'b6'], ANSWERS: ['b3', 'b5', 'b7'] };
})(typeof window !== 'undefined' ? window : globalThis);
