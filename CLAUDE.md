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

## 現在の開発状況（2026-05-24 更新）

- **Phase 0〜2: 完了・main にマージ済み（2026-05-19）**
- **単一プロジェクト構成**: `src/` を直接 GAS プロジェクトへ push

### 直近の経緯（重要）

**ファイルアップロード機能のロールバック（2026-05-24）**

commit `6364ce9`（ファイルアップロード機能）が LIFF 画面を破壊していたため `git revert 6364ce9`（commit `266d178`）でロールバック済み。

- 症状: `userCodeAppPanel:220 Uncaught SyntaxError: Invalid or unexpected token` / `renderApp is not defined`
- 原因: ファイルアップロード機能の追加コード（詳細は未特定）
- 現状: ロールバック + stash の差分を統合（commit `bcdcbff`）で解消

**`main.js` の JSON 埋め込み修正（2026-05-24）**

GAS HtmlTemplate に JSON を埋め込む際、正規表現に U+2028/U+2029 文字が混入して `SyntaxError: Invalid regular expression: missing /` が発生していた。  
`split().join()` で代替し解消。現在の実装:

```javascript
tmpl.appData = JSON.stringify(data).split('<').join('\\u003c').split('>').join('\\u003e');
```

**`getData.js` の student 検索方式変更（2026-05-24）**

`students_master` の検索キーを `line_user_id` → `student_id` に変更済み。  
保護者の LINE ID でアクセスしても同じ生徒データを参照できる（`student_index` で LINE ID → student_id を解決）。

```javascript
const studentId  = String(idxEntry.student_id || '').trim();
const studentRaw = students.find(row =>
  String(row.student_id || '').trim() === studentId
);
```

> ⚠️ `student_index` シートに `student_id` 列が必要。VSTACK 数式で自動生成する設計（`spreadsheet-schema.md` 参照）。

**現在の main ブランチ最新 commit**: `bcdcbff`（push・GAS デプロイ待ちまたは完了）

---

## プロジェクト構成（重要）

```
src/          ← 全ロジック・HTML → .clasp.dev.json で push（開発）/ .clasp.json で push（本番）
```

| clasp 設定 | push 先 | rootDir | 用途 |
|---|---|---|---|
| `.clasp.dev.json` | 開発 GAS プロジェクト | `src/` | 開発・動作確認 |
| `.clasp.json`（git 管理外） | 本番 GAS プロジェクト | `src/` | 本番デプロイ |

---

## 次回セッション開始手順

### 1. コードの push

| 目的 | コマンド |
|------|---------|
| **開発中（通常）** | `clasp push --project .clasp.dev.json` |
| テストコード込み push | `.\push-test.ps1`（要確認: test 用 clasp 設定） |
| 本番リリース時 | `clasp push` → GAS エディタで「デプロイを管理 → 新しいバージョン」を作成 |

> ⚠️ push 後は GAS エディタで「デプロイ → デプロイを管理 → 新しいバージョン」の作成が必要（exec URL への反映）。

### 2. 動作確認
管理者デプロイ URL（直接 GAS URL）にアクセスし、Google アカウントでログインできることを確認

### 3. テスト実行

| 目的 | コマンド |
|------|---------|
| ローカル Jest テスト（高速・推奨） | `npm test` |
| GAS テスト（シート操作込み） | `.\push-test.ps1` → GAS エディタで `runAllTests()` |

詳細は [testing.md](.claude/testing.md) を参照。

### 4. 現在の状況

Phase 2 の大部分が完了。詳細は [roadmap.md](.claude/roadmap.md) を参照。

**次に着手できる項目（バックログより）**
- LIFF 動作確認（ロールバック後の SyntaxError 解消確認）
- student_index の VSTACK 数式確認（student_id 列の存在確認）
- 得点シート・過去成績の表示機能（Phase 3）
- 教科ごとの満点設定・バリデーション強化

---

## 技術スタック（要約）

- **バックエンド**: GAS（clasp で push）
- **フロントエンド**: GAS HtmlService（管理画面）/ GitHub Pages（LIFF）
- **DB**: Google スプレッドシート（親 SS + 校舎別子 SS）
- **認証**: `Session.getActiveUser()` + admin_users シート照合（管理者）/ LINE LIFF（生徒）
- **xlsx 解析**: SheetJS（CDN）でブラウザ側解析 → GAS に JSON 送信（Drive API 不要）
