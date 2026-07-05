/**
 * Audio synthesis for the daily reel: a beat-locked BGM (kick / hat / bass)
 * plus SFX aligned to the visual timeline (slam boom, countdown beeps, word
 * pops, answer bell, loop riser). Everything is synthesized sample-by-sample
 * with a seeded PRNG, so output is deterministic and license-free.
 *
 * Exports synthBaseTrack(timeline, outPath) -> writes a 44.1kHz 16-bit WAV.
 */
import fs from 'node:fs';

const SR = 44100;

/* deterministic noise */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function synthBaseTrack(timeline, outPath) {
  const { beats, total, wordTimes, beatTimes } = timeline;
  const n = Math.ceil((total / 1000) * SR);
  const buf = new Float64Array(n);
  const rand = mulberry32(20260703);

  const at = ms => Math.max(0, Math.round((ms / 1000) * SR));
  const beatOf = id => beats.find(b => b[0] === id);

  /* ---------- primitive voices ---------- */
  function addTone(tMs, { f0, f1 = null, durMs, gain, decayMs, harmonics = [], attackMs = 4 }) {
    const start = at(tMs), len = Math.min(Math.round((durMs / 1000) * SR), n - start);
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / SR;
      const p = i / len;
      const f = f1 === null ? f0 : f0 + (f1 - f0) * p;
      phase += (2 * Math.PI * f) / SR;
      let s = Math.sin(phase);
      for (const [mult, g] of harmonics) s += g * Math.sin(phase * mult);
      const env = Math.min(1, (i / SR) / (attackMs / 1000)) * Math.exp(-tt / (decayMs / 1000));
      buf[start + i] += s * env * gain;
    }
  }
  function addNoise(tMs, { durMs, gain, decayMs = null, rise = false, bright = false }) {
    const start = at(tMs), len = Math.min(Math.round((durMs / 1000) * SR), n - start);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const white = rand() * 2 - 1;
      const s = bright ? white - prev : (prev = prev * 0.92 + white * 0.08);
      if (bright) prev = white;
      const p = i / len;
      const env = rise ? p * p : (decayMs ? Math.exp(-(i / SR) / (decayMs / 1000)) : Math.sin(Math.PI * p));
      buf[start + i] += s * env * gain;
    }
  }
  const kick = (tMs, g = 0.42) => addTone(tMs, { f0: 130, f1: 44, durMs: 140, decayMs: 65, gain: g, attackMs: 1 });
  const hat = (tMs, g = 0.09) => addNoise(tMs, { durMs: 40, decayMs: 16, gain: g, bright: true });
  const bass = (tMs, f, g = 0.16) => addTone(tMs, { f0: f, durMs: 420, decayMs: 260, gain: g, harmonics: [[2, 0.25]] });
  const beep = (tMs, f, g = 0.26) => addTone(tMs, { f0: f, durMs: 240, decayMs: 120, gain: g, harmonics: [[3, 0.12]] });
  const pop = (tMs, f, g = 0.2) => addTone(tMs, { f0: f, f1: f * 1.7, durMs: 80, decayMs: 45, gain: g, attackMs: 2 });
  const bell = (tMs, g = 0.3) => {
    addTone(tMs, { f0: 880, durMs: 700, decayMs: 300, gain: g });
    addTone(tMs, { f0: 1760, durMs: 400, decayMs: 140, gain: g * 0.4 });
    addTone(tMs, { f0: 2637, durMs: 200, decayMs: 70, gain: g * 0.18 });
  };
  const boom = (tMs, g = 0.5) => {
    addTone(tMs, { f0: 95, f1: 52, durMs: 380, decayMs: 170, gain: g, attackMs: 1 });
    addNoise(tMs, { durMs: 70, decayMs: 28, gain: g * 0.5, bright: true });
  };
  const swoosh = (tMs, g = 0.14) => addNoise(tMs, { durMs: 260, gain: g });
  const riser = (tMs, durMs, g = 0.24) => {
    addNoise(tMs, { durMs, gain: g, rise: true });
    addTone(tMs, { f0: 220, f1: 950, durMs, decayMs: durMs * 2, gain: g * 0.5 });
  };

  /* ---------- BGM: kick / hat / bass locked to the beat grid ---------- */
  // duck the backing track while a TTS voice speaks: the mascot's opening hook
  // (~0.1–1.9s) and the English phrase + reply (b5 through b7)
  const voiceWindows = [[100, 1900], [beatOf('b5')[1], beatOf('b7')[2]]];
  const duck = tMs => (voiceWindows.some(([a, b]) => tMs >= a && tMs < b) ? 0.5 : 1);
  const bassNotes = [65.41, 65.41, 49.0, 58.27]; // C2 C2 G1 Bb1
  (beatTimes || []).forEach((b, k) => {
    const d = duck(b);
    kick(b, 0.4 * d);
    bass(b, bassNotes[k % 4], 0.15 * d);
    const next = beatTimes[k + 1];
    if (next) hat((b + next) / 2, 0.09 * d);
  });

  /* ---------- SFX on the visual timeline ---------- */
  boom(60);                                    // opening flash impact
  kick(150, 0.55);                             // slam lands
  swoosh(beatOf('b2')[1]);                     // question slides in
  const b3 = beatOf('b3');
  const digit = (b3[2] - b3[1]) / 3;
  beep(b3[1], 660); beep(b3[1] + digit, 660); beep(b3[1] + 2 * digit, 880);
  boom(beatOf('b4')[1], 0.4);                  // answer cut
  (wordTimes || []).forEach((w, i) => pop(w, 460 + i * 36));
  bell(beatOf('b5')[1]);                       // settled answer
  swoosh(beatOf('b6')[1]);
  swoosh(beatOf('b7')[1], 0.1);
  const b8 = beatOf('b8');
  beep(b8[1], 523, 0.2); beep(b8[1] + 130, 659, 0.2); beep(b8[1] + 260, 784, 0.22); // CTA jingle
  pop(beatOf('b9')[1], 520, 0.18);
  riser(total - 650, 640);                     // into the loop flash

  /* ---------- master: soft-normalize and write WAV ---------- */
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const scale = peak > 0.92 ? 0.92 / peak : 1;
  const pcm = Buffer.alloc(44 + n * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write('WAVE', 8);
  pcm.write('fmt ', 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28);
  pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36); pcm.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i] * scale)) * 32767), 44 + i * 2);
  }
  fs.writeFileSync(outPath, pcm);
}
