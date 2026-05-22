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

## アクセス URL（確定）

| 用途 | URL | 備考 |
|------|-----|------|
| 管理者 | `script.google.com/macros/s/[管理者デプロイID]/exec?page=admin` | Google ログイン必須・Cloudflare 経由なし |
| 生徒（LIFF） | `wasedazemi-highschool.com/exams/test?userId=...` | Cloudflare 経由・Google ログイン不要 |

---

## 現在の開発状況

- **Phase 0〜2: 完了・main にマージ済み（2026-05-19）**
- **ライブラリ構成への移行完了（2026-05-23）**: `src/` がライブラリ、`dev/` と `prod/` が薄い main プロジェクト

---

## プロジェクト構成（重要）

```
src/          ← ライブラリ本体（全ロジック・HTML）→ .clasp.lib.json で push
dev/          ← 開発 main（2ファイルのみ）       → .clasp.dev.json で push
prod/         ← 本番 main（2ファイルのみ）        → .clasp.json で push
```

| clasp 設定 | push 先 | rootDir | 用途 |
|---|---|---|---|
| `.clasp.lib.json` | ライブラリ GAS プロジェクト | `src/` | 全ロジック |
| `.clasp.dev.json` | 開発 main GAS プロジェクト | `dev/` | `developmentMode: true` |
| `.clasp.json`（git 管理外） | 本番 main GAS プロジェクト | `prod/` | バージョン固定 |

---

## 次回セッション開始手順

### 1. コードの push

| 目的 | コマンド |
|------|---------|
| **開発中（通常）** | `clasp push --project .clasp.lib.json` |
| テストコード込み push | `.\push-test.ps1`（要確認: test 用 clasp 設定） |
| 本番リリース時 | GAS エディタでライブラリの新バージョンを発行 → `prod/appsscript.json` の `version` を更新 → `clasp push` |

> ⚠️ `src/` に変更したら `.clasp.lib.json` で push。`dev/main.js` や `prod/main.js` は `google.script.run` から呼ぶ関数を追加した時のみ変更が必要。

> ⚠️ ライブラリ push 後は GAS エディタで「デプロイ → デプロイを管理 → 新しいバージョン」の作成が必要（exec URL への反映）。

### 2. 新しいサーバー関数を追加する場合（重要）

`google.script.run` から呼ぶ関数をライブラリ（`src/`）に追加したら、必ず `dev/main.js` と `prod/main.js` にもラッパーを追加する：

```javascript
function myNewFunction(...args) { return ExamLib.myNewFunction(...args); }
```

### 3. 動作確認
管理者デプロイ URL（直接 GAS URL）にアクセスし、Google アカウントでログインできることを確認

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

---

## 技術スタック（要約）

- **バックエンド**: GAS（clasp で push）
- **フロントエンド**: GAS HtmlService（管理画面）/ GitHub Pages（LIFF）
- **DB**: Google スプレッドシート（親 SS + 校舎別子 SS）
- **認証**: `Session.getActiveUser()` + admin_users シート照合（管理者）/ LINE LIFF（生徒）
- **xlsx 解析**: SheetJS（CDN）でブラウザ側解析 → GAS に JSON 送信（Drive API 不要）
