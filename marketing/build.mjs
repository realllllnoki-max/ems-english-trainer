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
 *   2. synthesize the audio bed (beat-locked BGM/SFX + neural TTS) into
 *      <project>/audio.wav — the composition references it via <audio>
 *   3. render <project>/index.html with `hyperframes render`, injecting the
 *      text as composition --variables
 *   4. write the post caption (.txt)
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
// Calculate date in JST (UTC+9). At 7 AM JST, UTC is still 10 PM of prior day, so we need to add 9 hours.
const getJSTDateString = () => {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
};
const dateStr = arg('date', getJSTDateString());
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
  // a fixed post-gain undoes amix's 1/n scaling, alimiter tames peaks
  const nIn = clips.length + 1;
  const inputs = clips.flatMap(c => ['-i', c.file]);
  const parts = clips.map((c, i) =>
    `[${i + 1}:a]atempo=${(c.tempo || 1).toFixed(3)},volume=${c.gain || 1.5},adelay=${c.at}|${c.at},apad[c${i}]`);
  const filter = parts.join(';') + ';[0:a]' + clips.map((_, i) => `[c${i}]`).join('') +
    `amix=inputs=${nIn}:duration=first:dropout_transition=0[m];` +
    `[m]volume=${nIn},alimiter=limit=0.95[mix]`;
  execFileSync(ffmpegPath(), ['-y', '-i', baseWav, ...inputs,
    '-filter_complex', filter, '-map', '[mix]', '-ar', '44100', outWav],
    { stdio: ['ignore', 'ignore', 'inherit'] });
}

function buildAudio(content, timeline) {
  const outWav = path.join(PROJECT, 'audio.wav');
  if (silent) { writeSilence(outWav, timeline.total); return; }

  const tmpDir = fs.mkdtempSync(path.join(HERE, 'output', '.audio-'));
  try {
    const baseWav = path.join(tmpDir, 'base.wav');
    const beatOf = id => timeline.beats.find(b => b[0] === id);
    const clips = [];
    let n = 0;
    const addTts = (spec, at, windowMs, gain) => {
      try {
        const { file, durMs } = ttsClip(tmpDir, n++, spec);
        clips.push({ file, at, tempo: Math.min(1.35, Math.max(1, durMs / windowMs)), gain });
        return durMs;
      } catch {
        console.warn(`  (TTS unavailable for "${spec.text.slice(0, 30)}…" — continuing without it)`);
        return null;
      }
    };
    // the mascot's hook — wide window so it plays at DOG_VOICE.rate uncompressed
    const hook = { text: HOOKS[kind], voice: DOG_VOICE.name, rate: DOG_VOICE.rate, pitch: DOG_VOICE.pitch };

    if (kind === 'vocab') {
      synthVocabTrack(timeline, baseWav);
      addTts(hook, 150, 3000, 1.7);
      // each answer: say the word, then repeat it if the window allows
      ['b3', 'b5', 'b7'].forEach((id, i) => {
        const a = beatOf(id);
        const spec = { text: content.words[i].en, voice: EN_VOICE, rate: '-5%' };
        const dur = addTts(spec, a[1] + 250, 2000, 1.6);
        if (dur !== null && dur * 2 + 650 < a[2] - a[1] - 400) {
          clips.push({ ...clips[clips.length - 1], at: a[1] + 250 + dur + 400 });
        }
      });
    } else {
      synthBaseTrack(timeline, baseWav);
      addTts(hook, 150, 3000, 1.7);
      addTts({ text: content.q, voice: EN_VOICE, rate: '-5%' },
        beatOf('b5')[1] + 250, beatOf('b5')[2] - beatOf('b5')[1] - 400, 1.5);
      addTts({ text: content.a, voice: EN_VOICE, rate: '-5%' },
        beatOf('b6')[1] + 350, beatOf('b7')[2] - beatOf('b6')[1] - 800, 1.5);
    }
    mixClips(baseWav, clips, outWav);
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

// audio timeline (ms) derived from the project's shared timeline
const timeline = {
  beats: R.BEATS.map(([id, s, e]) => [id, Math.round(s * 1000), Math.round(e * 1000)]),
  total: Math.round(R.TOTAL * 1000),
  beatTimes: R.beatTimes.map(s => Math.round(s * 1000)),
  wordTimes: kind === 'vocab' ? []
    : R.wordTimes(content.q.split(' ').length).map(s => Math.round(s * 1000)),
};

ensureFont();
ensureExecutable(ffmpegPath());
ensureExecutable(ffprobePath());

console.log(silent ? 'Writing silent bed…' : 'Synthesizing audio…');
buildAudio(content, timeline);

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

const variables = JSON.stringify(kind === 'vocab'
  ? { cat: content.cat,
      w1en: content.words[0].en, w1jp: content.words[0].jp,
      w2en: content.words[1].en, w2jp: content.words[1].jp,
      w3en: content.words[2].en, w3jp: content.words[2].jp }
  : { q: content.q, qjp: content.qjp, a: content.a, ajp: content.ajp });

console.log(`Rendering with HyperFrames (kind=${kind}, quality=${quality})…`);
const tmpVideo = path.join(outDir, `.${path.basename(outMp4, '.mp4')}.video.mp4`);
const res = spawnSync(hf, ['render', '--quality', quality, '--fps', String(fps),
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
