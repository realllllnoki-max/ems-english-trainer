// 障害注入テスト用の Playwright 設定。
// 静的サイトを python3 の HTTP サーバーで配信し、Supabase / Stripe への
// 通信は各テストがルートインターセプトで遮断・偽装する（本番へは一切触れない）。
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8787",
    // Claude Code のリモート実行環境ではプリインストールの Chromium を使う
    // （@playwright/test のピン版とブラウザ版の不一致でDLし直さないため）
    launchOptions: process.env.PW_CHROMIUM_PATH || require("fs").existsSync("/opt/pw-browsers/chromium")
      ? { executablePath: process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium" }
      : {},
  },
  webServer: {
    command: "python3 -m http.server 8787 --bind 127.0.0.1",
    url: "http://127.0.0.1:8787/index.html",
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
