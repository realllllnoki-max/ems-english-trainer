#!/usr/bin/env node
/**
 * Daily TikTok / Instagram Reel generator for 机のいらない救急英語,
 * built on HyperFrames (HTML -> deterministic MP4).
 *
 * Two reel kinds, same look & feel:
 *   phrase (default) — "きょうの1フレーズ": one full question + patient reply
 *   vocab            — "きょうの救急単語": 3-word JP->EN quiz from VOCAB
 *
 * Pipeline:
 *   1. pick the day's content from ems-data.js, deterministically by date
 *   2. synthesize the narration TTS at a FIXED speaking rate, measure it,
 *      and stretch the beats that host speech so everything fits — the
 *      reading speed never varies with text length; the video length does
 *   3. synthesize the audio bed (beat-locked BGM/SFX + the TTS clips) on
 *      that stretched timeline into <project>/audio.wav
 *   4. render <project>/render.html (index.html with data-duration rewritten
 *      to the stretched total) via `hyperframes render`, passing the text and
 *      the stretched beat schedule as composition --variables
 *   5. write the post caption (.txt)
 *
 * Same date -> same video (content is date-seeded; audio synth is PRNG-seeded).
 *
 * Usage:
 *   node build.mjs                      # today's phrase reel -> output/YYYY-MM-DD.mp4
 *   node build.mjs --kind vocab         # today's vocab reel  -> output/YYYY-MM-DD-vocab.mp4
 *   node build.mjs --date 2026-07-10    # a specific day
 *   node build.mjs --index 42           # force a phrase card / vocab offset
 *   node build.mjs --quality draft      # faster, lower-bitrate iteration
 *   node build.mjs --silent             # silent bed (post with trend audio)
 *   node build.mjs --audio-only         # just write <project>/audio.wav (for preview)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { synthBaseTrack, synthVocabTrack } from './audio.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);
const FONT_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf';

/* Voices. The mascot (rescue dog) speaks the opening hook — a bright, high,
 * cute delivery (Nanami pitched well up). English content uses a clear en-US
 * model voice so it doubles as pronunciation practice.
 * Tweak DOG_VOICE.pitch to taste (higher Hz = cuter/smaller). */
const DOG_VOICE = { name: 'ja-JP-NanamiNeural', pitch: '+40Hz', rate: '-12%' };
const EN_VOICE = 'en-US-JennyNeural';
const HOOKS = { phrase: 'この救急英語言える？', vocab: 'この救急単語言える？' };

/* ---------- CLI args ---------- */
const args = process.argv.slice(2);
const arg = (name, fb) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fb; };
const kind = arg('kind', 'phrase');
if (!['phrase', 'vocab'].includes(kind)) { console.error(`unknown --kind ${kind}`); process.exit(1); }
const dateStr = arg('date', new Date().toISOString().slice(0, 10));
const forcedIndex = arg('index', null);
const quality = arg('quality', 'high');
const fps = arg('fps', '60'); // 60fps for premium smoothness (data-fps is only a hint to the renderer)
const silent = args.includes('--silent');
const audioOnly = args.includes('--audio-only');

const PROJECT = path.join(HERE, kind === 'vocab' ? 'vocab' : 'reel');

/* ---------- shared timeline (single source of truth per project) ---------- */
function loadTimeline() {
  const src = fs.readFileSync(path.join(PROJECT, 'timeline.js'), 'utf8');
  const g = {};
  new Function('window', src)(g);        // timeline.js attaches window.REEL
  return g.REEL;
}
const R = loadTimeline();
const epochDay = Math.floor(Date.parse(dateStr + 'T00:00:00Z') / 86400000);

/* ---------- content from the app's own data ---------- */
function loadCards() {
  const src = fs.readFileSync(path.join(REPO, 'ems-data.js'), 'utf8');
  const { SCENES, FRAMEWORKS } = new Function(src + '; return { SCENES, FRAMEWORKS };')();
  const cards = [];
  for (const scene of SCENES) {
    for (const node of Object.values(scene.nodes || {})) {
      if (!node.q || !node.qjp || !node.a || !node.ajp) continue;
      if (node.q.split(' ').length > 12) continue; // keep phrases readable
      const fw = FRAMEWORKS[scene.framework];
      const step = fw?.steps?.find(s => s.k === node.step);
      cards.push({
        q: node.q, qjp: node.qjp, a: node.a, ajp: node.ajp,
        framework: fw?.name || scene.framework || '',
        stepWord: step?.word || node.step || '',
        sceneTitle: scene.title, sceneEn: scene.en,
      });
    }
  }
  return cards;
}
function pickCard() {
  const cards = loadCards();
  const idx = forcedIndex !== null
    ? Number(forcedIndex) % cards.length
    : ((epochDay * 613) % cards.length + cards.length) % cards.length; // prime stride
  console.log(`Card ${idx}/${cards.length}: [${cards[idx].sceneTitle}] ${cards[idx].q}`);
  return cards[idx];
}

/* vocab: one category per day (cycling), 3 words spread across that category */
function pickVocab() {
  const src = fs.readFileSync(path.join(REPO, 'ems-data.js'), 'utf8');
  const { VOCAB } = new Function(src + '; return { VOCAB };')();
  const byCat = new Map();
  for (const w of VOCAB) {
    if (w.cat === '問診表現') continue;    // sentences — that's the phrase reel's job
    if (!byCat.has(w.cat)) byCat.set(w.cat, []);
    byCat.get(w.cat).push(w);
  }
  const cats = [...byCat.keys()];
  const cat = cats[((epochDay % cats.length) + cats.length) % cats.length];
  const pool = byCat.get(cat);
  const base = forcedIndex !== null ? Number(forcedIndex) : epochDay * 7;
  const stride = Math.floor(pool.length / 3);
  const words = [0, 1, 2].map(k => pool[(((base + k * stride) % pool.length) + pool.length) % pool.length]);
  console.log(`Vocab [${cat}]: ${words.map(w => w.en).join(' / ')}`);
  return { cat, words };
}

/* ---------- binaries: reuse the sandbox's ffmpeg/ffprobe/chromium ---------- */
function ffmpegPath() {
  if (process.env.HYPERFRAMES_FFMPEG_PATH) return process.env.HYPERFRAMES_FFMPEG_PATH;
  try { return require('@ffmpeg-installer/ffmpeg').path; } catch { return 'ffmpeg'; }
}
function ffprobePath() {
  if (process.env.HYPERFRAMES_FFPROBE_PATH) return process.env.HYPERFRAMES_FFPROBE_PATH;
  try { return require('@ffprobe-installer/ffprobe').path; } catch { return 'ffprobe'; }
}
/* We install with `ignore-scripts` (see .npmrc) to skip a network-gated native
 * download, but that also skips @ffprobe-installer's chmod. Restore the exec bit
 * on the bundled binaries so HyperFrames can probe media / encode. */
function ensureExecutable(p) {
  try { if (p && fs.existsSync(p)) fs.chmodSync(p, 0o755); } catch { /* best effort */ }
}
function headlessShellPath() {
  if (process.env.PRODUCER_HEADLESS_SHELL_PATH) return process.env.PRODUCER_HEADLESS_SHELL_PATH;
  const roots = ['/opt/pw-browsers', process.env.PLAYWRIGHT_BROWSERS_PATH].filter(Boolean);
  for (const root of roots) {
    let dirs = [];
    try { dirs = fs.readdirSync(root); } catch { continue; }
    for (const d of dirs.filter(x => x.startsWith('chromium_headless_shell'))) {
      const p = path.join(root, d, 'chrome-linux', 'headless_shell');
      if (fs.existsSync(p)) return p;
    }
  }
  return null; // let HyperFrames locate/download its own (CI has open egress)
}
function hyperframesBin() {
  const local = path.join(HERE, 'node_modules', '.bin', 'hyperframes');
  return fs.existsSync(local) ? local : null;
}

/* the Japanese font is large (~9.5 MB) and gitignored; reuse a sibling
 * project's copy when possible, download on first run otherwise */
function ensureFont() {
  const target = path.join(PROJECT, 'assets', 'NotoSansJP.ttf');
  if (fs.existsSync(target)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  for (const sibling of ['reel', 'vocab']) {
    const other = path.join(HERE, sibling, 'assets', 'NotoSansJP.ttf');
    if (fs.existsSync(other)) { fs.copyFileSync(other, target); return; }
  }
  console.log('Downloading Noto Sans JP…');
  execFileSync('curl', ['-sSfL', '-o', target, FONT_URL], { stdio: 'inherit' });
}

/* media duration in ms via ffprobe */
function mediaDurationMs(file) {
  const r = spawnSync(ffprobePath(), ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nk=1:nw=1', file], { encoding: 'utf8' });
  const sec = parseFloat((r.stdout || '').trim());
  if (!isFinite(sec)) throw new Error('could not read duration of ' + file);
  return Math.round(sec * 1000);
}

/* ---------- audio bed: BGM/SFX + neural TTS -> <project>/audio.wav ---------- */
function ttsClip(tmpDir, i, spec) {
  const f = path.join(tmpDir, `tts${i}.mp3`);
  const ttsArgs = ['--voice', spec.voice, `--rate=${spec.rate || '+0%'}`];
  if (spec.pitch) ttsArgs.push(`--pitch=${spec.pitch}`);
  ttsArgs.push('--text', spec.text, '--write-media', f);
  execFileSync('edge-tts', ttsArgs, { stdio: 'ignore', timeout: 60000 });
  return { file: f, durMs: mediaDurationMs(f) };
}

function mixClips(baseWav, clips, outWav) {
  if (!clips.length) { fs.copyFileSync(baseWav, outWav); return; }
  // bundled ffmpeg is 4.x — apad keeps every input alive for duration=first,
  // a fixed post-gain undoes amix's 1/n scaling, alimiter tames peaks.
  // No atempo: narration always plays at the speed it was synthesized at —
  // the timeline stretches to fit the speech, never the other way around.
  const nIn = clips.length + 1;
  const inputs = clips.flatMap(c => ['-i', c.file]);
  const parts = clips.map((c, i) =>
    `[${i + 1}:a]volume=${c.gain || 1.5},adelay=${c.at}|${c.at},apad[c${i}]`);
  const filter = parts.join(';') + ';[0:a]' + clips.map((_, i) => `[c${i}]`).join('') +
    `amix=inputs=${nIn}:duration=first:dropout_transition=0[m];` +
    `[m]volume=${nIn},alimiter=limit=0.95[mix]`;
  execFileSync(ffmpegPath(), ['-y', '-i', baseWav, ...inputs,
    '-filter_complex', filter, '-map', '[mix]', '-ar', '44100', outWav],
    { stdio: ['ignore', 'ignore', 'inherit'] });
}

/* The reading speed is FIXED: every clip is synthesized at its voice's one
 * canonical rate and never time-compressed to fit a scene. Instead, the
 * measured clip durations set a minimum length for the beats that host
 * speech — the video simply gets longer on wordy days — and the stretched
 * schedule is returned so the visual render uses the exact same timing. */
const EN_RATE = '-5%'; // one readable rate for all English narration
const PAD = { lead: 250, tail: 450, replyLead: 350, replyTail: 800, repeatGap: 400, vocabTail: 650 };

/* Rebuild the beat list left-to-right: every beat keeps its design length
 * unless minLen (seconds, keyed by beat id) asks for more; later beats
 * shift right to absorb the growth, so nothing overlaps. */
function stretchBeats(designBeats, minLen) {
  const r3 = x => Math.round(x * 1000) / 1000;
  let cursor = 0;
  return designBeats.map(([id, s, e]) => {
    const len = Math.max(e - s, minLen[id] || 0);
    const out = [id, r3(cursor), r3(cursor + len)];
    cursor += len;
    return out;
  });
}

/* timeline in ms for the audio synth, derived from a (possibly stretched) REEL */
function msTimeline(T) {
  return {
    beats: T.BEATS.map(([id, s, e]) => [id, Math.round(s * 1000), Math.round(e * 1000)]),
    total: Math.round(T.TOTAL * 1000),
    beatTimes: T.beatTimes.map(s => Math.round(s * 1000)),
    wordTimes: kind === 'vocab' ? []
      : T.wordTimes(content.q.split(' ').length).map(s => Math.round(s * 1000)),
  };
}

/* Synthesize narration + bed into <project>/audio.wav.
 * Returns the stretched BEATS (seconds) the visuals must be rendered with. */
function buildAudio(content) {
  const outWav = path.join(PROJECT, 'audio.wav');
  if (silent) { writeSilence(outWav, Math.round(R.TOTAL * 1000)); return R.BEATS; }

  const tmpDir = fs.mkdtempSync(path.join(HERE, 'output', '.audio-'));
  try {
    let n = 0;
    const tts = spec => {
      try {
        return ttsClip(tmpDir, n++, spec);
      } catch {
        console.warn(`  (TTS unavailable for "${spec.text.slice(0, 30)}…" — continuing without it)`);
        return null;
      }
    };

    /* 1) synthesize every clip at its fixed rate and measure it */
    const hook = tts({ text: HOOKS[kind], voice: DOG_VOICE.name, rate: DOG_VOICE.rate, pitch: DOG_VOICE.pitch });
    const spoken = kind === 'vocab'
      ? content.words.map(w => tts({ text: w.en, voice: EN_VOICE, rate: EN_RATE }))
      : [tts({ text: content.q, voice: EN_VOICE, rate: EN_RATE }),
         tts({ text: content.a, voice: EN_VOICE, rate: EN_RATE })];

    /* 2) minimum beat lengths (seconds) so each clip fits at full speed */
    const need = {};
    const lenOf = id => { const b = R.beat(id); return b[2] - b[1]; };
    // the hook starts at 0.15s and plays across b1 into b2
    if (hook) need.b2 = (150 + hook.durMs + 300) / 1000 - lenOf('b1');
    if (kind === 'vocab') {
      // each answer beat says its word twice
      ['b3', 'b5', 'b7'].forEach((id, i) => {
        const c = spoken[i];
        if (c) need[id] = (PAD.lead + c.durMs * 2 + PAD.repeatGap + PAD.vocabTail) / 1000;
      });
    } else {
      const [q, a] = spoken;
      if (q) need.b5 = (PAD.lead + q.durMs + PAD.tail) / 1000;
      // the reply is spoken over b6 (EN) and still read over b7 (JP): stretch b6
      if (a) need.b6 = (PAD.replyLead + a.durMs + PAD.replyTail) / 1000 - lenOf('b7');
    }
    const beats = stretchBeats(R.BEATS, need);
    const timeline = msTimeline(R.withBeats(beats));
    const beatOf = id => timeline.beats.find(b => b[0] === id);

    /* 3) place the clips on the stretched schedule */
    const clips = [];
    const voiceWindows = []; // actual speech spans (ms) — BGM ducks here
    const place = (clip, at, gain) => {
      if (!clip) return;
      clips.push({ file: clip.file, at, gain });
      voiceWindows.push([Math.max(0, at - 100), at + clip.durMs + 200]);
    };
    place(hook, 150, 1.7);
    if (kind === 'vocab') {
      ['b3', 'b5', 'b7'].forEach((id, i) => {
        const c = spoken[i];
        if (!c) return;
        const start = beatOf(id)[1] + PAD.lead;
        place(c, start, 1.6);
        place(c, start + c.durMs + PAD.repeatGap, 1.6); // say it twice
      });
    } else {
      place(spoken[0], beatOf('b5')[1] + PAD.lead, 1.5);
      place(spoken[1], beatOf('b6')[1] + PAD.replyLead, 1.5);
    }

    /* 4) synth the bed on the stretched timeline and mix */
    const baseWav = path.join(tmpDir, 'base.wav');
    (kind === 'vocab' ? synthVocabTrack : synthBaseTrack)({ ...timeline, voiceWindows }, baseWav);
    mixClips(baseWav, clips, outWav);
    return beats;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function writeSilence(outPath, totalMs) {
  const SR = 44100, n = Math.ceil((totalMs / 1000) * SR);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  fs.writeFileSync(outPath, buf);
}

function buildCaption(content) {
  if (kind === 'vocab') {
    const lines = content.words.map(w => `✅ ${w.en}（${w.jp}）`);
    return [
      `【救急英単語】きょうの3語 — ${content.cat}編、ぜんぶ言えますか？`, '',
      ...lines, '',
      '現場で使う救急英単語を毎日3語。声に出してマネするだけ。',
      'アプリ「机のいらない救急英語」なら、AIの発音判定つきで練習できます。',
      '👉 プロフィールのリンクから（ブラウザだけで動きます）', '',
      '#救急救命士 #救急隊員 #消防士 #救急外来 #医療英語 #英語学習 #救急英語 #医療英単語 #勉強垢 #paramedic #EMT',
    ].join('\n');
  }
  return [
    `【救急英語】「${content.qjp}」— 英語で言えますか？`, '',
    `✅ ${content.q}`,
    `🗣️ 患者さんの答え: ${content.a}（${content.ajp}）`, '',
    '現場で使う英語問診を毎日1フレーズ。',
    'アプリ「机のいらない救急英語」なら、AIの発音判定つきで声に出して練習できます。',
    '👉 プロフィールのリンクから（ブラウザだけで動きます）', '',
    '#救急救命士 #救急隊員 #消防士 #救急外来 #医療英語 #英語学習 #救急英語 #勉強垢 #paramedic #EMT',
  ].join('\n');
}

/* ---------------- main ---------------- */
const content = kind === 'vocab' ? pickVocab() : pickCard();

const outDir = path.join(HERE, 'output');
fs.mkdirSync(outDir, { recursive: true });
const suffix = kind === 'vocab' ? '-vocab' : '';
const outMp4 = arg('out', path.join(outDir, `${dateStr}${suffix}.mp4`));
const outTxt = outMp4.replace(/\.mp4$/, '.txt');

ensureFont();
ensureExecutable(ffmpegPath());
ensureExecutable(ffprobePath());

console.log(silent ? 'Writing silent bed…' : 'Synthesizing narration (fixed speaking rate)…');
const beats = buildAudio(content);
const total = beats[beats.length - 1][2];
if (total > R.TOTAL) {
  console.log(`Timeline stretched ${R.TOTAL.toFixed(1)}s -> ${total.toFixed(1)}s so the narration keeps its speed.`);
}

if (audioOnly) {
  console.log(`Wrote ${path.join(PROJECT, 'audio.wav')} — run \`cd ${path.basename(PROJECT)} && npx hyperframes preview\``);
  process.exit(0);
}

const hf = hyperframesBin();
if (!hf) {
  console.error('hyperframes CLI not found. Run `npm install` in marketing/ first.');
  process.exit(1);
}
const env = {
  ...process.env,
  HYPERFRAMES_FFMPEG_PATH: ffmpegPath(),
  HYPERFRAMES_FFPROBE_PATH: ffprobePath(),
  HYPERFRAMES_TELEMETRY_DISABLED: '1',
};
const shell = headlessShellPath();
if (shell) env.PRODUCER_HEADLESS_SHELL_PATH = shell;

/* Derived composition for this render: same markup as index.html, but with
 * data-duration rewritten to the stretched total — the renderer reads the
 * composition duration from the static attribute, so the video length
 * follows the narration. The beat schedule itself travels as a variable. */
const renderHtml = 'render.html';
fs.writeFileSync(path.join(PROJECT, renderHtml),
  fs.readFileSync(path.join(PROJECT, 'index.html'), 'utf8')
    .replace(/data-duration="[0-9.]+"/g, `data-duration="${total}"`));

const variables = JSON.stringify({
  ...(kind === 'vocab'
    ? { cat: content.cat,
        w1en: content.words[0].en, w1jp: content.words[0].jp,
        w2en: content.words[1].en, w2jp: content.words[1].jp,
        w3en: content.words[2].en, w3jp: content.words[2].jp }
    : { q: content.q, qjp: content.qjp, a: content.a, ajp: content.ajp }),
  beats: JSON.stringify(beats),
});

console.log(`Rendering with HyperFrames (kind=${kind}, quality=${quality}, ${total.toFixed(1)}s)…`);
const tmpVideo = path.join(outDir, `.${path.basename(outMp4, '.mp4')}.video.mp4`);
const res = spawnSync(hf, ['render', '-c', renderHtml, '--quality', quality, '--fps', String(fps),
  '--strict-variables', '--variables', variables, '--output', tmpVideo],
  { cwd: PROJECT, env, stdio: 'inherit' });
if (res.status !== 0) { console.error('render failed'); process.exit(res.status || 1); }
if (!fs.existsSync(tmpVideo) || fs.statSync(tmpVideo).size === 0) {
  console.error('render produced no video'); process.exit(1);
}

/* Mux the audio bed onto the rendered video ourselves. HyperFrames' own audio
 * mixer uses `apad=whole_dur=` (ffmpeg >= 4.2); the bundled @ffmpeg-installer
 * binary is a 2018 build that lacks it, so we take the video and lay our own
 * track over it with a graph that works on that older ffmpeg. Same result on a
 * modern system ffmpeg, so the pipeline is version-agnostic. */
console.log('Muxing audio…');
const muxArgs = silent
  ? ['-y', '-i', tmpVideo, '-c:v', 'copy', '-an', '-movflags', '+faststart', outMp4]
  : ['-y', '-i', tmpVideo, '-i', path.join(PROJECT, 'audio.wav'),
     '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
     '-shortest', '-movflags', '+faststart', outMp4];
const mux = spawnSync(ffmpegPath(), muxArgs, { stdio: ['ignore', 'ignore', 'inherit'] });
fs.rmSync(tmpVideo, { force: true });
if (mux.status !== 0 || !fs.existsSync(outMp4) || fs.statSync(outMp4).size === 0) {
  console.error('audio mux failed'); process.exit(mux.status || 1);
}

fs.writeFileSync(outTxt, buildCaption(content));
const mb = (fs.statSync(outMp4).size / 1e6).toFixed(1);
console.log(`Done: ${outMp4} (${mb} MB)`);
console.log(`Caption: ${outTxt}`);
