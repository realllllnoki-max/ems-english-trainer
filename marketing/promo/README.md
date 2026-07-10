# marketing/promo/ — SNS宣伝画像(静止画)

X・Instagram・TikTok に投稿するアプリ紹介画像です。
「1日1投稿SNS」系のアプリ広告のテイスト(クリーム背景+暖色グラデ+
iPhoneモックアップ+チェックリスト+3カラム帯)を、本アプリの
Duolingo風カラー(`--red #ff4b4b` / `--amber #ffc800`)とマスコットで再構成しています。

**スマホの画面内は実アプリのスクリーンショット**(`screens/judge.png`)です。
コピーもアプリ/LPの実際の文言(「英語の傷病者、自信を持って問診できますか?」
「傷病者の返答」「登録不要・毎日1問無料」等)に合わせています。

| ファイル | サイズ | 用途 |
|---------|--------|------|
| `promo-square.png` | 1080×1080 | X・Instagramフィード |
| `promo-story.png` | 1080×1920 | TikTok・IGストーリーズ/リールカバー |

## 再生成・編集

見た目は `promo-square.html` / `promo-story.html`(単一HTML・CSSのみ)を編集し、

```bash
./render.sh   # ヘッドレスChromiumでPNGを書き出し
```

で書き出します。フォント(Noto Sans JP・9.5MB・gitignore対象)は初回実行時に
自動ダウンロード(兄弟ディレクトリ `reel/assets` 等にあれば再利用)されます。
マスコットはリポジトリ直下の `logo.png`(透過版)を参照しています。

## screens/ — 実アプリのスクリーンショット

| ファイル | 画面 |
|---------|------|
| `screens/judge.png` | トレーナー: 音読 → 発音判定成功(一致度100%・+12XP) |
| `screens/home.png` | ホーム: ストリーク7日・練習を始める |
| `screens/quiz.png` | 単語クイズ: 4択出題 |

390×780・3倍解像度で、Playwright + ヘッドレスChromiumから撮影しています。
別の画面に差し替えるときは、HTML内の `screens/judge.png` を変更してください。
撮り直す場合のポイント:

- `index.html?from=lp` で開く(クエリ付きはLPへリダイレクトされない)
- `localStorage` の `ems_stats_v1` にストリーク・XPを入れると使い込んだ見た目になる
- `window.SpeechRecognition` を「質問文をそのまま返すフェイク」に差し替えると
  発音判定成功のUIを確実に出せる
- Nunito / Noto Sans JP をOSにインストールしておくと実機と同じ字形になる

## 投稿キャプション例

> 英語の傷病者、自信を持って問診できますか?🚑
> 机のいらない救急英語 — 音読するだけ、発音はAIが自動判定。
> 登録不要・ブラウザで開くだけ・毎日1問無料 → nodesk-qq-english.com
> #救急救命士 #救急隊 #医療英語 #EMT #英語学習
