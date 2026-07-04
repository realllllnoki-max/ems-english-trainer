# フェーズ1 実装計画書 — EMS English Trainer サブスク化（税込1200円/月）

> 目的: いまの「完全クライアントサイドの無料アプリ」を、**ログイン＋Stripeサブスク（税込1200円/月）で有料機能を解放できる状態**にする。
> このフェーズのゴールは **「ユーザーが実際にお金を払えて、払った人だけ有料コンテンツが使える」** こと。

---

## 0. 確定している方針（前回決定済み）

| 項目 | 決定内容 |
|---|---|
| 課金モデル | フリーミアム（一部無料＋残り有料） |
| 価格 | **税込1200円** / 月額 / Stripe サブスクリプション（JPY） |
| 無料範囲 | **レベル1の最初の1問だけ無料**（お試し）。2問目以降・全レベル・全機能は有料 |
| ログイン | Supabase Auth（メール＋Google） |
| 学習記録 | localStorage → Supabase クラウド保存へ移行 |
| Supabaseプラン | **当面 Free（¥0）で開始。安定したら Pro（$25）へ昇格** |
| 提供形態 | **Web ＋ PWA**（ホーム画面に追加できるWebアプリ）。App Store/iOSネイティブは当面なし（フェーズ2の選択肢） |
| 配信（フロント） | GitHub Pages または Cloudflare Pages（**無料・商用OK**のまま継続） |
| 配信（バックエンド） | Supabase Edge Functions（決済・Webhook・有料判定） |

> **提供形態を「Web＋PWA」に確定。** Apple/Google の課金手数料（15〜30%）を回避でき、Stripe（3.6%）のまま・追加固定費ほぼ¥0でアプリ風の体験を提供できる。共通アカウント／有料判定／記録同期のため **Supabase は必要**（iPhone・Android・PCを横断して同じアカウントで使えるようにするため）。

---

## 1. 現状アーキテクチャ（調査結果）

完全クライアントサイドの静的アプリ。

| ファイル | 役割 | 行数規模 |
|---|---|---|
| `index.html` | 画面・CSS | 約44KB |
| `ems-app.js` | 動作ロジック | 約59KB |
| `ems-data.js` | シナリオ・単語データ | 約233KB |

### 有利な発見（ここが統合ポイント）

1. **ストレージ抽象化が既にある** — `ems-app.js` 冒頭の `window.storage` シム
   ```js
   window.storage = {
     get: async (k) => ({ value: localStorage.getItem(k) }),
     set: async (k, v) => { ... }
   };
   ```
   保存系（進捗・統計・単語）はすべてこの `storage.get/set` を経由する。
   → **クラウド同期は、このシムを Supabase 対応版に差し替えるだけ**で広範囲に効く。

2. **レベル解放の単一窓口がある** — `lvUnlocked(lv)`（`ems-app.js` 419行目付近）
   ```js
   function lvUnlocked(lv){ if(lv===1) return true; ... }
   ```
   → **有料ロック判定は、この関数1か所に `is_pro` を絡めるだけ**で済む。

3. 保存キー一覧（クラウド移行の対象）
   - `ems_progress_v1`（レベル進捗 / `STORE_KEY`）
   - `ems_stats_v1`（ストリーク・XP・カレンダー / `STATS_KEY`）
   - `ems_vocab_v1`, `ems_vocab_weak_v1`（単語進捗）
   - `ems_sound`（設定。同期不要）

### 制約（だから裏側が必要）
- JS もデータも全部ブラウザに配布されるため、**フロントだけでは課金を守れない**。
- GitHub Pages は静的配信のみ。**Stripe Webhook を受ける場所がない** → サーバー処理は **Supabase Edge Functions** が担当する（フロントは GitHub Pages / Cloudflare Pages のまま無料・商用OKで継続でき、Vercel等への移行は不要）。

---

## 2. 目標アーキテクチャ

```
ブラウザ（既存アプリ＋ログインUI）
  ▲ 静的配信: GitHub Pages または Cloudflare Pages（無料・商用OK）
  │
  ├─ Supabase Auth ───────── メール / Google ログイン
  │
  ├─ Supabase DB
  │     ├─ profiles            … user_id, is_pro, stripe_customer_id
  │     └─ user_progress       … user_id, key, value（保存データの受け皿）
  │
  ├─「Proにする」ボタン
  │     └→ Edge Function: create-checkout-session
  │            └→ Stripe Checkout（税込1200円/月）へリダイレクト
  │
  └─「プラン管理」ボタン
        └→ Edge Function: create-portal-session
               └→ Stripe カスタマーポータル（解約・カード変更）

Stripe ──(Webhook)──→ Edge Function: stripe-webhook
                          └→ profiles.is_pro を true/false に更新
```

---

## 3. データモデル（Supabase）

### `profiles`
| カラム | 型 | 説明 |
|---|---|---|
| `id` | uuid (PK) | `auth.users.id` と同じ |
| `email` | text | 表示用 |
| `is_pro` | boolean | **有料判定の正本**。default false |
| `stripe_customer_id` | text | Stripe 顧客ID（解約・ポータル用） |
| `current_period_end` | timestamptz | 有効期限（任意・表示用） |
| `created_at` | timestamptz | default now() |

### `user_progress`（クラウド同期の受け皿）
| カラム | 型 | 説明 |
|---|---|---|
| `user_id` | uuid (FK) | 所有者 |
| `key` | text | `ems_progress_v1` 等の保存キー |
| `value` | jsonb | 保存内容 |
| `updated_at` | timestamptz | 競合解決用 |
| （PK: `user_id` + `key`） | | |

### RLS（行レベルセキュリティ）— 必須
- `profiles`: 本人のみ SELECT 可。**`is_pro` はクライアントから UPDATE 不可**（Webhook/サーバーのみ更新）。
- `user_progress`: 本人のみ SELECT / INSERT / UPDATE 可。
- ※ `is_pro` をクライアントから書ければ課金が無意味になるため、ここは厳格に。

---

## 4. 無料 / 有料の線引き

| 範囲 | 無料 | 有料 (Pro) |
|---|---|---|
| シナリオ | **レベル1の最初の1問だけ** | Lv1の2問目以降＋Lv2〜10 全部 |
| 単語クイズ | 不可（有料） | 全カテゴリ |
| 発音トレーニング | Lv1の1問目のみ | 制限なし |
| 記録・ストリーク・バッジ・カレンダー | ローカルのみ | クラウド同期＋フル機能 |

> 強めの「1問お試し → 即ペイウォール」設計。最初の1問で価値を体験させ、続きは課金で解放する。

実装上の急所（ロックは"レベル単位"ではなく"問題単位"）:
- **無料で開けるのは Lv1 の先頭シナリオ1問のみ**。それ以外を開こうとしたら課金画面。
- 具体的には「`!is_pro` かつ（Lv1先頭シナリオ以外）→ ペイウォール表示」のガードを問題開始時に入れる。
- `lvUnlocked(lv)` も `!is_pro` なら Lv2以降をロック（既存の「🔒 未解放」UIを流用）。
- Lv1 の2問目を開こうとした瞬間にも **「Proで解放」CTA** を出す。

---

## 5. 作業ステップ（実装順）

> 各ステップは独立して動作確認できる粒度に分割。開発・検証は **Stripe テストモード** で進め、2026-07-04 に **本番（Live）モードへ移行済み**。

### Step 1. 環境準備（コードなし）
- [x] **Supabase プロジェクト作成済み**（Free / 東京リージョン）
- [x] Stripe アカウント（既存アカウントに相乗り）→ テストモードのキー取得 → **本番キーへ移行済み**（2026-07-04）
- [x] フロント配信先の決定 → **GitHub Pages** で継続

> **作成済み Supabase プロジェクト情報（フロント設定で使う・公開して安全な値）**
> - プロジェクト名: `ems-english-trainer` / ref: `widfjtfhqjpnjdfsnlnx` / Region: ap-northeast-1（東京）/ プラン: Free
> - `SUPABASE_URL`: `https://widfjtfhqjpnjdfsnlnx.supabase.co`
> - `SUPABASE_ANON_KEY`（publishable）: `sb_publishable_d3iTRI9F9tQddtvf7PjiVA_4RqoTpqr`
> - ⚠️ service role キーはここに記載しない（Edge Function のシークレットにのみ設定）

### Step 2. Supabase スキーマ ✅ 適用済み
- [x] `profiles` / `user_progress` テーブル作成（migration `init_profiles_and_progress`）
- [x] RLS ポリシー設定（profiles=本人SELECTのみ／is_proはクライアント書込不可、user_progress=本人CRUD）
- [x] `auth.users` 作成時に `profiles` を自動生成するトリガー（`handle_new_user`）
- [x] セキュリティ強化: トリガー関数の REST 直叩きを禁止（EXECUTE剥奪）→ アドバイザー警告0件

### Step 3. 認証UI（フロント）✅ メール認証ぶん完了
- [x] `index.html` に Supabase JS SDK（CDN）を読み込み
- [x] ログイン/サインアップ画面（**メール＋パスワード**）追加 … `ems-auth.js`＋index.htmlのモーダル
- [x] ログイン状態の取得・ヘッダーへのアカウント表示（`#emsAccount`、頭文字アバター）
- [x] 未ログインでも無料範囲は触れる（任意ログイン。`window.EMSAuth` を後続ステップ用に公開）
- [x] バックエンド検証: 新規ユーザー作成→profiles自動生成（トリガー）を実DBで確認
- [ ] **Google ログイン**（後追い） … Google OAuth クライアントID/シークレットの用意後に追加
- 補足: SDKはCDN配信のため、ログイン操作には通信が必要（オフライン時はログイン不可・無料範囲は動作）。
- 補足: 既定でメール確認ON。新規登録時は確認メール内リンクで有効化される。

### Step 4. クラウド同期（`window.storage` 差し替え）✅ 完了
- [x] `ems-sync.js` を追加し `window.storage.set` をラップ（local保存＋クラウドupsert）
- [x] オフラインファースト設計: get は常に localStorage（未ログイン・オフラインでも動作）
- [x] ログイン時、**キー単位で更新時刻が新しい方を採用**してマージ（別端末の続きを復元）
- [x] 取り込み後はアプリ状態を再読込（loadProgress/loadStats等）して画面更新
- [x] 既存の保存キー（`ems_progress_v1`/`ems_stats_v1`/`ems_vocab_v1`/`ems_vocab_weak_v1`）を流用、`ems_sound`等の端末設定は非同期
- [x] 実DB検証（実JWT・RLS下）: upsert / pull / 新しい方優先 / 他人の行は不可視 / **is_proのクライアント書込はブロック**
- 既知の制限（フェーズ2で対応可）: 1端末で複数アカウントを切替えると、ローカル記録が次アカウントへ混ざりうる（ログアウト時クリア等で対処予定）

> **決済アカウント方針: 既存Stripeアカウントに相乗り（決定）。** 既存事業の決済と混ざらないよう、
> `stripe-webhook` は **STRIPE_PRICE_ID でフィルタ**し、本アプリの価格のサブスクリプションだけを処理する。

### Step 5. Stripe 決済（解放動線）
- [x] Edge Function `create-checkout-session` 実装＋デプロイ（要ログイン→Checkout URL返却、Stripe顧客の作成/紐付け）
- [x] Edge Function `create-portal-session` 実装＋デプロイ（解約・カード変更のポータルURL返却）
- [x] Stripe ダッシュボードで商品「EMS English Pro / 税込1200円・月額・JPY」を作成（price_id取得）✅
- [x] アプリに「Proにする」ボタン（Step 7で実装）
- リポジトリにソース保存: `supabase/functions/<name>/index.ts`

### Step 6. Webhook（有料判定の確定）
- [x] Edge Function `stripe-webhook` 実装＋デプロイ（`verify_jwt=false`＋Stripe署名検証）
  - `checkout.session.completed` → サブスク取得→自社priceなら `is_pro=true`＋`current_period_end`
  - `customer.subscription.updated/deleted` → status に応じ `is_pro` 切替（失効で false）
  - **STRIPE_PRICE_ID で自社商品のみ処理**（相乗り対策）
  - service role は Edge 既定の `SUPABASE_SERVICE_ROLE_KEY` を使用（フロントには出ない）
- [x] Stripe 側に Webhook エンドポイント登録（署名シークレット取得）✅
- [x] シークレット設定（Supabase Dashboard → Edge Functions → Secrets）:
  `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID` ✅
- [x] **サーバー検証済み**: 実JWTで `create-checkout-session` を叩き、本物の Stripe Checkout URL を生成（キー＋price_id 正当性を確認）。`stripe-webhook` は署名検証が稼働（偽署名で400）
- [x] **本番（Live）移行完了**（2026-07-04）: 本番の制限付きキー・商品・3価格（月額/6ヶ月/1年）・Webhookエンドポイントを作成し、Supabaseの5シークレットを本番値に差し替え済み。カスタマーポータルの解約機能も本番で有効化済み。読み取り専用で全項目を最終検証（`livemode: true`・金額/周期一致・Webhook有効・ポータル`cancel_enabled: true`）

### Step 7. フロントのロック/解放 ✅ 完了
- [x] ログイン後 `profiles.is_pro` を取得（`ems-auth.js`: `EMSAuth.refreshPro` → `window.EMS_PRO`＋`ems-pro-change`イベント）
- [x] **アクション単位ガード**（`ems-paywall.js`）: `startScene`/`startQuiz`/`startTest` をラップし、非Proが「Lv1先頭シナリオ以外」を開いたらペイウォール
- [x] ペイウォールモーダル（特典一覧・税込1200円/月・「Proにする」「まずは無料の1問を試す」）
- [x] 「Proにする」→ `create-checkout-session` 呼び出しで Checkout へ遷移（未ログインならログインへ誘導）
- [x] 決済戻り（`?checkout=success`）検知 → is_pro を数回ポーリングしてUI更新＋トースト
- 設計メモ: 既存の `lvUnlocked()`（進捗で解放）は変更せず、収益ロックは**開始アクションで一元的に**かける（最小侵襲）
- 無料シナリオ＝Lv1の先頭（現データでは `choking`）。別シナリオを無料にしたい場合は容易に変更可
- 検証: ロック→ペイウォール / 無料1問は通過 / Pro時バイパス / 単語クイズもロック をブラウザで確認

### Step 8. カスタマーポータル ✅ 完了
- [x] Edge Function `create-portal-session`（Step 5でデプロイ済み）
- [x] アカウントモーダルに「プラン管理（解約・カード変更）」ボタン（Pro時のみ表示、`ems-paywall.js`）
- [x] アカウントモーダルにプラン状態バッジ＋「Proにアップグレード」ボタン（非Pro時）
- 補足: Stripe側で Billing Portal の有効化が必要（テスト/本番とも）

### Step 9. PWA化（ホーム画面に追加できるアプリ風に）✅ 完了
- [x] `manifest.json` 追加（アプリ名・アイコン3種・テーマ色・`display:standalone`・相対パス）
- [x] Service Worker（`sw.js`）追加 — 同一オリジン資産をキャッシュ（HTML=network-first / 資産=stale-while-revalidate、CDN/Supabaseは素通し）
- [x] アイコン生成（既存ロゴをChromiumでPNG化）: `icon-192/512`（any）・`icon-maskable-512`・`apple-touch-icon-180`
- [x] 「ホーム画面に追加」案内（`ems-pwa.js`）: Android/ChromeはInstallボタン、iOS Safariは手動手順を一度だけ表示
- [x] iOS/Android用メタタグ（apple-mobile-web-app-capable 等）を追加
- [x] ブラウザ検証: manifest解析・SW登録・アイコン200 を確認
- 配信HTTPSは GitHub Pages / Cloudflare Pages とも標準対応（公開時に有効化）
- ※ App Store審査・Apple Developer登録は不要。追加固定費¥0。

### Step 10. デプロイ ✅ 完了
- [x] フロント: **GitHub Pages で公開**（`https://realllllnoki-max.github.io/ems-english-trainer/`）
- [x] フロントの公開設定値（Supabase URL / publishable key）を埋め込み
- [x] バックエンド: Supabase Edge Functions デプロイ＋シークレット設定（service role / Stripe secret / webhook secret は Edge のみ）
- [ ] 独自ドメイン設定（任意・後日）

### Step 11. 通し検証（テストモード）
- [x] サインアップ → 無料範囲が使える（公開URLで確認）
- [x] 無料状態で Lv1の1問目は解ける／他はペイウォール（🔒/無料バッジ表示）
- [x] **テストカード `4242...` で決済 → `is_pro=true` → 全解放**（DB確認: is_pro=true, stripe_customer_id, current_period_end）✅
- [x] 解約テスト（2026-07-04・API検証）: Stripeテストモードで `cancel_at_period_end=true` にしても `is_pro=true` を維持（即時ロックなし）→ 実キャンセルで `customer.subscription.deleted` 発火 → `is_pro=false` に正しく反映
- [x] 機種変想定（2026-07-04・API検証）: 新規セッション（ローカルデータ無し）でログイン→ `user_progress` をRLS越しに取得しクラウド側の進捗が正しく返る経路を確認。**実ブラウザでの目視確認は未実施**（サンドボックス環境が外部インターネットに未対応のため）。ご自身の端末で一度確認推奨
- [x] PWA確認（2026-07-04・コードレビュー）: `manifest.json`/`sw.js`/`ems-pwa.js`/アイコン一式の妥当性を確認済み。**実機での「ホーム画面に追加」動作確認は未実施**、お手元のスマホでの確認推奨

---

## 6. 環境変数 / シークレット一覧

| 名前 | 置き場所 | 用途 |
|---|---|---|
| `SUPABASE_URL` | フロント / Edge | 接続先 |
| `SUPABASE_ANON_KEY` | フロント | 公開可・RLS前提 |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge のみ | Webhookで `is_pro` 更新（**絶対フロント禁止**） |
| `STRIPE_SECRET_KEY` | Edge のみ | Checkout/Portal作成（本番は制限付きキーrk_live_を使用） |
| `STRIPE_WEBHOOK_SECRET` | Edge のみ | Webhook署名検証 |
| `STRIPE_PRICE_ID` | Edge | 月額（税込1,200円）プランの price |
| `STRIPE_PRICE_ID_6M` | Edge | 6ヶ月（税込6,000円）プランの price |
| `STRIPE_PRICE_ID_1Y` | Edge | 1年（税込9,800円）プランの price |

> サーバー専用キー（service role / Stripe secret）は**絶対にフロントへ出さない**。Edge Function 内のみ。

---

## 6.5 運用コストとキャパシティ

> 為替は概算 **1ドル≒155円**。価格は2026年時点の各社プラン基準。

### コスト構造
| サービス | 無料枠 | 有料の入口 | 課金の性質 |
|---|---|---|---|
| **Stripe** | 月額固定なし | — | 決済ごと **3.6%**（日本のカード）。1200円なら**約43円/件** |
| **Supabase** | 0円（MAU 5万・DB 500MB・Edge 50万回）※1週間無アクセスで一時停止 | **Pro $25/月**（≒¥3,900）MAU 10万・DB 8GB・Edge 200万回・停止なし・自動バックアップ | 月額固定 |
| **フロント配信** | **GitHub Pages / Cloudflare Pages = 0円・商用OK** | — | **追加費用なし** |
| **独自ドメイン** | — | 年¥1,500前後（≒¥125/月） | 年額（任意） |

> 前回案の Vercel は不要にした。Vercel Hobby は無料だが「非商用限定」のため本番課金で Pro($20/月) が必要になる。
> GitHub Pages / Cloudflare Pages は無料かつ商用OKなので、フロント配信費は **検証中も本番も¥0**。

### 2つの運用モード
- **A. 検証フェーズ:** Supabase Free ＋ 無料配信 ＋ Stripeテスト → 固定費 **ほぼ¥0**（Supabase一時停止に注意。実験用途まで）
- **B. 本番運用:** Supabase Pro $25 ＋ 無料配信 ＋ Stripe 3.6% → 固定費 **約¥4,000/月＋ドメイン**

### 採用方針:まずは Free で開始（赤字リスクをゼロにする）
**「安定するまで Supabase は Free プラン」** で進める。理由と運用ルール:

- **Free は請求が発生しない** → 使いすぎても「制限/停止」になるだけで、**金銭リスクはゼロ**。
- **売上が先・コストが後:** 有料顧客が付いて売上が立ってから Pro($25) に上げる。**約4人で$25を回収**できるので、赤字期間が構造的に生まれない。
- Pro 昇格後も **Spend Cap（支出上限）を ON** にすれば月$25で頭打ち固定。

**Free 運用中の注意点と対策:**
| 注意点 | 対策 |
|---|---|
| 自動バックアップが無い | DBが小さいので**定期的に手動エクスポート**（数分）。課金が回り出したらPro昇格でバックアップ自動化 |
| 7日間無アクセスで一時停止 | 実ユーザーが使えば停止しない。初期だけ**キープアライブping**（数日おきに軽くアクセス）で保険 |
| 容量 DB500MB / Edge50万回/月 | このアプリのデータ量なら**数千人規模まで**問題なし |

**Pro へ昇格する目安（どれか満たしたら）:**
- 有料顧客が付いて売上で$25を十分まかなえる
- バックアップ無しが怖くなる規模の顧客データになった
- 一時停止やレート制限が実際に不便になってきた

### 有料ユーザー数 → 損益（本番モード・固定費 約¥4,000/月）
| 有料数 | 売上(税込1200円) | Stripe手数料 | 固定費 | **手残り** |
|---|---|---|---|---|
| 5人 | 6,000 | 216 | 4,000 | **約+1,784** |
| 50人 | 60,000 | 2,160 | 4,000 | **約+53,840** |
| 100人 | 120,000 | 4,320 | 4,000 | **約+111,680** |
| 500人 | 600,000 | 21,600 | 4,000 | **約+574,400** |
| 1,000人 | 1,200,000 | 43,200 | 4,000 | **約+1,152,800** |
| 5,000人 | 6,000,000 | 216,000 | ~10,000 | **約+5,774,000** |

→ **約4人で黒字**。固定費が小さく、ほぼ「人数 × 約1,157円」が利益になる。

### キャパシティ（何人まで捌けるか）
このアプリはデータが極小（全ファイル約330KB、1ユーザーの進捗JSONは数KB）でインフラがボトルネックになりにくい。

| プラン | 実質上限 | 最初に当たる制約 |
|---|---|---|
| 無料枠 | 〜約1,000人（検証用） | Supabase一時停止 |
| **Supabase Pro（¥約4,000/月）＋無料配信** | **約5〜10万人** | MAU 10万 / Edge Function 200万回（1人月30操作なら約6.6万人） |
| Supabase 上位プラン | 数十万人〜 | MAU超過の従量・帯域 |

- DB容量 8GB ÷ 5KB ≒ **約160万人分** → DBは当面ボトルネックにならない。
- **結論: ¥約4,000/月の構成のまま数万人規模（MAU 10万）まで増強不要。**

---

## 7. 法務・運用（フェーズ1と並行で最低限）

オンライン課金には日本の法令上これが必要:
- [x] **特定商取引法に基づく表記** … `tokushoho.html`（ひな形作成済み・価格1200円税込・解約/返金条件を記載）
- [x] **利用規約** … `terms.html`（ひな形）／ **プライバシーポリシー** … `privacy.html`（ひな形、Supabase/Stripe委託を明記）
- [x] 消費税の扱い → **税込1200円**（価格表示・特商法表記ともに「税込」と明記）
- [x] アプリ下部に3ページへのリンク導線を設置（`legal.css` 共通スタイル）
- [x] **ユーザー作業**: 各ページの プレースホルダ（事業者名・住所・連絡先・管轄・更新日）を記入済み（2026-07-03）
- [x] 決済前に規約同意のチェックを設置（`payAgreeChk`、未チェックは「このプランで続ける」を無効化）

→ 法務3ページは記入完了。Step 10 デプロイへ進める。

---

## 8. リスク・注意点

| リスク | 対策 |
|---|---|
| `is_pro` をクライアント改ざん | サーバー（Webhook）のみ更新＋RLSで書込禁止。重要判定はサーバーでも確認 |
| ローカル進捗とクラウドの競合 | `updated_at` で新しい方優先。初回ログイン時はマージ |
| Webhook取りこぼし | Stripe再送＋冪等処理。定期的に subscription 状態を照合 |
| データ漏洩 | service role キーは Edge のみ。フロントは anon＋RLS |
| 解約後も使えてしまう | `current_period_end` 失効で `is_pro=false` |

---

## 9. このフェーズの完了条件（Definition of Done）

- [x] テストモードで「サインアップ → Lv1の1問目だけ無料 → 決済 → 全解放 → 解約 → 再ロック」が一通り動く
- [x] 別端末ログインで学習記録が復元される（API検証済み。実ブラウザでの目視確認は任意で推奨）
- [x] 特商法表記・規約・プライバシーの3ページが存在し導線がある（プレースホルダ記入済み・2026-07-03）
- [x] 本番URL（GitHub Pages）が動いている
- [x] **本番Stripeキーへの切替完了**（2026-07-04）→ 実際のクレジットカードで課金可能な状態

→ **フェーズ1の完了条件をすべて満たした。** 残るのは任意項目（Googleログイン・独自ドメイン・実機PWA確認）のみ。

---

## 10. フェーズ2以降（参考・今回スコープ外）

- 7日間無料トライアル（Stripe trial）
- 年額プラン（割安）
- 解約防止・リマインド
- 学習分析ダッシュボード強化

### App Store / Google Play 配信（検討する場合のコスト比較）
フェーズ1は **Web＋PWA** で進める（PWAはフェーズ1のStep 9で対応済み）。
ストア配信は手数料・固定費・開発が一段上がるため、需要が見えてから検討する。

| 提供形態 | 追加固定費 | 決済手数料 | 備考 |
|---|---|---|---|
| **Web ＋ PWA（採用）** | **¥0** | Stripe **3.6%** | App Store審査・Apple登録不要。今回これ |
| iOS（Apple IAP・小規模事業者※） | Apple Developer **$99/年** | **15%** | StoreKitへ作り替え。審査リジェクトのリスク |
| iOS（Apple IAP・通常） | $99/年 | **30%** | 年商10万ドル超で通常レート |
| Android（Google Play） | $25（一度きり） | 15〜30% | Play Billingが必要 |

- ※小規模事業者: 年商10万ドル未満なら App Store Small Business Program で15%。
- iOSアプリ内から「Webで安く買える」と誘導するのは Apple規約で原則制限（anti-steering）。
- 税込1200円での手残り目安: Web=約1,157円 / iOS(15%)=約1,020円 / iOS(30%)=約840円。
- ストアに出すなら「Web版で契約 → アプリはログイン専用クライアント」のハイブリッドも選択肢。

---

### 次のアクション
この計画でよければ **Step 1（環境準備）** から着手します。具体的には:
1. Supabase は既存プロジェクトを使うか、新規作成するか
2. Stripe のテストキーをいつ用意できるか

を教えてください。私は MCP で Supabase の作成・スキーマ適用まで進められます。
