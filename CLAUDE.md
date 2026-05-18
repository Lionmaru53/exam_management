# exam_management — Claude 向けプロジェクトコンテキスト

塾生の定期試験の得点・順位を管理するシステム。  
Google Apps Script (GAS) + Google スプレッドシート構成。生徒は LINE / LIFF、管理者は Web 管理画面を使用。

**詳細ドキュメント（必要に応じて参照）**
- [アーキテクチャ・ファイル構成](.claude/architecture.md)
- [設計原則・コーディングルール](.claude/rules.md)
- [環境構築・デプロイ手順](.claude/setup.md)
- [開発ロードマップ](.claude/roadmap.md)
- [やりたいことリスト（バックログ）](.claude/backlog.md)
- [既知の Issue](.claude/issues.md)
- [スプレッドシートスキーマ詳細](spreadsheet-schema.md)

---

## 次回セッション開始手順

### 1. コードのデプロイ
```bash
clasp push
```

### 2. GAS 初期セットアップ（未実行の場合のみ）
GAS エディタで `setupAdminSS()` を手動実行（admin_users / audit_log / branches シートが作成される）

### 3. 動作確認
管理者用 `GAS_URL?page=admin` を開き、Google アカウントでログインできることを確認

### 4. 続きの実装タスク（現在: Phase 2-B）
`admin_logic_branches.html` の校舎管理 UI を実装する。
- 校舎一覧の表示（`getBranches()` を呼ぶ）
- 校舎の追加フォーム（`addBranch(payload)` を呼ぶ）
- 校舎の編集（`updateBranch(payload)` を呼ぶ）
- spreadsheet_id の入力欄（2-C の子SS作成が完成するまでは手動入力）

---

## 技術スタック（要約）

- **バックエンド**: GAS（clasp で push）
- **フロントエンド**: GAS HtmlService（管理画面）/ GitHub Pages（LIFF）
- **DB**: Google スプレッドシート
- **認証**: `Session.getActiveUser()` + admin_users シート照合（管理者）/ LINE LIFF（生徒）
