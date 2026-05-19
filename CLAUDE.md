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

## アクセス URL（確定）

| 用途 | URL | 備考 |
|------|-----|------|
| 管理者 | `script.google.com/macros/s/[管理者デプロイID]/exec?page=admin` | Google ログイン必須・Cloudflare 経由なし |
| 生徒（LIFF） | `wasedazemi-highschool.com/exams/test?userId=...` | Cloudflare 経由・Google ログイン不要 |

---

## 現在の開発状況

- **Phase 0〜2: 完了・main にマージ済み（2026-05-19）**
- **現在のブランチ**: `feature/admin`（Phase 3 以降の作業用に残存）

---

## 次回セッション開始手順

### 1. ブランチ確認
```bash
git checkout feature/admin
```

### 2. コードのデプロイ
```bash
clasp push
```

> ⚠️ `clasp push` 後にコードの変更を本番へ反映するには、GAS エディタで「デプロイ → デプロイを管理 → 新しいバージョン」の作成が必要（生徒用・管理者用の両デプロイ）。

### 3. 動作確認
管理者デプロイ URL（直接 GAS URL）にアクセスし、Google アカウントでログインできることを確認

### 4. 続きの実装タスク
- Phase 3（生徒向け機能拡張）またはバックログ参照

---

## 技術スタック（要約）

- **バックエンド**: GAS（clasp で push）
- **フロントエンド**: GAS HtmlService（管理画面）/ GitHub Pages（LIFF）
- **DB**: Google スプレッドシート（親 SS + 校舎別子 SS）
- **認証**: `Session.getActiveUser()` + admin_users シート照合（管理者）/ LINE LIFF（生徒）
- **xlsx 解析**: SheetJS（CDN）でブラウザ側解析 → GAS に JSON 送信（Drive API 不要）
