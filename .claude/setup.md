# 環境構築・デプロイ手順

## GAS プロジェクト構成（ライブラリ方式）

2026-05-23 時点で**3プロジェクト構成**に移行済み。

| clasp 設定 | GAS プロジェクト | rootDir | 役割 |
|---|---|---|---|
| `.clasp.lib.json` | ライブラリ（`scriptId: 1x10D8HGL5TAz3dDXyIgS7jGQRqf_8wjaNvh0RQBBKGHD28CTEZ5GqleO`） | `src/` | 全ロジック・HTML |
| `.clasp.dev.json` | 開発 main | `dev/` | developmentMode でライブラリを参照 |
| `.clasp.json`（git 管理外） | 本番 main | `prod/` | 特定バージョンを固定参照 |

`dev/main.js` と `prod/main.js` には `doGet` 委譲と `google.script.run` 用ラッパー関数のみ。

---

## 新しい PC・環境でのセットアップ

```bash
npm install -g @google/clasp
clasp login
```

`.clasp.lib.json` と `.clasp.dev.json` はリポジトリに含まれているため追加設定不要。

**開発中の通常 push:**
```bash
clasp push --project .clasp.lib.json
```

---

## 本番環境のセットアップ（初回のみ）

1. Google Drive で**本番用スプレッドシート**を新規作成
2. そのスプレッドシートから「拡張機能」→「Apps Script」でバインドされた GAS プロジェクトを開く
3. GAS エディタの URL から `scriptId` を取得
4. `.clasp.json.example` をコピーして `.clasp.json` を作成し、`scriptId` と `rootDir: "prod"` を設定
5. `prod/appsscript.json` の `libraryId` がライブラリの scriptId と一致しているか確認
6. `clasp push` で本番 main を push
7. GAS エディタで `setupAdminSS()` を手動実行（ライブラリ関数を GAS エディタから直接実行）
8. GAS エディタ → デプロイを作成

```bash
clasp push
```

## 本番バージョンのリリース手順

```
1. clasp push --project .clasp.lib.json    # ライブラリを更新
2. GAS エディタでライブラリの新バージョンを発行（デプロイ → ライブラリとして公開）
3. prod/appsscript.json の "version" を新バージョン番号に更新
4. clasp push                              # 本番 main を更新
5. GAS エディタで本番デプロイの新バージョンを作成
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
