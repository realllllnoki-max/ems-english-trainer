# Googleログインの設定手順

フロント側の実装（`ems-auth.js` の「Googleで続ける」ボタン）は済んでいます。
動かすには、以下の **Google Cloud** と **Supabase** の設定が必要です（所要 15分ほど・無料）。

---

## 1. Google Cloud Console でOAuthクライアントを作る

https://console.cloud.google.com/ にアクセス（Googleアカウントでログイン）

1. 上部のプロジェクト選択 → **新しいプロジェクト**（名前は `ems-english-trainer` など）
2. 左メニュー **APIとサービス → OAuth同意画面**
   - User Type: **外部** → 作成
   - アプリ名: `机のいらない救急英語`
   - ユーザーサポートメール / デベロッパー連絡先: 自分のメールアドレス
   - それ以外は空欄のまま保存（スコープ追加も不要）
   - 「公開ステータス」が *テスト中* の場合は **アプリを公開** を押す
     （テスト中のままだと、登録したテストユーザーしかログインできません）
3. 左メニュー **APIとサービス → 認証情報 → ＋認証情報を作成 → OAuthクライアントID**
   - アプリケーションの種類: **ウェブアプリケーション**
   - 名前: 任意（`supabase` など）
   - **承認済みのJavaScript生成元**:
     ```
     https://realllllnoki-max.github.io
     ```
   - **承認済みのリダイレクトURI**:
     ```
     https://widfjtfhqjpnjdfsnlnx.supabase.co/auth/v1/callback
     ```
   - 作成すると **クライアントID** と **クライアントシークレット** が表示される → 控える

## 2. Supabase で Google プロバイダを有効化

https://supabase.com/dashboard → 対象プロジェクト

1. **Authentication → Sign In / Providers → Google**
   - **Enable Sign in with Google** を ON
   - Client ID / Client Secret に手順1で控えた値を貼り付けて **Save**
2. **Authentication → URL Configuration**
   - **Site URL**:
     ```
     https://realllllnoki-max.github.io/ems-english-trainer/
     ```
   - **Redirect URLs** に以下を追加:
     ```
     https://realllllnoki-max.github.io/ems-english-trainer/*
     ```
     （ローカル確認もしたい場合は `http://localhost:8765/*` なども追加）

## 3. 動作確認

1. 公開URLでアプリを開く → ログインモーダル → **Googleで続ける**
2. Googleの同意画面 → 許可 → アプリに戻ってログイン状態になればOK
3. 決済フローの確認: 無料枠を使い切る → ペイウォール → プラン選択 →
   Googleでログイン → 戻ってきたら **自動で決済ページに進む**こと
   （購入意思の永続化 `ems_pending_checkout` が機能しているか）

## トラブルシューティング

| 症状 | 原因と対処 |
|---|---|
| `redirect_uri_mismatch` | 手順1のリダイレクトURIが `https://<プロジェクトref>.supabase.co/auth/v1/callback` と一致していない |
| Googleから戻ってもログインされない | 手順2の Redirect URLs にアプリのURLが入っていない（末尾 `/*` を忘れずに） |
| 「このアプリはGoogleで確認されていません」と出る | OAuth同意画面が「テスト中」のまま。**アプリを公開**する |
| ログイン後に別ページに飛ぶ | Site URL がアプリのURLと違う |

## 補足

- メール＋パスワードのログインは従来どおり併用できます。
- 同じメールアドレスなら、メール登録済みユーザーがGoogleでログインしても
  同一アカウントに紐づきます（Supabaseの既定の自動リンク動作）。
- 計測: `auth_submit {mode:"google"}`（ボタン押下）と
  `auth_success {mode:"google"}`（リダイレクト復帰）が `app_events` に記録されます。
