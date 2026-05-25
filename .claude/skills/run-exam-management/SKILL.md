---
name: run-exam-management
description: Run, screenshot, or verify the exam-management admin screen. Use when asked to run the app, take a screenshot, verify a UI change, or check that the admin screen loads correctly.
---

# run-exam-management

このプロジェクトは GAS (Google Apps Script) + Google スプレッドシート構成のウェブアプリ。ローカルサーバーは存在しない。管理画面は GAS デプロイ URL にアクセスして確認する。

ドライバーは `.claude/skills/run-exam-management/driver.mjs`。`playwright-core` を使い、保存済みの Google セッション（`.playwright-mcp/user-data/`）でヘッドレスアクセスする。

## 前提条件

```
node_modules/playwright-core/  # npm install 済み（package.json に devDependencies として記載）
.playwright-mcp/user-data/     # Google ログイン済みセッション（下記「初回セットアップ」参照）
C:\Program Files\Google\Chrome\Application\chrome.exe  # システム Chrome（Windows 標準パス）
```

## コード変更の反映

管理画面の変更を確認するには、先に GAS へ push が必要:

```powershell
clasp push --project .clasp.dev.json
```

その後 `/exec` URL は**デプロイ済みバージョン**を実行するため、GAS エディタで「デプロイを管理」→鉛筆アイコン→「新しいバージョン」を選択する必要がある（`/dev` URL は組織ポリシーで制限されているため Playwright からは使えない）。

## ドライバーの使い方（エージェントパス）

```bash
# 管理画面トップのスクリーンショット
node .claude/skills/run-exam-management/driver.mjs screenshot

# 特定タブのスクリーンショット
node .claude/skills/run-exam-management/driver.mjs screenshot students
node .claude/skills/run-exam-management/driver.mjs screenshot exams
node .claude/skills/run-exam-management/driver.mjs screenshot patterns

# 全タブ一覧と起動確認
node .claude/skills/run-exam-management/driver.mjs check
```

**有効なタブ名:** `patterns` / `exams` / `students` / `import` / `files` / `adminUsers` / `branches` / `masterData`

スクリーンショットは `.playwright-mcp/admin-top.png` / `.playwright-mcp/admin-<tab>.png` に保存される。

## 手動確認（ブラウザパス）

ブラウザで直接 `/dev` URL を開くと常に最新 HEAD が実行される（push 直後に確認できる）:

```
https://script.google.com/macros/d/1OxtDXoocsBpbTtWjqmRUqyQ-HMk1UOy_eznGAF3Z01Jx2EuaIuKX6lMJ/dev?page=admin
```

`/exec` URL（デプロイ済み版・Playwright でも使用）:
```
https://script.google.com/macros/s/AKfycbwQdmCh2CmSg0zFX5d_mCH9tR5Da4LkFIWbjDdMDHhdizNIVMm3srbG-88u2mQRyP4q0Q/exec?page=admin
```

## テスト実行

```bash
npm test
```

## 初回セットアップ（Google ログインセッションの保存）

`.playwright-mcp/user-data/` が存在しない場合、Playwright MCP 経由でログインが必要:

1. `.mcp.json` に `--user-data-dir` が設定済みであることを確認
2. Claude Code で「Googleでログインして」と指示
3. 表示されたブラウザウィンドウでパスワードを手動入力
4. ログイン完了後、セッションが自動保存される

## Gotchas

- **GAS は 3 重 iframe**: `main → googleusercontent.com → #userHtmlFrame (/blank URL)`。ドライバーは `#admin-nav button` が存在するフレームをポーリングで探す。`networkidle` 後もさらに数秒かかる。
- **`/dev` URL は Playwright から使えない**: `wasedazemi.com` の Workspace 組織ポリシーで制限される。Playwright には `/exec` URL を使う。手動ブラウザからは `/dev` が使える。
- **生徒一覧・試験日程はローディング継続**: 校舎セレクターで校舎を選択するまでデータが取得できない。スクリーンショットはローディング状態になるが正常。
- **セッション期限切れ**: `admin-top.png` が「ログイン画面」や Drive エラーになっていたら、Playwright MCP 経由で再ログインが必要。

## Troubleshooting

**`executable doesn't exist` エラー**: Chrome が標準パスにない。`CHROME_PATH` をドライバー内で修正する。

**`admin-nav not found` タイムアウト**: セッションが期限切れか GAS 側のエラー。`check` コマンドのかわりに `screenshot` でページ全体を確認する。

**`Failed to launch chromium` on headless**: `--no-sandbox` フラグが必要な環境では既に設定済み。
