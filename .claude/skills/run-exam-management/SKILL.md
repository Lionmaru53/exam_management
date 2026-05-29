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

**Playwright（driver.mjs）はテスト環境のみ使用。本番環境には触れない。**

```powershell
clasp push --project .clasp.dev.json   # テスト GAS へ push
# → 即座にテスト環境へ反映（HEAD デプロイのためバージョン作成不要）
```

その後 `screenshot` コマンドを実行すると最新コードを反映した画面を取得できる。

## ドライバーの使い方（エージェントパス）

```bash
# セッション作成（初回・再ログイン時）
node .claude/skills/run-exam-management/driver.mjs login

# 管理画面トップのスクリーンショット
node .claude/skills/run-exam-management/driver.mjs screenshot

# 特定タブのスクリーンショット
node .claude/skills/run-exam-management/driver.mjs screenshot students
node .claude/skills/run-exam-management/driver.mjs screenshot exams
node .claude/skills/run-exam-management/driver.mjs screenshot patterns

# 出力先ディレクトリを指定して保存
node .claude/skills/run-exam-management/driver.mjs screenshot patterns docs/images

# 全タブ一覧と起動確認
node .claude/skills/run-exam-management/driver.mjs check
```

**有効なタブ名:** `patterns` / `exams` / `students` / `import` / `files` / `adminUsers` / `branches` / `masterData`

スクリーンショットは `.playwright-mcp/admin-top.png` / `.playwright-mcp/admin-<tab>.png` に保存される（出力先指定時はそちらに保存）。

## 手動確認（ブラウザパス）

**テスト環境（HEAD デプロイ）** — `.clasp.dev.json` で push 後すぐ確認できる。個人アカウントのため組織ポリシー制限なし:
```
https://script.google.com/macros/s/AKfycbyz4MLhrFoP3W7a9FDRk9LP4IiExBVn7xvBHVMZHECr/dev?page=admin
```

**本番環境**（基本的に触らない）:
```
https://script.google.com/macros/s/AKfycbwQdmCh2CmSg0zFX5d_mCH9tR5Da4LkFIWbjDdMDHhdizNIVMm3srbG-88u2mQRyP4q0Q/exec?page=admin
```

## テスト実行

```bash
npm test
```

## 初回セットアップ（Google ログインセッションの保存）

`.playwright-mcp/user-data/` が存在しない場合は `login` コマンドで作成する:

```bash
node .claude/skills/run-exam-management/driver.mjs login
```

1. Chrome が見える状態（非ヘッドレス）で起動し、管理画面 URL に遷移する
2. 表示されたブラウザウィンドウで Google アカウントにログインする
3. 管理画面が表示されたらドライバーが自動検出して終了し、セッションが `.playwright-mcp/user-data/` に保存される

> **Note**: `.playwright-mcp/user-data/` は `.gitignore` に含まれているため、PC を変えた場合や削除された場合は再実行が必要。

## Gotchas

- **GAS は 3 重 iframe**: `main → googleusercontent.com → #userHtmlFrame (/blank URL)`。ドライバーは `#admin-nav button` が存在するフレームをポーリングで探す。`networkidle` 後もさらに数秒かかる。
- **テスト環境のみ使用**: driver.mjs は個人アカウントのテスト環境（HEAD デプロイ）にのみアクセスする。本番環境には触れない。
- **生徒一覧・試験日程はローディング継続**: 校舎セレクターで校舎を選択するまでデータが取得できない。スクリーンショットはローディング状態になるが正常。
- **セッション期限切れ**: `admin-top.png` が「ログイン画面」や Drive エラーになっていたら、`login` コマンドで再ログインする。

## Troubleshooting

**`executable doesn't exist` エラー**: Chrome が標準パスにない。`CHROME_PATH` をドライバー内で修正する。

**`admin-nav not found` タイムアウト**: セッションが期限切れか GAS 側のエラー。`check` コマンドのかわりに `screenshot` でページ全体を確認する。

**`Failed to launch chromium` on headless**: `--no-sandbox` フラグが必要な環境では既に設定済み。
