#!/usr/bin/env node
/**
 * Daily TikTok / Instagram Reel generator for 机のいらない救急英語,
 * built on HyperFrames (HTML -> deterministic MP4).
 *
 * Pipeline:
 *   1. pick one phrase card from ems-data.js, deterministically by date
 *   2. synthesize the audio bed (beat-locked BGM/SFX + neural TTS) into
 *      reel/audio.wav — the composition references it via <audio>
 *   3. render reel/index.html with `hyperframes render`, injecting the card
 *      text as composition --variables
 *   4. write the post caption (.txt)
 *
 * Same date -> same video (content is date-seeded; audio synth is PRNG-seeded).
 *
 * Usage:
 *   node build.mjs                      # today -> output/YYYY-MM-DD.mp4
 *   node build.mjs --date 2026-07-10    # a specific day
 *   node build.mjs --index 42           # force a phrase card
 *   node build.mjs --quality draft      # faster, lower-bitrate iteration
 *   node build.mjs --silent             # silent bed (post with trend audio)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { synthBaseTrack } from './audio.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);
const REEL = path.join(HERE, 'reel');
const FONT_PATH = path.join(REEL, 'assets', 'NotoSansJP.ttf');
const FONT_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf';

/* ---------- CLI args ---------- */
const args = process.argv.slice(2);
const arg = (name, fb) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fb; };
const dateStr = arg('date', new Date().toISOString().slice(0, 10));
const forcedIndex = arg('index', null);
const quality = arg('quality', 'high');
const fps = arg('fps', '60'); // 60fps for premium smoothness (data-fps is only a hint to the renderer)
const silent = args.includes('--silent');
const audioOnly = args.includes('--audio-only'); // just write reel/audio.wav (for `hyperframes preview`)

/* ---------- shared timeline (single source of truth) ---------- */
function loadReelTimeline() {
  const src = fs.readFileSync(path.join(REEL, 'timeline.js'), 'utf8');
  const g = {};
  new Function('window', src)(g);        // timeline.js attaches window.REEL
  return g.REEL;
}
const R = loadReelTimeline();

/* ---------- phrase cards from the app's own data ---------- */
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
function pickIndex(cards, date) {
  if (forcedIndex !== null) return Number(forcedIndex) % cards.length;
  const epochDay = Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);
  return ((epochDay * 613) % cards.length + cards.length) % cards.length; // prime stride
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

/* the Japanese font is large (~9.5 MB) and gitignored; fetch it on first run */
function ensureFont() {
  if (fs.existsSync(FONT_PATH)) return;
  console.log('Downloading Noto Sans JP…');
  fs.mkdirSync(path.dirname(FONT_PATH), { recursive: true });
  execFileSync('curl', ['-sSfL', '-o', FONT_PATH, FONT_URL], { stdio: 'inherit' });
}

/* media duration in ms via ffprobe */
function mediaDurationMs(file) {
  const r = spawnSync(ffprobePath(), ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nk=1:nw=1', file], { encoding: 'utf8' });
  const sec = parseFloat((r.stdout || '').trim());
  if (!isFinite(sec)) throw new Error('could not read duration of ' + file);
  return Math.round(sec * 1000);
}

/* ---------- audio bed: BGM/SFX + neural TTS -> reel/audio.wav ---------- */
function buildAudio(card, timeline) {
  const outWav = path.join(REEL, 'audio.wav');
  if (silent) { writeSilence(outWav, timeline.total); return; }

  const tmpDir = fs.mkdtempSync(path.join(HERE, 'output', '.audio-'));
  try {
    const baseWav = path.join(tmpDir, 'base.wav');
    synthBaseTrack(timeline, baseWav);       // beat-locked BGM + timeline SFX

    const beatOf = id => timeline.beats.find(b => b[0] === id);
    const wanted = [
      { text: card.q, at: beatOf('b5')[1] + 250, windowMs: beatOf('b5')[2] - beatOf('b5')[1] - 400 },
      { text: card.a, at: beatOf('b6')[1] + 350, windowMs: beatOf('b7')[2] - beatOf('b6')[1] - 800 },
    ];
    const clips = [];
    for (const [i, c] of wanted.entries()) {
      try {
        const f = path.join(tmpDir, `tts${i}.mp3`);
        execFileSync('edge-tts', ['--voice', 'en-US-JennyNeural', '--rate=-5%',
          '--text', c.text, '--write-media', f], { stdio: 'ignore', timeout: 60000 });
        const dur = mediaDurationMs(f);
        clips.push({ file: f, at: c.at, tempo: Math.min(1.35, Math.max(1, dur / c.windowMs)) });
      } catch {
        console.warn(`  (TTS unavailable for "${c.text.slice(0, 30)}…" — continuing without it)`);
      }
    }

    if (clips.length) {
      // bundled ffmpeg is 4.x — apad keeps every input alive for duration=first,
      // a fixed post-gain undoes amix's 1/n scaling, alimiter tames peaks
      const nIn = clips.length + 1;
      const inputs = clips.flatMap(c => ['-i', c.file]);
      const parts = clips.map((c, i) =>
        `[${i + 1}:a]atempo=${c.tempo.toFixed(3)},volume=1.5,adelay=${c.at}|${c.at},apad[c${i}]`);
      const filter = parts.join(';') + ';[0:a]' + clips.map((_, i) => `[c${i}]`).join('') +
        `amix=inputs=${nIn}:duration=first:dropout_transition=0[m];` +
        `[m]volume=${nIn},alimiter=limit=0.95[mix]`;
      execFileSync(ffmpegPath(), ['-y', '-i', baseWav, ...inputs,
        '-filter_complex', filter, '-map', '[mix]', '-ar', '44100', outWav],
        { stdio: ['ignore', 'ignore', 'inherit'] });
    } else {
      fs.copyFileSync(baseWav, outWav);
    }
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

function buildCaption(card) {
  return [
    `【救急英語】「${card.qjp}」— 英語で言えますか？`, '',
    `✅ ${card.q}`,
    `🗣️ 患者さんの答え: ${card.a}（${card.ajp}）`, '',
    '現場で使う英語問診を毎日1フレーズ。',
    'アプリ「机のいらない救急英語」なら、AIの発音判定つきで声に出して練習できます。',
    '👉 プロフィールのリンクから（ブラウザだけで動きます）', '',
    '#救急救命士 #救急隊員 #消防士 #救急外来 #医療英語 #英語学習 #救急英語 #勉強垢 #paramedic #EMT',
  ].join('\n');
}

/* ---------------- main ---------------- */
const cards = loadCards();
const idx = pickIndex(cards, dateStr);
const card = cards[idx];
console.log(`Card ${idx}/${cards.length}: [${card.sceneTitle}] ${card.q}`);

const outDir = path.join(HERE, 'output');
fs.mkdirSync(outDir, { recursive: true });
const outMp4 = arg('out', path.join(outDir, `${dateStr}.mp4`));
const outTxt = outMp4.replace(/\.mp4$/, '.txt');

// audio timeline (ms) derived from the shared reel timeline
const words = card.q.split(' ');
const timeline = {
  beats: R.BEATS.map(([id, s, e]) => [id, Math.round(s * 1000), Math.round(e * 1000)]),
  total: Math.round(R.TOTAL * 1000),
  beatTimes: R.beatTimes.map(s => Math.round(s * 1000)),
  wordTimes: R.wordTimes(words.length).map(s => Math.round(s * 1000)),
};

ensureFont();
ensureExecutable(ffmpegPath());
ensureExecutable(ffprobePath());

console.log(silent ? 'Writing silent bed…' : 'Synthesizing audio…');
buildAudio(card, timeline);

if (audioOnly) {
  console.log(`Wrote ${path.join(REEL, 'audio.wav')} — run \`cd reel && npx hyperframes preview\``);
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

const variables = JSON.stringify({
  q: card.q, qjp: card.qjp, a: card.a, ajp: card.ajp,
});

console.log(`Rendering with HyperFrames (quality=${quality})…`);
const tmpVideo = path.join(outDir, `.${path.basename(outMp4, '.mp4')}.video.mp4`);
const res = spawnSync(hf, ['render', '--quality', quality, '--fps', String(fps),
  '--strict-variables', '--variables', variables, '--output', tmpVideo],
  { cwd: REEL, env, stdio: 'inherit' });
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
  : ['-y', '-i', tmpVideo, '-i', path.join(REEL, 'audio.wav'),
     '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
     '-shortest', '-movflags', '+faststart', outMp4];
const mux = spawnSync(ffmpegPath(), muxArgs, { stdio: ['ignore', 'ignore', 'inherit'] });
fs.rmSync(tmpVideo, { force: true });
if (mux.status !== 0 || !fs.existsSync(outMp4) || fs.statSync(outMp4).size === 0) {
  console.error('audio mux failed'); process.exit(mux.status || 1);
}

fs.writeFileSync(outTxt, buildCaption(card));
const mb = (fs.statSync(outMp4).size / 1e6).toFixed(1);
console.log(`Done: ${outMp4} (${mb} MB)`);
console.log(`Caption: ${outTxt}`);
