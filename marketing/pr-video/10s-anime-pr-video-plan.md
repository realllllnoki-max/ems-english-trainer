# 「机のいらない救急英語」10秒アニメPR動画 制作プラン

- **尺:** 厳密に10秒(3クリップ構成: 3s + 4s + 3s)
- **フォーマット:** 9:16 縦型 1080×1920(TikTok / Instagram Reels / YouTube Shorts)
- **ターゲット:** 日本の救急隊員・消防職員
- **メッセージ:** 「机のいらない救急英語」があれば、言葉の壁による不安を解消し、現場で自信を持って対応できる
- **スタイル:** アニメ調(セルルック / アニメ塗り)。親しみやすく、かつプロフェッショナル
- **プロダクト根拠(リポジトリより):** 発音AI採点・分岐問診シナリオ・単語クイズ・Lv1〜10進行・ストリーク/XP。UIは白背景+赤(#ff4b4b)/アンバー(#ffc800)のDuolingo風カードUI。実収録フレーズ例: *"When did the chest pain start?"* / *"On a scale of one to ten, how bad is the pain?"*

---

## 1. ビデオコンテ(カット構成表)

| カット | 時間 | 場所/画 | カメラ | 芝居 | テロップ | 音声/SE |
|---|---|---|---|---|---|---|
| **C1** | 0.0–1.5s | 走行中の救急車内。赤色灯の光が車内に差し込む | ストレッチャー越しのミディアム→隊員の顔へ素早くプッシュイン | フル装備(活動服+ガウン・ヘルメット・マスク・グローブ)の隊員が、外国人患者に話しかけられ目が泳ぐ。額に汗、瞳が小さく揺れる | ─ | 患者(英語・くぐもった声)「It hurts... please, can you help me?」/ 心電図モニタ音、サイレン遠景 |
| **C2** | 1.5–3.0s | 同上 | 隊員の顔アップで静止気味 | 頭が真っ白になる演出: 背景が白くフラッシュし、線画ノイズ。マスク越しでも伝わる「固まった」表情 | **「外国人傷病者…その時、頭が真っ白になりませんか?」**(白抜き太ゴシック+赤帯) | BGM急停止→低音ドローンのみ。心音SE「ドクン」 |
| **C3** | 3.0–5.0s | 消防署の休憩室。昼、窓から柔らかい光。奥に給茶機とロッカー | ソファに座る隊員をサイドから。手元のスマホへゆっくり寄り | 防護衣を脱いだ活動服姿。リラックスして片手にスマホ。画面には白背景に赤いカードのアプリ問診画面と英文「When did the chest pain start?」+マイクボタン | **「スマホで5分。」**(ポップイン) | 軽快なBGMイン。アプリ操作音「ピコッ」 |
| **C4** | 5.0–7.0s | 同上 | スマホ画面のインサート→隊員の口元(発話)へ切り返し | 隊員が声に出して発音練習 →画面に「Great! 💯」風の採点リングとXPが弾ける。小さくガッツポーズ | **「現場の英語をマスター。」** | 隊員(英語)「When did the chest pain start?」/ 正解ベル音、XPポップ音 |
| **C5** | 7.0–9.0s | 再び救急車内(C1と同じ空間・同じ患者) | C1と同構図から始めて対比を見せ、ゆっくりドリーイン | フル装備に戻った隊員。今度は落ち着いた目でうなずき、タブレットの問診画面を患者に見せながら明瞭に問いかける。患者の表情が和らぎ、うなずき返す | ─ | 隊員(英語・落ち着いた声)「On a scale of one to ten, how bad is the pain?」/ 患者「...Seven.」 |
| **C6** | 9.0–10.0s | 白背景ロゴカード | 静止 | アプリアイコン(🚑ロゴ)+アプリ名がバウンドイン。背後に赤→アンバーの柔らかいグラデーション | **「『机のいらない救急英語』で、現場に自信を。」**+小さく「検索: 机のいらない救急英語」 | 締めのジングル(上昇音)+シャッター的な「タン」 |

**編集メモ**
- C2→C3 は「白フラッシュ」で場面転換(真っ白になる頭→白い休憩室、の意味的ブリッジ)。
- C4→C5 はウィップパン。C5はC1と**同一構図・同一患者**にして Before/After を1カットで伝える。
- テロップはセーフエリア内(上下 250px 回避)。フォントは太めのゴシック(Noto Sans JP Black 相当)、白文字+赤 #ff4b4b の座布団でアプリUIと色を統一。

---

## 2. 動画生成AI用プロンプト(英語)

### 2-0. キャラクター固定ブロック(全クリップ共通・毎回プロンプト先頭に貼る)

キャラクター一貫性のため、以下のブロックを**3クリップすべての冒頭に同一文で**含めます。可能なら Midjourney / 画像生成でこの仕様のキャラクターシートを1枚作り、image-to-video の参照画像(Runway Gen-4 References / Kling Elements / Vidu 参照機能など)として全クリップに渡すのが最も確実です。

```text
CHARACTER SHEET (must remain 100% identical in every shot):
"KAITO" — a young Japanese male paramedic in his late 20s, short neat black
hair, dark brown eyes, kind determined face. He wears the standard Japanese
EMS duty uniform: dark navy-blue coveralls with reflective silver stripes and
an orange "TOKYO FD"-style patch. In ambulance scenes he additionally wears
full infection-control PPE over the uniform: a light-blue disposable isolation
gown, a white EMS helmet with chin strap, a white surgical mask covering nose
and mouth, and blue nitrile gloves. In the break-room scene he wears ONLY the
navy duty coveralls (no PPE), same face and hair.
ART STYLE (identical across all shots): high-quality 2D Japanese anime,
clean cel shading, crisp lineart, soft cinematic lighting, professional
medical-drama anime aesthetic (Cells at Work / production-I.G. quality),
consistent character design, same face proportions in every cut.
FORMAT: vertical 9:16, 1080x1920, 24fps, no text, no captions, no logos,
no watermark.
```

> テロップ・ロゴは**生成後に編集ソフトで載せる**前提のため、全プロンプトで `no text` を指定しています(AI生成の日本語文字は崩れるため)。

### クリップ1(0–3秒 / 緊迫)

```text
[CHARACTER SHEET block here]

SCENE: Interior of a moving Japanese ambulance at night, red emergency
lights pulsing through the windows, medical monitors glowing.
KAITO in FULL PPE (light-blue gown over navy coveralls, white helmet,
surgical mask, blue nitrile gloves) kneels beside a stretcher. A foreign
male patient with light-brown hair lies on the stretcher, face pale and
anxious, speaking to him desperately.
ACTION: Camera pushes in slowly from a medium shot to a close-up of
KAITO's eyes. His eyes widen and tremble, a sweat drop rolls near his
temple; he freezes, unable to answer. In the last 0.5 seconds the
background bleaches toward white with sketchy noise lines, expressing
his mind going blank — anime "panic" effect.
MOOD: tense, urgent, claustrophobic. Cool blue shadows cut by pulsing
red light.
CAMERA: slow push-in, slight handheld shake matching a moving vehicle.
DURATION: exactly 3 seconds.
```

### クリップ2(3–7秒 / 学習)

```text
[CHARACTER SHEET block here]

SCENE: A bright, calm fire-station break room at daytime. Warm sunlight
through a window, lockers and a small kitchenette in the soft-focus
background.
KAITO wears ONLY his navy duty coveralls (no helmet, no mask, no gown —
same face, same black hair as the character sheet). He sits relaxed on
a sofa holding a smartphone in one hand.
ON THE PHONE SCREEN (shown clearly in an insert moment): a clean white
mobile app interface in a Duolingo-like style — a rounded white card
with a red (#ff4b4b) header, a large English sentence displayed as a
question, and a big round red microphone button underneath, with a small
progress bar and streak-flame icon at the top.
ACTION: KAITO looks at the phone, then speaks aloud toward it,
practicing English pronunciation with a slightly playful, focused
expression. The screen responds with a green "correct" glow and small
celebratory sparkles; he gives a small satisfied fist pump and smiles.
MOOD: light, positive, effortless — "learning anywhere, no desk needed".
CAMERA: starts as a side medium shot, gently dollies in toward the
phone, then a quick cut back to his smiling face.
DURATION: exactly 4 seconds.
```

### クリップ3(7–10秒 / 成功)

```text
[CHARACTER SHEET block here]

SCENE: Same ambulance interior as Clip 1, same foreign patient on the
stretcher — but the lighting is now slightly warmer and steadier.
KAITO again in FULL PPE (identical gown, helmet, mask, gloves).
ACTION: KAITO calmly holds a tablet showing the same white-and-red
medical questioning app UI, turning the screen toward the patient while
speaking clearly and confidently — his eyes are steady and reassuring
this time (visible confidence contrast with Clip 1). The foreign
patient's tense face visibly relaxes; he nods with relief. In the final
second, a soft warm glow rises and the shot gently brightens toward
white for the end-card transition.
MOOD: confident, reassuring, heroic-but-humble. Warm rim light.
CAMERA: same framing as Clip 1 for a deliberate before/after echo, slow
gentle dolly-in, stable (vehicle parked).
DURATION: exactly 3 seconds.
```

### ネガティブプロンプト(対応モデル用)

```text
photorealistic, 3D render, live action, extra fingers, deformed hands,
different face between shots, changing hairstyle, text, subtitles,
captions, watermark, logo, gore, blood, graphic injury
```

### 生成運用のヒント

1. **キャラ固定:** まず静止画AIで「KAITO」の3面キャラクターシート(PPEあり/なしの2種)を生成 → 全クリップに参照画像として入力。テキストだけでの一貫性維持より遥かに安定します。
2. **クリップ分割:** 10秒一発生成より 3s/4s/3s の3クリップ+編集結合が高品質。各クリップは1秒程度長めに生成し、編集で正確に 3.0/4.0/3.0 秒へトリム。
3. **アプリ画面:** スマホ/タブレット内のUIは、生成任せにせず**実アプリのスクリーンショットを画面部分に合成**すると製品の実在感が出ます(C3・C5のインサート)。
4. **テロップ・ロゴ・音声:** すべてポスト工程(CapCut / Premiere / 本リポジトリの HyperFrames パイプライン)で付与。

---

## 3. 推奨BGMイメージ

| シーン | 時間 | 楽曲イメージ | 具体像 |
|---|---|---|---|
| 緊迫 | 0–3s | 不安を煽る低音 | 90BPM前後のダークなシネマティック・パルス。低音ドローン+心音キック+高音の細いストリングスの緊張音。2.5s地点でBGMを**急停止**させ「ドクン」という心音SEだけ残す |
| 学習 | 3–7s | 軽快なリズム | 110–120BPMの明るいポップ/ローファイ。マリンバやピチカート+軽いハンドクラップ。アプリの操作音(ピコッ)・正解ベルをビートに同期(既存リールの104BPMビートグリッド演出を踏襲) |
| 成功 | 7–10s | 安心感のある壮大な曲 | 学習パートと同キーのままストリングスとピアノが広がるアップリフティングな展開。9s地点で上昇するジングル→ロゴで「タン」と締め。余韻にリバーブ |

**音楽的な統一のコツ:** 3シーンを別曲にせず「1曲の中で展開が変わる」構成(緊張→ブレイク→ビートイン→サビ)にすると、10秒でも1本の物語として聴こえます。Suno等の音楽生成AIを使う場合のプロンプト例:

```text
10-second cinematic short-form ad music, vertical video: starts with a
dark tense low drone and heartbeat pulse (0-3s), hard stop, then flips
into a bright playful marimba pop groove around 115 BPM (3-7s), and
resolves into an uplifting warm strings-and-piano finale with a short
rising jingle sting at the end (7-10s). No vocals. Clean ending.
```

---

## 4. 制作ログ(Higgsfield MCPで生成済み・2026-07-15)

本プランに基づき、Higgsfield MCP(Seedance 2.0)で実際に生成しました。成果物は本ディレクトリにあります。

| ファイル | 内容 |
|---|---|
| `pr-10s-anime-telop.mp4` | **完成版**(10.0秒・720×1280・テロップ入り・音声つき) |
| `pr-10s-anime-clean.mp4` | テロップなし版(トレンド音源・独自テロップを載せる用) |
| `character-sheet-kaito.png` | 全クリップ共通のキャラクター参照シート(nano_banana_pro生成) |

生成パラメータ: `seedance_2_0` / 9:16 / 720p / mode=std / 各4秒 / `image_references` にキャラシートを指定 / 計約58クレジット消費。

| クリップ | ジョブID | 備考 |
|---|---|---|
| キャラシート | `6785f186-85bd-4e21-8484-377953af4863` | 提供された3面図を忠実に再現 |
| C1 緊迫(0–3s) | `20f76bf3-785f-4f58-aa01-9aa7cf83c1a9` | パニックの集中線演出まで再現 |
| C2 学習(3–7s) | `458c495c-f4da-499e-b101-f92b3c3f849a` | アプリ画面の英文に軽微なタイポあり(下記) |
| C3 成功(7–10s) | `e5f20988-1c52-4a68-9ea4-553258f9e22f` | 初回は安全フィルタ誤判定→表現を緩めて再生成 |

結合はffmpeg。テロップはNoto Sans JP Bold+ブランド赤(#ea2b2b)の座布団で焼き込み。
完成版 `pr-anime-final-with-endcard.mp4`(12.7秒)はシーン間に0.5秒のトランジションを適用:
C1→C2 ホワイトフラッシュ(xfade fadewhite)、C2→C3 ウィップパン風スライド(slideleft)、
C3→エンドカード ホワイトフェード(fadewhite)。音声も各境界で0.5秒クロスフェード。

**既知の改善余地**
- C2のスマホ画面が "cheest pain" と誤綴り(AI生成文字の限界)。差し替える場合は実アプリのスクリーンショットを画面部分に合成
- BGMは未付与(各クリップのネイティブ環境音のみ)。§3のBGM設計に沿って音源を後付け推奨
- C6のロゴカード(9–10s目)は未挿入。現状はC3が10秒目まで続く構成

## 5. 仕上げチェックリスト

- [ ] 3クリップで顔・髪・装備のデザインが一致しているか(特にマスク越しの目)
- [ ] C1とC5が同構図・同患者で Before/After になっているか
- [ ] アプリ画面が実UI(白背景+赤カード+マイクボタン)に見えるか
- [ ] テロップがセーフエリア内・2秒以上表示されているか
- [ ] 合計尺がちょうど10.0秒か
- [ ] 音声(英語セリフ)とBGMのダッキングバランス
