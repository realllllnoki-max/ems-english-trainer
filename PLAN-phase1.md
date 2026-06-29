# フェーズ1 実装計画書 — EMS English Trainer サブスク化（980円/月）

> 目的: いまの「完全クライアントサイドの無料アプリ」を、**ログイン＋Stripeサブスク（980円/月）で有料機能を解放できる状態**にする。
> このフェーズのゴールは **「ユーザーが実際にお金を払えて、払った人だけ有料コンテンツが使える」** こと。

---

## 0. 確定している方針（前回決定済み）

| 項目 | 決定内容 |
|---|---|
| 課金モデル | フリーミアム（一部無料＋残り有料） |
| 価格 | 980円 / 月額 / Stripe サブスクリプション（JPY） |
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
  │            └→ Stripe Checkout（980円/月）へリダイレクト
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
| レベル | Lv1〜2 | Lv3〜10 全部 |
| 単語クイズ | 一部カテゴリ | 全カテゴリ |
| 発音トレーニング | お試し可 | 制限なし |
| 記録・ストリーク・バッジ・カレンダー | ローカルのみ | クラウド同期＋フル機能 |

実装上の急所:
- **`lvUnlocked(lv)`** に「lv>=3 かつ !is_pro ならロック」を追加。
- ロック時は既存の「🔒 未解放」UIを流用しつつ、**「Proで解放」導線**を表示。

---

## 5. 作業ステップ（実装順）

> 各ステップは独立して動作確認できる粒度に分割。すべて **Stripe テストモード** で進める。

### Step 1. 環境準備（コードなし）
- [ ] Supabase プロジェクト用意（MCP接続済み。既存利用 or 新規作成を決める）
- [ ] Stripe アカウント作成 → **テストモード**の Publishable / Secret キー取得
- [ ] フロント配信先の決定（GitHub Pages 継続 or Cloudflare Pages。どちらも無料・商用OK）※新規アカウント・追加費用は不要

### Step 2. Supabase スキーマ
- [ ] `profiles` / `user_progress` テーブル作成（migration）
- [ ] RLS ポリシー設定（上記4章準拠）
- [ ] `auth.users` 作成時に `profiles` を自動生成するトリガー

### Step 3. 認証UI（フロント）
- [ ] `index.html` に Supabase JS SDK を読み込み
- [ ] ログイン/サインアップ画面（メール＋Googleボタン）追加
- [ ] ログイン状態の取得・ヘッダーへのアカウント表示
- [ ] 未ログインでも無料範囲は触れる（任意ログイン）

### Step 4. クラウド同期（`window.storage` 差し替え）
- [ ] ログイン中は `storage.get/set` を `user_progress` 読み書きに切替
- [ ] 未ログイン時は従来どおり localStorage
- [ ] ログイン時、ローカルにある既存進捗をクラウドへ初回マージ
- [ ] 既存の保存キー（`ems_progress_v1` 他）はそのまま流用

### Step 5. Stripe 決済（解放動線）
- [ ] Stripe で商品「EMS English Pro / 980円・月額・JPY」を作成（price_id 取得）
- [ ] Edge Function `create-checkout-session`（要ログイン → Checkoutへ）
- [ ] アプリに「Proにする」ボタン（ロック画面・メニュー）

### Step 6. Webhook（有料判定の確定）
- [ ] Edge Function `stripe-webhook`
  - `checkout.session.completed` → `is_pro=true`, `stripe_customer_id` 保存
  - `customer.subscription.deleted` / 失効 → `is_pro=false`
- [ ] Stripe 側に Webhook エンドポイント登録（署名シークレット設定）

### Step 7. フロントのロック/解放
- [ ] ログイン後 `profiles.is_pro` を取得
- [ ] `lvUnlocked()` に `is_pro` を反映（Lv3以降）
- [ ] 単語・記録機能のロック反映
- [ ] ロック画面に「Proで解放（980円/月）」CTA

### Step 8. カスタマーポータル
- [ ] Edge Function `create-portal-session`
- [ ] メニューに「プラン管理（解約・カード変更）」ボタン

### Step 9. PWA化（ホーム画面に追加できるアプリ風に）
- [ ] `manifest.json` 追加（アプリ名・アイコン・テーマ色・`display:standalone`）
- [ ] Service Worker 追加（オフラインキャッシュ。`index.html`/`ems-app.js`/`ems-data.js` を事前キャッシュ）
- [ ] アイコン画像（既存のSVGロゴ流用で各サイズ生成）
- [ ] 「ホーム画面に追加」案内（iOS Safari は手動追加なので軽い導線を出す）
- [ ] HTTPS配信であること（GitHub Pages / Cloudflare Pages とも標準対応）
- ※ App Store審査・Apple Developer登録は不要。追加固定費¥0。

### Step 10. デプロイ
- [ ] フロント: GitHub Pages 継続、または Cloudflare Pages へ（どちらも無料・商用OK）
- [ ] フロントの公開設定値（Supabase URL / anon key / Stripe publishable key）を埋め込み ※すべて公開して安全な値のみ
- [ ] バックエンド: Supabase Edge Functions をデプロイ＋シークレット設定（service role / Stripe secret / webhook secret は Edge のみ）
- [ ] 独自ドメイン設定（任意）

### Step 11. 通し検証（テストモード）
- [ ] サインアップ → 無料範囲が使える
- [ ] テストカード `4242...` で決済 → `is_pro=true` → Lv3解放
- [ ] 解約 → `is_pro=false` → 再ロック
- [ ] 機種変想定（別ブラウザでログイン）→ 進捗が復元される
- [ ] スマホで「ホーム画面に追加」→ アプリ風に起動できる（PWA確認）

---

## 6. 環境変数 / シークレット一覧

| 名前 | 置き場所 | 用途 |
|---|---|---|
| `SUPABASE_URL` | フロント / Edge | 接続先 |
| `SUPABASE_ANON_KEY` | フロント | 公開可・RLS前提 |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge のみ | Webhookで `is_pro` 更新（**絶対フロント禁止**） |
| `STRIPE_SECRET_KEY` | Edge のみ | Checkout/Portal作成 |
| `STRIPE_WEBHOOK_SECRET` | Edge のみ | Webhook署名検証 |
| `STRIPE_PRICE_ID` | Edge | 980円プランの price |

> サーバー専用キー（service role / Stripe secret）は**絶対にフロントへ出さない**。Edge Function 内のみ。

---

## 6.5 運用コストとキャパシティ

> 為替は概算 **1ドル≒155円**。価格は2026年時点の各社プラン基準。

### コスト構造
| サービス | 無料枠 | 有料の入口 | 課金の性質 |
|---|---|---|---|
| **Stripe** | 月額固定なし | — | 決済ごと **3.6%**（日本のカード）。980円なら**約35円/件** |
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
- **売上が先・コストが後:** 有料顧客が付いて売上が立ってから Pro($25) に上げる。**約5人で$25を回収**できるので、赤字期間が構造的に生まれない。
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
| 有料数 | 売上(980円) | Stripe手数料 | 固定費 | **手残り** |
|---|---|---|---|---|
| 5人 | 4,900 | 176 | 4,000 | **約+720（損益分岐点付近）** |
| 50人 | 49,000 | 1,764 | 4,000 | **約+43,200** |
| 100人 | 98,000 | 3,528 | 4,000 | **約+90,500** |
| 500人 | 490,000 | 17,640 | 4,000 | **約+468,000** |
| 1,000人 | 980,000 | 35,280 | 4,000 | **約+940,700** |
| 5,000人 | 4,900,000 | 176,400 | ~10,000 | **約+4,710,000** |

→ **約5人で黒字**。固定費が小さく、ほぼ「人数 × 約945円」が利益になる。

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
- [ ] **特定商取引法に基づく表記**（事業者名・連絡先・価格・解約/返金条件）
- [ ] **利用規約** / **プライバシーポリシー**
- [ ] 消費税の扱い（980円が税込/税別かを明記）
- [ ] 問い合わせ窓口（メール等）

→ デプロイ（Step 10）までに静的ページとして用意し、決済画面の前に同意導線を置く。

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

- テストモードで「サインアップ → 決済 → Lv3解放 → 解約 → 再ロック」が一通り動く
- 別端末ログインで学習記録が復元される
- 特商法表記・規約・プライバシーの3ページが存在し導線がある
- 本番URL（GitHub Pages / Cloudflare Pages）が動いている（決済は本番キー切替前のテスト状態でOK）

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
- 980円での手残り目安: Web=約945円 / iOS(15%)=約833円 / iOS(30%)=約686円。
- ストアに出すなら「Web版で契約 → アプリはログイン専用クライアント」のハイブリッドも選択肢。

---

### 次のアクション
この計画でよければ **Step 1（環境準備）** から着手します。具体的には:
1. Supabase は既存プロジェクトを使うか、新規作成するか
2. Stripe のテストキーをいつ用意できるか

を教えてください。私は MCP で Supabase の作成・スキーマ適用まで進められます。
