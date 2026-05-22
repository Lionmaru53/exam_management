# アーキテクチャ

## システムフロー

```
LINE アプリ
  └─→ LIFF エンドポイント（GitHub Pages: docs/index.html）
        └─ LIFF SDK で LINE userId 取得
        └─→ GAS_URL?userId=xxx → GAS webapp（生徒向け得点入力フォーム）

管理者（Google アカウントでログイン）
  └─→ GAS_URL?page=admin → GAS webapp（管理画面）
```

## デプロイ構成

| デプロイ | executeAs | access | 用途 |
|---------|-----------|--------|------|
| 生徒・LIFF用 | USER_DEPLOYING | ANYONE | 生徒向け（LINE認証） |
| 管理者用 | USER_DEPLOYING | **全員（ログインが必要）** | 管理者向け（Google認証） |

`Session.getActiveUser().getEmail()` は「ログインが必要」設定時のみ実際のメールを返す。

## ディレクトリ構成

```
exam_management/
├── src/       GAS push 対象（clasp rootDir）。本番コード（.js / .html / appsscript.json）
├── tests/     テストファイル（GAS push 対象外。push-test.ps1 でテスト用プロジェクトへ）
├── docs/      GitHub Pages（LIFF エンドポイント）
├── .claude/   プロジェクトドキュメント
└── （ルート）  clasp 設定・git 設定・CLAUDE.md 等
```

## ファイル構成

### GAS バックエンド（`src/`）

| ファイル | 役割 |
|---------|------|
| `main.js` | `doGet()` / `include()` / `jsonpOrJson()` |
| `getRowsData.js` | シート → `{列名: 値}[]` 変換ユーティリティ |
| `getData.js` | 生徒向け: LINE ID → 試験・得点データ取得（alias lookup 含む） |
| `saveData.js` | 生徒向け: 得点保存（exam_id 未設定時は exam_schedule へ自動追加） |
| `admin_auth.js` | 管理者認証 / admin_users CRUD / setupAdminSS |
| `admin_branch.js` | 校舎管理 / getChildSS / getBranches / addBranch / updateBranch / setupBranchSS / shareBranchSS |
| `admin_getData.js` | 管理者向け初期データ一括取得（親SS＋子SS）/ school_course_master ヘルパー |
| `admin_save_exams.js` | 試験日程・パターン・教科設定の保存（updateExamData / addNewPattern 等） |
| `admin_save_master.js` | 試験区分・ジャンル・教科表示名エイリアスの保存 |
| `admin_save_students.js` | 生徒フィールド一括更新・コース追加 |
| `admin_import.js` | 生徒インポート / LINE ID 連携（importStudentData / linkLineIds） |

### 管理画面フロントエンド（`src/`）

| ファイル | 役割 |
|---------|------|
| `admin_index.html` | エントリーポイント・タブ管理・校舎セレクター・`_resolveDisplayName` |
| `admin_logic_patterns.html` | 学校別教科名・教科パターン管理（表示名 onblur 自動保存含む） |
| `admin_logic_exams.html` | 試験日程管理 |
| `admin_logic_students.html` | 生徒一覧（学校→学年階層・コース/文理 一括変更） |
| `admin_logic_import.html` | 生徒インポート / LINE ID 連携 UI |
| `admin_logic_admin_users.html` | 管理者ユーザー管理（master のみ） |
| `admin_logic_branches.html` | 校舎管理（一覧・追加・編集・子SS作成・共有設定・有効化/無効化） |
| `admin_logic_master_data.html` | 試験区分・ジャンル CRUD（master のみ） |
| `admin_stylesheet.html` | 管理画面スタイル |

### 生徒向けフロントエンド（`src/`）

| ファイル | 役割 |
|---------|------|
| `index_app.html` | 生徒アプリのシェル（`appData` を受け取り `renderApp()` を呼ぶ） |
| `logic_ui_render.html` | 生徒アプリの描画ロジック（setLoading 含む） |
| `logic_ui_action.html` | 得点保存ハンドラ・バリデーション |

### 共通（`src/`）

| ファイル | 役割 |
|---------|------|
| `common_stylesheet.html` | 共通スタイル（loading overlay・トースト・ベースCSS） |
| `app_stylesheet.html` | 生徒アプリ専用スタイル（タブ・教科テーブル・得点入力 input 等） |
| `common_showMessage.html` | トースト通知（`showMessage` 関数） |

### GitHub Pages（`docs/`）

| ファイル | 役割 |
|---------|------|
| `docs/index.html` | LIFF エンドポイント（LINE userId → GAS へリダイレクト） |
| `docs/config.js` | LIFF_ID / GAS_URL（git 管理外） |
| `docs/config.example.js` | ローカル開発用テンプレート |

## スプレッドシート構造

詳細は [spreadsheet-schema.md](../spreadsheet-schema.md) を参照。

### 親 SS

| シート | 役割 |
|--------|------|
| `admin_users` | 管理者一覧（email / role / cram_id※ / is_active / last_login） |
| `audit_log` | 操作ログ |
| `branches` | cram_id → 子 SS の spreadsheet_id / is_active |
| `student_index` | line_user_id → cram_id ルーティングテーブル |
| `term_tests_master` | 試験区分マスター（test_name / is_two_terms） |
| `genres_master` | 教科ジャンル |
| `subjects_master` | 教科マスター（canonical name） |
| `school_subject_aliases` | 学校単位の教科表示名（school_name × subject_id → display_name） |

※ `cram_id` 列はカンマ区切りで複数校舎を保持可能（`getAdminContext()` が `cram_ids[]` に分解して返す）

### 子 SS（校舎ごと）

| シート | 役割 |
|--------|------|
| `students_master` | 生徒情報（PII）/ student_id / line_user_id など |
| `school_course_master` | 学校名・コース・2学期制フラグ（生徒インポート時に自動登録） |
| `exam_patterns` | 学校×コース×学年×文理×試験区分 |
| `exam_schedule` | pattern_id × year → 日程（省略可：得点保存時に自動作成） |
| `pattern_subjects` | pattern_id → subject_id の紐付け |
| `scores_data` | 得点・順位（score_id / exam_id / student_id / subject_id / score / grade_rank / class_rank） |
