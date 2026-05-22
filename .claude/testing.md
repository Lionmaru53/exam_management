# テスト戦略・手順

## テスト方針

GAS + スプレッドシート構成のため、従来のユニットテストフレームワークは使えない。
以下の 2 段構えで品質を担保する。

| 種別 | ファイル | 実行方法 |
|------|---------|---------|
| Jest ユニットテスト | `tests/unit/*.test.js` | `npm test` |
| GAS 統合テスト | `tests/test_runner.js` | `push-test.ps1` → GAS エディタ → `runAllTests()` |
| 手動テスト | 本ドキュメント下部の「手動テスト手順」 | ブラウザで実際に操作 |

---

## Jest ユニットテスト（推奨・高速）

```
npm test
```

42 テスト・5 スイート、実行時間 < 1 秒。GAS API は `tests/unit/jest.setup.js` でモック済み。

### テストスイート一覧

| ファイル | 対象モジュール |
|---------|--------------|
| `getRowsData.test.js` | `getRowsData.js` |
| `admin_branch.test.js` | `admin_branch.js` |
| `admin_getData.test.js` | `admin_getData.js` |
| `admin_import.test.js` | `admin_import.js` |
| `admin_auth.test.js` | `admin_auth.js` |

### ソース読み込み順（`jest.setup.js`）

GAS のグローバルスコープを再現するため、依存順に `require` する:

```js
require('getRowsData.js');   // 依存なし
require('getData.js');       // stringifyDates を定義
require('admin_auth.js');    // getAdminContext, writeAuditLog
require('admin_branch.js');  // getChildSS, _getTargetSS 等
require('admin_import.js');  // _mapRows, _upsertStudentsMaster 等
require('admin_getData.js'); // getAdminInitialData, upsertSchoolCourse 等
```

---

## GAS 統合テストの実行手順

テストファイルは `tests/` に置かれており、通常の `clasp push`（本番用）では GAS に送られない。
テスト実行には `push-test.ps1` を使う。

```
1. .\push-test.ps1 を実行（src/ + tests/ をテスト用 GAS プロジェクトに push）
2. GAS エディタを開く（テスト用プロジェクト）
3. initTestData() を実行（テストシートが親SSに作成される）
4. runAllTests() を実行
5. ログパネルで PASS / FAIL を確認
6. 終了後: clearTestData() でテストシートを削除（任意）
```

**前提**: `.clasp.dev.json` と `.clasp.test.json` は同じ `scriptId`（テスト環境共用）。

**テストシート名**: `_test_` プレフィックス付き（本番シートとは別名）

---

## Jest でテストできないもの（→ GAS 統合テストまたは手動）

| 機能 | 理由 |
|------|------|
| `getAdminContext()` | `Session.getActiveUser()` はモック不可 |
| `getChildSS()` | 実際の spreadsheet_id が必要 |
| `setupBranchSS()` | `SpreadsheetApp.create()` は副作用（新SSが作られる） |
| `shareBranchSS()` | DriveApp スコープが必要 |
| `importStudentData()` End-to-End | フロントから xlsx を送るフローが必要 |
| 管理画面の表示・操作 | ブラウザ操作が必要 |

---

## 手動テスト手順

### A. 管理画面ログイン

1. `GAS_URL?page=admin` を開く
2. 自分の Google アカウントでログイン
3. admin_users に登録済みの場合 → 管理画面が表示される（ナビ・校舎セレクター）
4. 未登録アカウントでアクセス → 「アクセス権限がありません」エラーになること

### B. 校舎管理

| 操作 | 期待動作 |
|------|---------|
| 「＋ 校舎を追加」クリック | インラインフォームが開く（ページ遷移なし） |
| cram_id / 校舎名を入力して「追加」 | 一覧に行が追加される |
| 既存 cram_id で追加 | 「既に登録されています」エラーが出る |
| 「編集」→ 校舎名を変更して「保存」 | 一覧の名前が更新される |
| 「子SS作成」クリック | 確認ダイアログ → 子SSが新規作成され行に spreadsheet_id が入る |
| 「共有設定」クリック | 対象校舎の branch_admin に共有されること |
| 「無効化」→「有効化」 | is_active が切り替わり、状態列の表示が変わる |

### C. 生徒インポート（Excel アップロード）

| 操作 | 期待動作 |
|------|---------|
| 正常な xlsx をアップロード | 追加件数・更新件数が表示される |
| 「校舎」列の cram_id が対象校舎と不一致 | その行はスキップされる |
| student_id 列がない xlsx | エラーが返る |
| 同じ student_id を 2回インポート | 2回目は「更新」になり重複しない |
| 既存の line_user_id がある生徒を再インポート | line_user_id が保持される |

### D. 生徒向け得点入力フォーム

| 操作 | 期待動作 |
|------|---------|
| 数字以外を入力 | oninput で即時除去される |
| 点数に 201 以上を入力して保存 | 「点数は 0〜200 の整数で…」エラートースト |
| 点数に負の値（先頭に `-` は入力できないが直接 DOM 書き換えなど） | サーバー不可 |
| 順位に 0 を入力して保存 | 「1 以上の整数で…」エラートースト |
| 空欄のまま保存 | 空欄は許可（未入力として保存） |

### E. エラーケースのデータ

| ケース | データ | 期待エラー |
|--------|--------|-----------|
| branches に spreadsheet_id なし | C001 の spreadsheet_id = '' | `getChildSS` → "spreadsheet_id が未設定" |
| branches に無効な spreadsheet_id | C001 の spreadsheet_id = 'invalid_id' | `getChildSS` → "スプレッドシートを開けません" |
| branches に is_active = false | C999 など | `getChildSS` → "branches シートに見つかりません" |
| admin_users に is_active = false | inactive@example.com | `getAdminContext` → "アクセス権限がありません" |

---

## テストデータ定義（`tests/test_setup.js` より）

```
admin_users:
  master@example.com   / master       / cram_id = ''    / active
  branch1@example.com  / branch_admin / cram_id = C001  / active
  branch2@example.com  / branch_admin / cram_id = C002  / active
  inactive@example.com / branch_admin / cram_id = C001  / inactive ← エラーケース

branches:
  C001 / 渋谷校 / spreadsheet_id = '' / active    ← 子SS未設定
  C002 / 新宿校 / spreadsheet_id = '' / active
  C999 / 廃止校 / spreadsheet_id = '' / inactive  ← 無効校舎

student_index:
  S001 / Uabc123 / C001
  S002 / Udef456 / C001
  S003 / Ughi789 / C002
```
