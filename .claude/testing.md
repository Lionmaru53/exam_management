# テスト戦略・手順

## テスト方針

GAS + スプレッドシート構成のため、従来のユニットテストフレームワークは使えない。
以下の 2 段構えで品質を担保する。

| 種別 | ファイル | 実行方法 |
|------|---------|---------|
| 自動テスト（GAS） | `tests/test_runner.js` | `push-test.ps1` → GAS エディタ → `runAllTests()` |
| 手動テスト | 本ドキュメント下部の「手動テスト手順」 | ブラウザで実際に操作 |

---

## 自動テストの実行手順

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

**前提**: `.clasp.test.json` の `scriptId` にテスト用 GAS プロジェクトの ID を設定済みであること。

**テストシート名**: `_test_` プレフィックス付き（本番シートとは別名）

---

## 自動テストカバレッジ

### getRowsData
| # | テスト名 | 期待動作 |
|---|---------|---------|
| 1 | basic | branches テストシートを行オブジェクト配列に変換できる |
| 2 | empty | ヘッダーのみのシートは空配列を返す |

### branches
| # | テスト名 | 期待動作 |
|---|---------|---------|
| 3 | hasC001 | テストデータに C001 が存在する |
| 4 | inactiveC999 | C999 の is_active が false |
| 5 | ensureBranchesSheet idempotent | 同名シートが重複しない |

### _mapRows（importStudentData 前処理）
| # | テスト名 | 期待動作 |
|---|---------|---------|
| 6 | normal | 正常な行を Student オブジェクトに変換 |
| 7 | skipEmpty | student_id 空の行はスキップ |
| 8 | nameCombine | 姓+名、姓かな+名かな が結合される |

### _upsertStudentsMaster
| # | テスト名 | 期待動作 |
|---|---------|---------|
| 9  | add | 新規生徒が追加される |
| 10 | update | 既存生徒の情報が上書きされる |
| 11 | preserveLineId | 既存の line_user_id はインポートで上書きされない |

### admin_users
| # | テスト名 | 期待動作 |
|---|---------|---------|
| 12 | masterExists | master ロールが存在する |
| 13 | inactiveFlag | is_active = false の行を正しく読める |

---

## 自動テストできないもの（→ 手動テスト）

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
| student_id 列がない xlsx | エラーが返る |
| 同じ student_id を 2回インポート | 2回目は「更新」になり重複しない |
| 既存の line_user_id がある生徒を再インポート | line_user_id が保持される |

### D. エラーケースのデータ

下記は意図的にエラーを起こすためのデータ。
テスト時に手動でスプレッドシートに設定するか、`tests/test_setup.js` に追記して使う。

| ケース | データ | 期待エラー |
|--------|--------|-----------|
| branches に spreadsheet_id なし | C001 の spreadsheet_id = '' | `getChildSS` → "spreadsheet_id が未設定" |
| branches に無効な spreadsheet_id | C001 の spreadsheet_id = 'invalid_id' | `getChildSS` → "スプレッドシートを開けません" |
| branches に is_active = false | C999 など | `getChildSS` → "branches シートに見つかりません" |
| admin_users に is_active = false | inactive@example.com | `getAdminContext` → "アクセス権限がありません" |
| branches に重複 cram_id | addBranch で同じ cram_id | `addBranch` → "既に登録されています" |

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
