# 環境構築・デプロイ手順

## 環境の種類

| 環境 | clasp 設定ファイル | 用途 |
|------|-----------------|------|
| **テスト/開発（通常）** | `.clasp.dev.json` | 開発中の動作確認 |
| **テスト/開発（テストコード込み）** | `.clasp.test.json` (push-test.ps1 経由) | テスト実行 |
| **本番** | `.clasp.json`（git 管理外） | リリース |

---

## テスト/開発環境のセットアップ（新しい PC / 環境）

```bash
npm install -g @google/clasp
clasp login
```

`.clasp.dev.json` と `.clasp.test.json` はリポジトリに含まれているため、追加設定不要。

```bash
clasp push --project .clasp.dev.json
```

---

## 本番環境のセットアップ（初回のみ）

1. Google Drive で**本番用スプレッドシート**を新規作成
2. そのスプレッドシートから「拡張機能」→「Apps Script」でバインドされた GAS プロジェクトを開く
3. GAS エディタの URL から `scriptId` を取得（`/projects/{scriptId}/edit` の `{scriptId}` 部分）
4. `.clasp.json.example` をコピーして `.clasp.json` を作成し、`scriptId` を入力
5. `clasp push` でコードをデプロイ
6. GAS エディタで `setupAdminSS()` を手動実行（admin_users / audit_log / branches シート作成）
7. GAS エディタ → デプロイを作成

```bash
clasp push
```

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

- `appsscript.json` に `oauthScopes` を書かない（スコープは GAS の自動検出に任せる）
- `appsscript.json` に `enabledAdvancedServices` を書かない（DriveApp は組み込みクラスであり Advanced Service 登録は不要。誤って記載すると clasp push 時に Cloud プロジェクトへの API 有効化を試みてエラーになる）
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
