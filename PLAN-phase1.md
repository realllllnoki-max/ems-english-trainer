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
| 配信 | GitHub Pages → Vercel へ移行（Webhook と環境変数のため） |

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
- GitHub Pages は静的配信のみ。**Stripe Webhook を受ける場所がない** → サーバー（Supabase Edge Functions）と新しい配信先（Vercel）が必要。

---

## 2. 目標アーキテクチャ

```
ブラウザ（既存アプリ＋ログインUI）
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
- [ ] Vercel アカウント（GitHub連携）

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

### Step 9. デプロイ
- [ ] Vercel へデプロイ（環境変数: Supabase URL/anon key, Stripe price_id 等）
- [ ] 独自ドメイン設定（任意）
- [ ] GitHub Pages からの導線整理 / リダイレクト

### Step 10. 通し検証（テストモード）
- [ ] サインアップ → 無料範囲が使える
- [ ] テストカード `4242...` で決済 → `is_pro=true` → Lv3解放
- [ ] 解約 → `is_pro=false` → 再ロック
- [ ] 機種変想定（別ブラウザでログイン）→ 進捗が復元される

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

## 7. 法務・運用（フェーズ1と並行で最低限）

オンライン課金には日本の法令上これが必要:
- [ ] **特定商取引法に基づく表記**（事業者名・連絡先・価格・解約/返金条件）
- [ ] **利用規約** / **プライバシーポリシー**
- [ ] 消費税の扱い（980円が税込/税別かを明記）
- [ ] 問い合わせ窓口（メール等）

→ Step 9 までに静的ページとして用意し、決済画面の前に同意導線を置く。

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
- Vercel 上で本番URLが動いている（決済は本番キー切替前のテスト状態でOK）

---

## 10. フェーズ2以降（参考・今回スコープ外）

- 7日間無料トライアル（Stripe trial）
- 年額プラン（割安）
- 解約防止・リマインド
- 学習分析ダッシュボード強化
- アプリ化（PWA / ストア配信）

---

### 次のアクション
この計画でよければ **Step 1（環境準備）** から着手します。具体的には:
1. Supabase は既存プロジェクトを使うか、新規作成するか
2. Stripe のテストキーをいつ用意できるか

を教えてください。私は MCP で Supabase の作成・スキーマ適用まで進められます。
