#!/usr/bin/env node
/**
 * Daily TikTok / Instagram Reel generator for EMS English Trainer.
 *
 * Renders marketing/template.html at 1080x1920, seeks the animation frame by
 * frame with headless Chromium, and assembles an H.264 MP4 with ffmpeg.
 * Content (one phrase per day) is picked deterministically from ems-data.js
 * based on the date, so re-running for the same date yields the same video.
 *
 * Usage:
 *   node generate.mjs                     # today's video -> output/YYYY-MM-DD.mp4
 *   node generate.mjs --date 2026-07-10   # a specific day
 *   node generate.mjs --index 42          # force a specific phrase card
 *   node generate.mjs --fps 60 --out path/to/video.mp4
 *   node generate.mjs --bpm 104           # sync cuts/pops to a 104 BPM track
 *   node generate.mjs --bpm 104 --beat-offset 0.35   # first beat at 0.35s
 *   node generate.mjs --beats beats.json  # explicit beat timestamps (seconds)
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);
const FPS_DEFAULT = 60;
const FONT_PATH = path.join(HERE, 'assets', 'NotoSansJP.ttf');
const FONT_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf';

/* ---------- CLI args ---------- */
const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : fallback;
}
const dateStr = arg('date', new Date().toISOString().slice(0, 10));
const fps = Number(arg('fps', FPS_DEFAULT));
const forcedIndex = arg('index', null);

/* beat map for music sync: --beats file.json (array of seconds, e.g. from
 * librosa.beat.beat_track) or --bpm N [--beat-offset seconds] for a fixed grid */
function loadBeatsMs() {
  const beatsFile = arg('beats', null);
  if (beatsFile) {
    return JSON.parse(fs.readFileSync(beatsFile, 'utf8')).map(s => Math.round(s * 1000));
  }
  const bpm = arg('bpm', null);
  if (bpm) {
    const step = 60000 / Number(bpm);
    const offset = Number(arg('beat-offset', 0)) * 1000;
    const beats = [];
    for (let b = offset; b < 20000; b += step) beats.push(Math.round(b));
    return beats;
  }
  return null;
}
const beatsMs = loadBeatsMs();
if (beatsMs) console.log(`Beat sync: ${beatsMs.length} beats loaded`);

/* ---------- load phrase cards from the app's own data ---------- */
function loadCards() {
  const src = fs.readFileSync(path.join(REPO, 'ems-data.js'), 'utf8');
  const sandbox = new Function(src + '; return { SCENES, FRAMEWORKS };');
  const { SCENES, FRAMEWORKS } = sandbox();
  const cards = [];
  for (const scene of SCENES) {
    for (const node of Object.values(scene.nodes || {})) {
      if (!node.q || !node.qjp || !node.a || !node.ajp) continue;
      if (node.q.split(' ').length > 12) continue; // keep phrases readable at 92px
      const fw = FRAMEWORKS[scene.framework];
      const step = fw?.steps?.find(s => s.k === node.step);
      cards.push({
        q: node.q,
        qjp: node.qjp,
        a: node.a,
        ajp: node.ajp,
        framework: fw?.name || scene.framework || '',
        stepWord: step?.word || node.step || '',
        sceneTitle: scene.title,
        sceneEn: scene.en,
      });
    }
  }
  return cards;
}

function pickIndex(cards, date) {
  if (forcedIndex !== null) return Number(forcedIndex) % cards.length;
  const epochDay = Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000);
  // stride by a prime so consecutive days land in different scenes
  return ((epochDay * 613) % cards.length + cards.length) % cards.length;
}

/* ---------- helpers ---------- */
function ensureFont() {
  if (fs.existsSync(FONT_PATH)) return;
  console.log('Downloading Noto Sans JP…');
  fs.mkdirSync(path.dirname(FONT_PATH), { recursive: true });
  execFileSync('curl', ['-sSfL', '-o', FONT_PATH, FONT_URL], { stdio: 'inherit' });
}

function chromiumExecutable() {
  if (process.env.PW_CHROMIUM_PATH) return process.env.PW_CHROMIUM_PATH;
  const shared = '/opt/pw-browsers/chromium';
  if (fs.existsSync(shared)) return shared;
  try { return chromium.executablePath(); } catch { return undefined; }
}

function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  return require('@ffmpeg-installer/ffmpeg').path;
}

function buildCaption(card) {
  return [
    `【救急英語】「${card.qjp}」— 英語で言えますか？`,
    '',
    `✅ ${card.q}`,
    `🗣️ 患者さんの答え: ${card.a}（${card.ajp}）`,
    '',
    '現場で使う英語問診を毎日1フレーズ。',
    'アプリ「EMS English Trainer」なら、AIの発音判定つきで声に出して練習できます。',
    '👉 プロフィールのリンクから（ブラウザだけで動きます）',
    '',
    '#救急救命士 #救急隊員 #消防士 #救急外来 #医療英語 #英語学習 #救急英語 #勉強垢 #paramedic #EMT',
  ].join('\n');
}

/* ---------- main ---------- */
const cards = loadCards();
const idx = pickIndex(cards, dateStr);
const card = cards[idx];
console.log(`Card ${idx}/${cards.length}: [${card.sceneTitle}] ${card.q}`);

ensureFont();

const outDir = path.join(HERE, 'output');
fs.mkdirSync(outDir, { recursive: true });
const outMp4 = arg('out', path.join(outDir, `${dateStr}.mp4`));
const outTxt = outMp4.replace(/\.mp4$/, '.txt');

const iconFile = path.join(REPO, 'icon-192.png');
const iconSrc = 'data:image/png;base64,' + fs.readFileSync(iconFile).toString('base64');

const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-frames-'));

const browser = await chromium.launch({
  executablePath: chromiumExecutable(),
  args: ['--no-sandbox', '--force-color-profile=srgb', '--font-render-hinting=none'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto(pathToFileURL(path.join(HERE, 'template.html')).href);
  await page.evaluate(p => window.__tpl.setup(p), { ...card, iconSrc, beatsMs });
  await page.evaluate(() => document.fonts.ready);

  const total = await page.evaluate(() => window.__tpl.TOTAL);
  const frames = Math.round((total / 1000) * fps);
  console.log(`Rendering ${frames} frames at ${fps}fps…`);
  for (let f = 0; f < frames; f++) {
    await page.evaluate(t => window.__tpl.seek(t), (f / fps) * 1000);
    await page.screenshot({
      path: path.join(framesDir, `f${String(f).padStart(5, '0')}.jpeg`),
      type: 'jpeg',
      quality: 92,
    });
    if (f % 120 === 0) console.log(`  frame ${f}/${frames}`);
  }
} finally {
  await browser.close();
}

console.log('Encoding MP4…');
execFileSync(ffmpegPath(), [
  '-y',
  '-framerate', String(fps),
  '-i', path.join(framesDir, 'f%05d.jpeg'),
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '19',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  outMp4,
], { stdio: ['ignore', 'ignore', 'inherit'] });

fs.writeFileSync(outTxt, buildCaption(card));
fs.rmSync(framesDir, { recursive: true, force: true });

const mb = (fs.statSync(outMp4).size / 1e6).toFixed(1);
console.log(`Done: ${outMp4} (${mb} MB)`);
console.log(`Caption: ${outTxt}`);
