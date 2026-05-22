# exam_management — Claude 向けプロジェクトコンテキスト

塾生の定期試験の得点・順位を管理するシステム。  
Google Apps Script (GAS) + Google スプレッドシート構成。生徒は LINE / LIFF、管理者は Web 管理画面を使用。

**詳細ドキュメント（必要に応じて参照）**
- [アーキテクチャ・ファイル構成](.claude/architecture.md)
- [設計原則・コーディングルール](.claude/rules.md)
- [環境構築・デプロイ手順](.claude/setup.md)
- [開発ロードマップ](.claude/roadmap.md)
- [テスト戦略・手順](.claude/testing.md)
- [やりたいことリスト（バックログ）](.claude/backlog.md)
- [既知の Issue](.claude/issues.md)
- [スプレッドシートスキーマ詳細](spreadsheet-schema.md)

---

## 次回セッション開始手順

### 1. コードのデプロイ

| 目的 | コマンド |
|------|---------|
| テスト環境に push（開発中） | `clasp push --project .clasp.dev.json` |
| テスト環境に push（テストコード込み） | `.\push-test.ps1` |
| 本番環境に push | `clasp push`（`.clasp.json` に本番 scriptId を設定済みの場合） |

> 本番環境のセットアップ手順は [setup.md](.claude/setup.md) を参照。

### 2. GAS 初期セットアップ（未実行の場合のみ）
GAS エディタで `setupAdminSS()` を手動実行（admin_users / audit_log / branches シートが作成される）

### 3. 動作確認
管理者用 `GAS_URL?page=admin` を開き、Google アカウントでログインできることを確認

### 4. テスト実行

| 目的 | コマンド |
|------|---------|
| ローカル Jest テスト（高速・推奨） | `npm test` |
| GAS テスト（シート操作込み） | `.\push-test.ps1` → GAS エディタで `runAllTests()` |

詳細は [testing.md](.claude/testing.md) を参照。

### 5. 現在の状況

Phase 2 の大部分が完了。詳細は [roadmap.md](.claude/roadmap.md) を参照。

**次に着手できる項目（バックログより）**
- 得点シート・過去成績の表示機能（Phase 3）
- 教科ごとの満点設定・バリデーション強化
- 証拠写真・評定のアップロード機能

**push 後の反映手順**（重要）
```
clasp push --project .clasp.dev.json
→ GAS エディタ → デプロイ → デプロイを管理 → 新しいバージョン → デプロイ
```
`/dev` URL は push 直後に反映。`/exec` URL は新バージョン作成が必要。

---

## 技術スタック（要約）

- **バックエンド**: GAS（clasp で push）
- **フロントエンド**: GAS HtmlService（管理画面）/ GitHub Pages（LIFF）
- **DB**: Google スプレッドシート
- **認証**: `Session.getActiveUser()` + admin_users シート照合（管理者）/ LINE LIFF（生徒）
