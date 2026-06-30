# Stripe 設定手順（手動・既存アカウント相乗り）

> 目的: デプロイ済みの決済バックエンドを動かすために、Stripe 側の設定と Supabase シークレットを用意する。
> **すべて最初は「テストモード」で**。本番公開時に本番キーへ差し替える。

## 事前情報
- Supabase プロジェクト ref: `widfjtfhqjpnjdfsnlnx`
- **Webhook URL（後で使う）**:
  `https://widfjtfhqjpnjdfsnlnx.supabase.co/functions/v1/stripe-webhook`
- 価格: **税込1200円 / 月 / JPY**

---

## STEP 1. テストモードに切り替える
1. https://dashboard.stripe.com にログイン
2. 右上の **「テスト環境」トグルをON**（オレンジ色の「テストモード」表示になればOK）
   - 以降の作業はすべてこのテストモードで行う。

## STEP 2. 商品と価格を作る → `price_id`
1. 左メニュー **「商品カタログ（Product catalog）」→「商品を追加」**
2. 入力:
   - 名前: `EMS English Pro`
   - （説明は任意）
3. 料金体系:
   - 価格モデル: **標準（定額）**
   - 金額: **1200**　通貨: **JPY**
   - **継続（Recurring）** / 請求期間 **月次（Monthly）**
4. **保存（商品を追加）**
5. 作成された価格の詳細を開き、**価格ID `price_...` をコピー**して控える
   - ※JPYは小数なし通貨なので「1200」でOK（=税込1200円として扱う）

## STEP 3. Webhook を登録 → `whsec_...`
1. 左メニュー **「開発者（Developers）」→「Webhook」→「エンドポイントを追加」**
2. **エンドポイントURL** に Webhook URL を貼る:
   `https://widfjtfhqjpnjdfsnlnx.supabase.co/functions/v1/stripe-webhook`
3. **「イベントを選択」** で次の3つにチェック:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. **エンドポイントを追加**
5. 作成したエンドポイントの詳細で **「署名シークレット（Signing secret）`whsec_...`」を表示してコピー**、控える

## STEP 4. APIシークレットキーを控える → `sk_test_...`
1. 左メニュー **「開発者」→「APIキー」**
2. **シークレットキー `sk_test_...`** を表示してコピー、控える
   - （推奨）相乗りなので「制限付きキー」を作り、Checkout/Customers/Subscriptions/Billing Portal/Products/Prices のみ「書き込み」許可にするとより安全。

## STEP 5. カスタマーポータルを有効化
1. 左メニュー **「設定（歯車）」→「Billing」→「カスタマーポータル（Customer portal）」**
2. **有効化／設定を保存**（テストモードでも1回設定が必要）
   - 解約を許可する設定（サブスクのキャンセルを許可）をONに。

## STEP 6. Supabase にシークレットを設定（最重要）
1. https://supabase.com/dashboard → プロジェクト **`ems-english-trainer`**
2. **Project Settings → Edge Functions → Secrets**（または左メニュー「Edge Functions」内の Secrets）
3. 次の **3つ** を追加:

| 名前 | 値 |
|---|---|
| `STRIPE_SECRET_KEY` | STEP4 の `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | STEP3 の `whsec_...` |
| `STRIPE_PRICE_ID` | STEP2 の `price_...` |

4. 保存（関数は次回呼び出し時に自動でこの値を読み込む）

---

## 完了後にやること（私が一緒に検証）
- アプリでログイン →「Proにする」→ テストカード **`4242 4242 4242 4242`**（有効期限は未来の任意・CVC任意）で決済
- 決済成功 → `is_pro=true` → ロック解除（全シナリオ・単語クイズ解放）
- 「プラン管理」→ 解約 → `is_pro=false` → 再ロック
- これらが通ればフェーズ1の決済機能は完成。

## 本番公開時
- Stripe を**本番モード**にして、商品/Webhook/キーを本番用に作り直し、Supabaseの3シークレットを本番値へ差し替える。
- 特商法ページ等の `【　】` を記入してから公開。
