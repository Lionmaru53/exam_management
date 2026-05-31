# 環境構築・デプロイ手順

## GAS プロジェクト構成（単一プロジェクト方式）

`src/` を clasp で直接 GAS プロジェクトへ push する。

| clasp 設定 | GAS プロジェクト | rootDir | 役割 |
|---|---|---|---|
| `.clasp.dev.json` | 開発用 GAS プロジェクト | `src/` | 開発・動作確認 |
| `.clasp.json`（git 管理外） | 本番 GAS プロジェクト | `src/` | 本番デプロイ |

---

## 新しい PC・環境でのセットアップ

```bash
npm install -g @google/clasp
clasp login
```

`.clasp.dev.json` はリポジトリに含まれているため追加設定不要。

**開発中の通常 push:**
```bash
clasp push --project .clasp.dev.json
```

---

## 本番環境のセットアップ（初回のみ）

1. Google Drive で**本番用スプレッドシート**を新規作成
2. そのスプレッドシートから「拡張機能」→「Apps Script」でバインドされた GAS プロジェクトを開く
3. GAS エディタの URL から `scriptId` を取得
4. `.clasp.json` を作成（またはコピー）し、`scriptId` と `rootDir: "src"` を設定
5. `clasp push` で本番コードを push
6. GAS エディタで `setupAdminSS()` を手動実行
7. GAS エディタ → デプロイを作成

```bash
clasp push
```

## バージョン管理とリリース手順

### バージョン定義（`src/main.js` の先頭で管理）

```javascript
const APP_VERSION = '0.1.1';   // セマンティックバージョン（機能変更時に更新）
const GAS_BUILD   = 'v81';     // GitHubタグと連動するビルド番号（リリースのたびに更新）
```

`package.json` の `"version"` も `APP_VERSION` と合わせて更新する。

### リリース手順

```
1. src/main.js の APP_VERSION・GAS_BUILD を更新
2. package.json の version を更新
3. clasp push --project .clasp.dev.json    # 開発環境で動作確認
4. clasp push                              # 本番に push
5. GAS エディタで本番デプロイの新バージョンを作成
6. git add & git commit & git push exam_management_remote main
7. git tag v81 && git push exam_management_remote v81
```

### バージョン表示場所

| 場所 | 表示内容 |
|---|---|
| 管理画面タイトルバー右上 | `0.1.1 (build 81)` |
| 生徒アプリのメニューパネル下部 | `0.1.1 (build 81)` |

## GAS 初期セットアップ（未実行の場合のみ）

GAS エディタで `setupAdminSS()` を手動実行する。
実行すると以下がメイン SS に作成される：
- `admin_users` シート（管理者一覧）
- `audit_log` シート（操作ログ）
- `branches` シート（校舎一覧）
- 実行者のメールアドレスが master 権限で登録される

## 管理者用デプロイの設定（必須）

GAS エディタ → デプロイ → デプロイを管理 → 管理者用デプロイを選択 → 編集

| 項目 | 設定値 |
|------|--------|
| 実行ユーザー | **自分**（USER_DEPLOYING） |
| アクセスできるユーザー | **全員（ログインが必要）** |

LIFF 用デプロイは「全員（ログイン不要）」のまま維持。

## Cloud プロジェクトの Google Drive API 有効化（DriveApp 使用環境で必須）

`DriveApp.getFileById().addEditor()` など DriveApp を使う機能（共有設定）は、
GAS の Cloud プロジェクトで **Google Drive API** が有効になっている必要がある。
自動有効化が失敗する環境（Google Workspace 等）では手動で有効化する。

1. [Cloud Console](https://console.cloud.google.com) を開く
2. GAS エディタ「⚙ プロジェクトの設定」→「Google Cloud Platform プロジェクト」でプロジェクト番号を確認
3. Cloud Console でそのプロジェクトを選択
4. 「API とサービス」→「API とサービスを有効にする」
5. 「**Google Drive API**」を検索 → 「有効にする」

> **確認方法**: 管理画面「校舎管理」→「共有設定」ボタンが正常に動作すれば OK。

---

## デプロイ時の注意

- スコープ設定を変えた後は「新バージョン」ではなく**完全新規デプロイ**を作成する
- `clasp push` だけでは反映されない。必ずデプロイを新バージョンに更新すること

## 動作確認

```
管理者用 GAS_URL?page=admin
```

Google アカウントでログイン → admin_users に登録済みのメールであれば管理画面が開く。

## GitHub Pages のデプロイ

`main` ブランチへ push すると GitHub Actions が自動で GitHub Pages をデプロイする。
`docs/config.js` は git 管理外。Secrets（`LIFF_ID`, `GAS_URL`）から CI が生成する。
