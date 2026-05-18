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

## Phase 2 — 校舎管理・子 SS 連携（作業中 2026-05-18）

設計方針: 親 SS に `branches` シートを持ち cram_id → 子 SS の spreadsheet_id を管理。

| シート | 配置先 | 状態 |
|--------|--------|------|
| `admin_users` / `audit_log` / `branches` | 親 SS | 実装済み |
| `term_tests_master` / `genres_master` / `subjects_master` | 親 SS（全校舎共通） | 実装済み |
| `exam_patterns` / `exam_schedule` / `pattern_subjects` | 子 SS | 2-D で移行予定 |
| `students_master` / `scores_data` / `【設定】学校・科` | 子 SS | 2-D で移行予定 |

- [x] **2-A**: `admin_branch.js` 新規作成（`getChildSS` / `getBranches` / `addBranch` / `updateBranch`）
- [x] **2-A**: `setupAdminSS()` に `branches` シート作成を追加
- [x] **2-A**: `getAdminInitialData()` に master 向け branches 一覧を追加
- [x] **2-B**: `admin_logic_branches.html` の実装（校舎一覧・追加・編集 UI）
- [x] **2-C**: `setupBranchSS()` 実装（子 SS のシート自動作成・校舎管理者への自動共有）
- [ ] **2-D**: データ関数の SS 切り替え対応

## Phase 3 — 生徒向け機能拡張（未着手）
- [ ] 得点シート表示機能

## 未確定事項

- Excel の実際の列名（`admin_auth.js` の `STUDENT_COLUMN_MAP` は要確認）
- マスター管理者向け管理画面の構成詳細（別途設計済み → `.claude/architecture.md` 参照）
