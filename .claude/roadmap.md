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

## Phase 2 — 校舎管理・子 SS 連携（大部分完了 2026-05-22）

設計方針: 親 SS に `branches` シートを持ち cram_id → 子 SS の spreadsheet_id を管理。

| シート | 配置先 | 状態 |
|--------|--------|------|
| `admin_users` / `audit_log` / `branches` / `student_index` | 親 SS | 実装済み |
| `term_tests_master` / `genres_master` / `subjects_master` / `school_subject_aliases` | 親 SS（全校舎共通） | 実装済み |
| `exam_patterns` / `exam_schedule` / `pattern_subjects` | 子 SS | 実装済み |
| `students_master` / `scores_data` / `school_course_master` | 子 SS | 実装済み |

### 2-A〜2-F: 基盤実装（完了）
- [x] **2-A**: `admin_branch.js` 新規作成（`getChildSS` / `getBranches` / `addBranch` / `updateBranch`）
- [x] **2-A**: `setupAdminSS()` に `branches` シート作成を追加
- [x] **2-A**: `getAdminInitialData()` に master 向け branches 一覧を追加・子SS参照対応
- [x] **2-B**: `admin_logic_branches.html` 実装（校舎一覧・追加・編集・有効化/無効化 UI）
- [x] **2-C**: `setupBranchSS()` 実装（子 SS のシート自動作成）
- [x] **2-C**: `shareBranchSS()` 実装（DriveApp スコープ分離・校舎管理者への共有）
- [x] **2-D**: `getData.js` / `saveData.js` の子 SS 切り替え対応
- [x] **2-E**: `admin_import.js` 実装（`importStudentData` / `linkLineIds`）
- [x] **2-F**: `getStudentList()` 実装 + 管理画面「生徒一覧」タブ追加

### 2-G: 管理者・校舎の拡張（完了）
- [x] 管理者が複数校舎を担当可能に（`admin_users.cram_id` → カンマ区切り `cram_ids`）
- [x] `branch_admin` でも校舎セレクタープルダウンを表示（nav の下に配置）
- [x] 生徒インポート時に校舎列（`_cram_id`）でフィルタリング

### 学校設定の正規化（完了）
- [x] 旧横並びシート `【設定】学校・科` を廃止し `school_course_master`（縦テーブル）に移行
- [x] 生徒インポート時に `school_name` を `school_course_master` へ自動登録（upsert）
- [x] migrate 系関数を削除

### 生徒一覧の強化（完了）
- [x] 学校→学年の2段階階層表示
- [x] 氏名（読み）・コースでのソート
- [x] コース列・文理列（sub_course）の追加
- [x] 複数生徒のコース・文理を一括変更（チェックボックス＋プルダウン）
- [x] サブ区分の名称を「文理」に統一、選択肢を文系/理系に固定

### 2-H: 教科表示名エイリアス（完了）
- [x] 親SS に `school_subject_aliases` シート追加（`school_name × subject_id → display_name`）
- [x] `getData.js` で alias lookup を実装（エントリなければ canonical name にフォールバック）
- [x] 管理画面タブ名を「学校別教科名・教科パターン管理」に変更
- [x] 教科パターン管理タブの編集パネルに表示名入力欄を追加（onblur で自動保存）
- [x] 楽観的ロック: `updated_at` による競合検出 → 自動更新

### 教科パターン管理の改善（完了）
- [x] 階層構造を 学校 / コース / 文理 / 学年 の4段階に変更
- [x] 「教科を編集」パネルに checkbox・正式名・表示名 input を並べる UI
- [x] 試験日程を任意化（日程未設定でも生徒が得点入力可能、保存時に自動作成）

### 得点入力 UI 改善（完了 2026-05-22）
- [x] 点数・順位の入力を `<select>` から `<input type="text">` に変更
- [x] 半角数字のみ入力制限（`oninput` フィルタ＋`inputmode="numeric"`）
- [x] 保存時バリデーション: 点数 0〜200 の整数、順位 1 以上の整数、空欄は許可

## 開発基盤

- [x] ファイル階層化: GAS ソースを `src/`、Jest テストを `tests/unit/`、GAS テストを `tests/` に整理
- [x] 環境分離: `.clasp.dev.json`（開発環境）/ `.clasp.json`（本番、git 管理外）
- [x] テスト用 push スクリプト: `push-test.ps1`（`src/` + `tests/` を GAS テスト環境へ）
- [x] Node.js + Jest ユニットテスト導入（`npm test`）: 42 テスト・5スイート、全 PASS
- [x] **src/ ファイル整理**（2026-05-22）
  - `admin_saveData.js`（760行）を3分割: `admin_save_exams.js` / `admin_save_master.js` / `admin_save_students.js`
  - `common_stylesheet.html` を共通スタイルのみに絞り込み、生徒アプリ専用の `app_stylesheet.html` を新設

## Phase 3 — 生徒向け機能拡張（一部完了）

- [x] 得点・順位の入力フォーム（テキスト入力・バリデーション）
- [ ] 得点シート・過去成績の表示機能
- [ ] 証拠写真・評定のアップロード（[backlog.md](backlog.md) 参照）
