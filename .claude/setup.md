# 環境構築・デプロイ手順

## 別 PC / 新環境でのセットアップ

```bash
npm install -g @google/clasp
clasp login
```

`.clasp.json.example` をコピーして `.clasp.json` を作成し `scriptId` を設定する。
scriptId は GAS プロジェクト URL から取得（`/projects/{scriptId}/edit`）。

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

## デプロイ時の注意

- `appsscript.json` に `oauthScopes` を書かない（スコープは GAS の自動検出に任せる）
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
