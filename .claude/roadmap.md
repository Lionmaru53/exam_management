# 開発ロードマップ

## Phase 0 — 管理画面基盤（完了 2026-05-17）
- [x] 管理者認証（メール照合・簡易版）
- [x] 管理者管理タブ（admin_users CRUD）
- [x] 共通マスターデータ管理タブ（試験区分・教科ジャンル・教科一覧）
- [x] 校舎管理タブ（プレースホルダー）
- [x] 生徒インポートタブ（プレースホルダー）

## Phase 1 — 認証強化（完了 2026-05-18）
- [x] `getAdminContext()` を `Session.getActiveUser().getEmail()` ベースに変更
- [x] 全 API 関数のシグネチャから callerEmail を削除（引数なし）
- [x] ログイン画面を削除し、ページロード時に自動認証
- [x] デプロイ設定をアクセス「ログインが必要」に変更

> GIS（Google Identity Services）は `script.google.com` を JavaScript オリジンとして
> 登録できないため断念。代わりに GAS webapp のアクセス設定「ログインが必要」+
> `Session.getActiveUser()` でサーバーサイドから認証する方式を採用。

## Phase 2 — 校舎管理・子 SS 連携（作業中 2026-05-20）

設計方針: 親 SS に `branches` シートを持ち cram_id → 子 SS の spreadsheet_id を管理。

| シート | 配置先 | 状態 |
|--------|--------|------|
| `admin_users` / `audit_log` / `branches` / `student_index` | 親 SS | 実装済み |
| `term_tests_master` / `genres_master` / `subjects_master` | 親 SS（全校舎共通） | 実装済み |
| `exam_patterns` / `exam_schedule` / `pattern_subjects` | 子 SS | 実装済み（`getAdminInitialData` が子SS参照済み） |
| `students_master` / `students_branch` / `scores_data` / `【設定】学校・科` | 子 SS | 実装済み |

- [x] **2-A**: `admin_branch.js` 新規作成（`getChildSS` / `getBranches` / `addBranch` / `updateBranch`）
- [x] **2-A**: `setupAdminSS()` に `branches` シート作成を追加
- [x] **2-A**: `getAdminInitialData()` に master 向け branches 一覧を追加・子SS参照対応
- [x] **2-B**: `admin_logic_branches.html` の実装（校舎一覧・追加・編集・有効化/無効化 UI）
- [x] **2-C**: `setupBranchSS()` 実装（子 SS のシート自動作成）
- [x] **2-C**: `shareBranchSS()` 実装（DriveApp スコープ分離・校舎管理者への共有）
- [x] **2-E**: `admin_import.js` 実装（`importStudentData` / `linkLineIds` / `migrateStudentsFromParentSS`）
- [x] **2-D**: `getData.js` / `saveData.js` の子 SS 切り替え対応（実装済みを確認 2026-05-20）
- [x] **2-F**: `getStudentList()` 実装 + 管理画面「生徒一覧」タブ追加（学校名グループ化）

## 開発基盤（完了 2026-05-20）

- [x] ファイル階層化: GAS ソースを `src/`、GAS テストを `tests/`、Jest テストを `tests/unit/` に整理
- [x] 環境分離: `.clasp.dev.json`（テスト環境）/ `.clasp.json`（本番、git 管理外）
- [x] テスト用 push スクリプト: `push-test.ps1`（`src/` + `tests/` を GAS テスト環境へ）
- [x] Node.js + Jest ユニットテスト導入（`npm test`）
  - `getAdminContext()` を含む権限チェック付き関数が初めてテスト可能に
  - 29 テスト・4スイート、全 PASS
  - GAS API モック: `SpreadsheetApp`, `Session`, `LockService`, `Utilities`, `DriveApp`

## Phase 3 — 生徒向け機能拡張（未着手）
- [ ] 得点シート表示機能

## 未確定事項

- Excel の実際の列名（`src/admin_auth.js` の `STUDENT_COLUMN_MAP` は要確認）
- マスター管理者向け管理画面の構成詳細（別途設計済み → `.claude/architecture.md` 参照）
