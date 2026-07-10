# marketing/promo/ — SNS宣伝画像(静止画)

X・Instagram・TikTok に投稿するアプリ紹介画像です。
「1日1投稿SNS」系のアプリ広告のテイスト(クリーム背景+暖色グラデ+
iPhoneモックアップ+チェックリスト+3カラム帯)を、本アプリの
Duolingo風カラー(`--red #ff4b4b` / `--amber #ffc800`)とマスコットで再構成しています。

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

## 投稿キャプション例

> その問診、英語で言えますか?🚑
> 机のいらない救急英語 — 声に出して1日3分。AIが発音を採点します。
> アプリ不要・ブラウザで開くだけ → nodesk-qq-english.com
> #救急救命士 #救急隊 #医療英語 #EMT #英語学習
