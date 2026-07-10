# 実運用の障害テスト レポート（2026-07-10）

本番環境（https://nodesk-qq-english.com/ ＋ Supabase `widfjtfhqjpnjdfsnlnx`）の
実地ヘルスチェック、障害シナリオの机上監査、決済フローの強化、障害注入の自動テスト導入の結果をまとめる。

---

## 1. 本番の実地ヘルスチェック結果

### 🔴 実際に起きていた障害（復旧済み）
- **Googleログイン全滅（7/9 23:24〜7/10 0:47 UTC 頃）**
  Authログに `invalid_client: The provided client secret is invalid` が連続記録。
  Google OAuth のクライアントシークレット設定ミスで、この間 Googleログインは全員失敗していた。
  0:47 の設定リロード後、0:48 のログインは成功しており**現在は復旧済み**。
  → 教訓: シークレット更新時は直後に実ログインで確認する。フロント側のエラー表示（#31）は有効に機能する状態。

### 🟡 パスワード強度（対応済み・一部は受容）
- **漏洩パスワード保護（HaveIBeenPwned）は Pro プラン限定**のため、Free プランの本番では
  有効化できないと判明 → **受容**（Advisor の WARN は残るが、主導線は Google ログインで
  影響は限定的）。将来 Pro 化する際に有効化する。
- 代替として **Free で可能なパスワード強度を強化済み**（Auth → Sign In / Providers → Email）:
  - Minimum password length: 6 → **8**
  - Password requirements: **Letters and digits（英字＋数字必須）**
  - 反映確認: 弱いパスワード（数字7桁）での signup は `weak_password`（length/characters）で
    サーバー拒否されることを実地確認済み。
- フロント（`ems-auth.js` v8）も新ポリシーに追従:
  新規登録は「8文字以上＋英字と数字」を事前チェック、エラーメッセージも更新
  （ログインは旧アカウントを弾かないよう非空チェックのみ）。

### ✅ 追加調査・対応で解消した項目
- **リポジトリに無い Edge Functions 5つ**（`verify-prices` / `verify-cancel-flow` /
  `verify-gen-otp` / `setup-live-stripe` / `verify-live-config`）を精査したところ、
  **すべて既に無効化済みの空スタブ**（`Deno.serve(() => new Response("gone", { status: 410 }))`）で、
  **セキュリティリスクはなし**。削除は見た目の整理のみで任意（MCPに削除APIが無く、
  削除するなら `supabase functions delete <name>` またはダッシュボードから）。
- **app_events の RLS ポリシーが行ごとに auth関数を再評価**（Performance Advisor WARN）
  → `(select auth.uid())` に変更して**解消済み**（マイグレーション
  `20260710000000_app_events_rls_perf.sql`、本番適用済み）。
  残る Performance INFO 2件（app_events の未使用インデックス）は、レポート下部の
  ファネル集計SQL用に意図的に張ったものなので保持。

### 🟢 問題なし
- DB: `profiles` / `user_progress` / `app_events` すべて RLS 有効・ポリシー妥当（本人のみ読み書き）。
- `on_auth_user_created` トリガーは SECURITY DEFINER ＋ `on conflict do nothing` で堅牢。
  auth.users=2 / profiles=2 で整合。
- 直近24時間のEdge Function呼び出しはすべて200。5xxなし。

---

## 2. 障害シナリオの机上監査と対応

| # | シナリオ | 監査結果 | 対応 |
|---|---------|---------|------|
| 1 | Supabase全断・オフライン | ゲスト動作は無事（analytics/syncは握りつぶし、SWキャッシュでシェル配信） | テスト1で保証 |
| 2 | 決済成功→Webhook反映遅延 | 15秒で打ち切り「再読込してください」のみ | ポーリングを約30秒に延長＋「再度試す」ボタンで再開可能に |
| 3 | Webhookの `profiles` 更新失敗/0件ヒット | **200を返してしまいStripeがリトライせず、「支払済みなのにProにならない」が恒久化** | 失敗時は500を返してStripeにリトライさせる。顧客IDで見つからない場合は `supabase_user_id` メタデータへフォールバック |
| 4 | 既Proユーザーの二重Checkout（別端末・反映前の再購入） | **サーバー側ガードなし＝二重課金の余地** | `create-checkout-session` が `is_pro` なら 409 `already_pro` を返し、フロントは「すでにPro」と案内 |
| 5 | `stripe_customer_id` の紐付け保存失敗 | 無視して決済続行→支払済みでもWebhookが照合不能 | 保存失敗時は決済を中断して500（再試行で復旧）。`upsert` でprofiles行欠落も自己修復 |
| 6 | `is_pro` 取得の一時的な通信エラー | catchで即 `false` → **有料ユーザーが誤って無料枠にロック** | 失敗時は「最後に確認できた値」を維持（端末キャッシュ `ems_pro_cache_v1`） |
| 7 | 解約（期間末キャンセル） | `subscription.updated`(active)→期間末に`deleted`→is_pro=false。正しい | 変更なし |
| 8 | 支払い失敗（past_due） | `subscription.updated` で is_pro=false に落ちる。正しい | 変更なし |
| 9 | 相乗り（既存事業のStripeイベント） | 自社価格IDフィルタで除外済み。正しい | 変更なし |
| 10 | 端末間の時計ずれによる同期の逆転 | `ems-sync` は端末時刻同士の比較のため、時計が大きくずれた端末では新しい進捗が古い側に負ける可能性 | 既知の制限として記録（実害は限定的。対策するならサーバー時刻の採用） |
| 11 | オフライン起動時のPro判定 | SDK自体が読めない完全オフラインでは Pro 判定不能→無料表示になる | 既知の制限として記録（ゲート自体がクライアント側のため、キャッシュ信頼の設計判断が必要） |
| 12 | app_events への匿名スパム | anon INSERT が無制限（計測が汚れるだけで実害は小さい） | 現状維持。汚染が見えたらレート制限やCAPTCHAを検討 |

---

## 3. 実施したコード修正

- `supabase/functions/stripe-webhook/index.ts`
  - 更新エラー・対象0件で 500 を返す（Stripeの自動リトライに乗せる）
  - `client_reference_id` / `metadata.supabase_user_id` によるフォールバック照合
  - 失敗時に `console.error` でログを残す
- `supabase/functions/create-checkout-session/index.ts`
  - 既Proユーザーには 409 `already_pro`（二重課金ガード）
  - 顧客IDの紐付けを `upsert` 化＋失敗時は決済中断
- `ems-paywall.js`（v8）
  - 反映待ちポーリング延長（12回）＋タイムアウト後の「再度試す」ボタン
  - `already_pro` 応答時の案内表示
- `ems-auth.js`（v7）
  - `refreshPro` 失敗時に最後に確認できた値を維持（誤ロック防止）
- `sw.js`: キャッシュ v9 に更新

> ✅ **Edge Functions は本番へデプロイ済み**（2026-07-10）:
> `create-checkout-session` v21 / `stripe-webhook` v19。疎通確認済み
> （GET→405 / 認証なしPOST→401 / 署名なしPOST→400）。
> フロント（ems-*.js, index.html）は main へのマージで Cloudflare Pages が自動デプロイ。

---

## 4. 障害注入の自動テスト（新規導入）

Playwright によるテストを導入した。**本番には一切アクセスせず**、Supabase / CDN への通信を
ルートインターセプトで遮断・偽装して障害を再現する。

```bash
npm install
npm test   # 6シナリオ、約1分
```

| テスト | 再現する障害 |
|--------|------------|
| 1 | Supabase全断＋CDN断でもゲストとしてホーム操作・進捗保存が動く |
| 2 | 決済成功リターン→Webhook反映遅延→ポーリングでPro反映 |
| 3 | 反映タイムアウト→「再度試す」で復帰 |
| 4 | 決済準備APIが500→エラー表示＋リトライ導線（ボタンが固まらない） |
| 5 | 既Proの二重決済→already_proガードの案内 |
| 6 | is_pro取得の通信断→Pro表示を維持（誤ロックしない） |

---

## 5. 残タスク

### Claude が実施済み（2026-07-10 追記）
- ✅ Edge Functions を本番デプロイ（checkout v21 / webhook v19）＋疎通確認
- ✅ app_events RLS の性能改善マイグレーションを本番適用
- ✅ 検証用 Edge Functions 5つが無効化済みスタブであることを確認（リスクなし）

### 手動対応が必要（Claude のツールでは実行不可）
1. **実Stripe（テストモード）での通し確認** — `stripe trigger checkout.session.completed` /
   `stripe listen` でWebhook反映を実地確認。フロントの決済戻り挙動もあわせて確認

### 任意・将来
- 漏洩パスワード保護は Pro 化のタイミングで有効化（現状は受容）
- 無効化済み検証用 Function 5つの削除（見た目の整理のみ、`supabase functions delete <name>`）
