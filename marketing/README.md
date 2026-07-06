# marketing/ — TikTok・Instagramリール自動生成

「机のいらない救急英語」の集客用ショート動画(1080×1920・約23秒)を、
アプリ内のシナリオデータ(`ems-data.js`)から**毎日1本、自動生成**する仕組みです。

動画は **[HyperFrames](https://hyperframes.heygen.com/)**(HTMLを決定的にMP4へ書き出す
オープンソースのレンダラ)で作っています。1枚のHTMLコンポジション
(`reel/index.html`)を GSAP タイムラインでアニメーションさせ、ヘッドレスChromeで
1フレームずつシークして FFmpeg で H.264 にエンコードします。**同じ日なら同じ動画**に
なります(内容は日付シード、音声はPRNGシードで決定的)。

## 動画のフォーマット「救急英語 きょうの1フレーズ」

| 秒数 | シーン | 内容 |
|------|--------|------|
| 0–1.4 | フック | 「これ、英語で言えますか？」(ズームスラム) |
| 1.4–5.0 | 出題 | きょうの日本語フレーズ(読む時間を確保) |
| 5.0–8.0 | カウントダウン | 3・2・1(1秒ずつ)「声に出して」 |
| 8.0–11.2 | 答え | 英語フレーズが単語ごとにポップ |
| 11.2–14.4 | 答え(定着) | 英語+日本語訳をじっくり表示 |
| 14.4–17.0 | 患者の返答 | 現場でどう返ってくるかの例(英) |
| 17.0–19.4 | 患者の返答 | 日本語訳 |
| 19.4–21.4 | CTA | アプリ紹介+「プロフィールのリンクから」 |
| 21.4–22.8 | ループブリッジ | 「言えたら🔥をコメント」→白フラッシュで先頭へ |

## 動画の種類は2つ

| kind | 内容 | 出力 |
|------|------|------|
| `phrase`(既定) | 「きょうの1フレーズ」— 問診1文＋患者の返答 | `YYYY-MM-DD.mp4` |
| `vocab` | 「きょうの救急単語」— 3語のJP→ENクイズ(1日1カテゴリを巡回) | `YYYY-MM-DD-vocab.mp4` |

```bash
node build.mjs --kind vocab          # 単語編(アプリのVOCAB 405語・7カテゴリから)
```

単語編も同じテイスト(配色・マスコット・犬ボイスのフック・ビート同期音声・
キネティックトランジション・保存/フォロー締め)で、英単語はネイティブTTSが
2回読み上げます。見た目は `vocab/index.html`、尺は `vocab/timeline.js` を編集。

尺は約23秒・60fps。動きは GSAP のイージング(back/expo/sine など)で駆動し、
表示中も常に微ズーム(Ken Burns)し続け、単語のポップは104BPMのビートグリッドに
吸着します。シーンの切り替えは**キネティックなトランジション**で繋ぎ、視聴者を
飽きさせません:

| つなぎ | 演出 |
|--------|------|
| フック→出題 | シネマティック・ズームスルー |
| 出題→カウントダウン | パンチイン |
| カウントダウン→答え | **白フラッシュ**(クライマックスの答え出し) |
| 答え→定着 | ソフト・ディゾルブ |
| 定着→患者返答 | ウィップパン(横スワイプ) |
| 返答(英→日) | クロスフェード |
| 返答→CTA | プッシュアップ |
| CTA→ループ | ポップ&スピン |

> ※ トランジションはすべてDOM/CSS+GSAPで実装しています。HeyGen HyperFrames の
> WebGL「シェーダートランジション」も検討しましたが、GPUのないレンダリング環境
> (GitHub Actions / 本サンドボックス)ではシェーダー合成がソフトウェアGLで失敗し、
> 遷移が黒フレーム化するため採用していません。GPU環境なら
> `@hyperframes/shader-transitions` に差し替え可能です。

フレーズは日付から決定的に選ばれる(同じ日に再実行しても同じ動画)ので、
約1,300枚のフレーズカードで**3年以上ネタ切れしません**。
動画と一緒に、コピペで使える投稿キャプション(ハッシュタグ付き `.txt`)も生成されます。

### 音声(自動合成)

- **BGM** — ビートグリッド(104BPM)に同期したキック・ハイハット・ベースを
  コードで合成(`audio.mjs`・ライセンスフリー・毎回同一)
- **効果音** — 冒頭スラムの衝撃音、カウントダウンのビープ(3・2・1↑)、
  単語ポップ音、正解のベル、CTAジングル、ループ直前のライザー
- **英語読み上げ** — 出題フレーズと患者の返答をニューラルTTS
  (Microsoft edge-tts / en-US-JennyNeural)で読み上げ。発音のお手本になります。
  読み上げ中はBGMが自動で小さくなります(ダッキング)

合成した音声は `reel/audio.wav` に書き出し、動画へ多重化します。TikTokの
**トレンド音源を使いたい日**は `--silent` で無音版を生成してください:

```bash
node build.mjs --silent   # 無音版(トレンド音源を後付けする用)
```

## 毎日のループ(自動化)

`.github/workflows/daily-video.yml` が **毎朝7時(JST)** に実行され:

1. その日のフレーズで動画+キャプションを生成
2. リポジトリの **Releases →「daily-videos」** に `YYYY-MM-DD.mp4` / `.txt` をアップロード

### 毎朝やること(1〜2分)

1. スマホで GitHub の [Releases ページ](../../releases/tag/daily-videos) を開く
2. 今日の日付の `.mp4` をダウンロード、`.txt` のキャプションをコピー
3. TikTok / Instagram に投稿(音源をアプリ内で追加、キャプションを貼り付け)

手動で今すぐ作りたいときは **Actions → Daily marketing video → Run workflow**。
日付やカード番号(index)、無音フラグも指定できます。

## ローカルでの生成・カスタマイズ

```bash
cd marketing
npm install                          # HyperFrames CLI + ffmpeg/ffprobe(同梱バイナリ)
node build.mjs                       # 今日の動画 → output/YYYY-MM-DD.mp4
node build.mjs --date 2026-07-10     # 日付指定
node build.mjs --index 42            # フレーズを番号で指定
node build.mjs --quality draft       # 速い反復用(低ビットレート)
node build.mjs --silent              # 無音版
```

`npm install` は `.npmrc` の `ignore-scripts=true` で走ります。これは HyperFrames が
依存する `onnxruntime-node`(文字起こし専用・本パイプラインでは未使用)の
巨大なネイティブバイナリDLを回避するためです。同梱の ffmpeg/ffprobe バイナリは
プレビルド済みで、`build.mjs` が起動時に実行権限を復元します。

日本語フォント(Noto Sans JP・約9.5MB)は初回実行時に自動ダウンロードされます。

### プレビューと編集(HyperFrames Studio)

`reel/audio.wav` を用意したうえで Studio を開くと、タイムライン上で
**要素を直接ドラッグ編集**できます:

```bash
node build.mjs --audio-only          # reel/audio.wav だけを生成(レンダリングはしない)
cd reel && npx hyperframes preview    # ブラウザで Studio が開く
```

見た目・文言・レイアウトは `reel/index.html`(CSS + GSAP タイムライン)、
尺やシーン境界・ビートグリッドは `reel/timeline.js`、キャプションやカード選択は
`build.mjs` を編集します。

### 品質チェック

コンポジションを編集したら、レンダリング前に検査を通してください:

```bash
cd reel
npx hyperframes lint       # 構造(必須属性・トラック重複・タイムライン登録)
npx hyperframes validate   # 実行時エラー + コントラスト
npx hyperframes inspect    # テキストのはみ出し・画面外
```

> **HyperFrames の CLI について**: 本体は `npm install` で `node_modules` に入るので、
> 通常は上記のように `npx hyperframes …` で使えます。関連スキル(コンポジションの
> 書き方ガイド)を入れたい場合は `npx skills add heygen-com/hyperframes`。

### レンダラのバイナリ(サンドボックス等でパスが違う場合)

`build.mjs` は ffmpeg/ffprobe を同梱インストーラから、Chrome を `/opt/pw-browsers`
配下から自動検出します。別の場所を使うときは環境変数で上書きできます:

```bash
export HYPERFRAMES_FFMPEG_PATH=/usr/bin/ffmpeg
export HYPERFRAMES_FFPROBE_PATH=/usr/bin/ffprobe
export PRODUCER_HEADLESS_SHELL_PATH=/path/to/chrome/headless_shell
```

> **注**: 同梱の `@ffmpeg-installer/ffmpeg` は2018年ビルドで、HyperFrames 内蔵の
> 音声ミキサが使う `apad=whole_dur=` 未対応です。そのため本パイプラインは動画のみを
> HyperFrames でレンダリングし、**音声は `build.mjs` が自前で多重化**します
> (この方式なら新旧どちらの ffmpeg でも同じ結果になります)。

## 完全自動投稿にしたい場合(任意)

TikTok / Instagram への直接自動投稿はAPI審査が必要なため、まずは上の
「毎朝ダウンロード→投稿」運用がおすすめです。完全自動化する場合の選択肢:

- **Buffer / Metricool / Later** など予約投稿サービスのAPI・メール投稿機能に
  ワークフローから動画を送る(最も現実的)
- **Meta Graph API**(Instagramリール): Instagramをプロアカウント化+
  Facebookアプリ審査が必要
- **TikTok Content Posting API**: 開発者登録と審査が必要

## 投稿のコツ

- 投稿時間は **朝7〜8時**(通勤時間)または **夜21〜22時** が救急隊員に届きやすい
- 最初の3秒(フック)で止める設計なので、カバー画像はフックのシーンを選ぶ
- プロフィールにアプリのURL(GitHub Pages / 独自ドメイン)を必ず設定
- コメントで「◯◯って英語でなんて言う?」と質問を募ると次のネタとエンゲージが増える

## ファイル構成

| パス | 役割 |
|------|------|
| `build.mjs` | オーケストレータ(カード選択→音声合成→レンダリング→多重化→キャプション) |
| `audio.mjs` | BGM/SFX をコード合成(決定的・ライセンスフリー) |
| `reel/index.html` | HyperFrames コンポジション(CSS + 単一 GSAP タイムライン) |
| `reel/timeline.js` | シーン境界とビートグリッドの唯一の定義(コンポジションと音声で共有) |
| `reel/assets/` | マスコット画像・GSAP(vendor)・フォント(自動DL) |
| `generate.mjs` | 旧パイプライン(Playwright直描画・参考用に残置) |
