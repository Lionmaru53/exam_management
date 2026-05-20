# アーキテクチャ

## システムフロー

```
LINE アプリ
  └─→ LIFF エンドポイント（GitHub Pages: docs/index.html）
        └─ LIFF SDK で LINE userId 取得
        └─→ GAS_URL?userId=xxx → GAS webapp（生徒データ表示）

管理者（Google アカウントでログイン）
  └─→ GAS_URL?page=admin → GAS webapp（管理画面）
```

## デプロイ構成

| デプロイ | executeAs | access | 用途 |
|---------|-----------|--------|------|
| LIFF用 | USER_DEPLOYING | ANYONE_ANONYMOUS | 生徒向け（LINE認証） |
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
| `getData.js` | 生徒向け: LINE ID → 試験・得点データ |
| `saveData.js` | 生徒向け: 得点保存 |
| `admin_auth.js` | 管理者認証 / admin_users CRUD / setupAdminSS |
| `admin_branch.js` | 校舎管理 / getChildSS / getBranches / addBranch / updateBranch / setupBranchSS / shareBranchSS |
| `admin_getData.js` | 管理者向け初期データ一括取得（親SS＋子SS） |
| `admin_saveData.js` | 試験・パターン・教科・term_tests・genres の書き込み |
| `admin_import.js` | 生徒インポート / LINE ID 連携 / 旧SS移行（importStudentData / linkLineIds / migrateStudentsFromParentSS） |
| `getRowsData.js` | シート → `{列名: 値}[]` 変換ユーティリティ |

### 管理画面フロントエンド（`src/`）
| ファイル | 役割 |
|---------|------|
| `admin_index.html` | エントリーポイント・タブ管理・校舎セレクター |
| `admin_logic_exams.html` | 試験日程管理 |
| `admin_logic_patterns.html` | 教科パターン管理 |
| `admin_logic_admin_users.html` | 管理者ユーザー管理（master のみ） |
| `admin_logic_branches.html` | 校舎管理（一覧・追加・編集・子SS作成・共有設定・有効化/無効化） |
| `admin_logic_import.html` | 生徒インポート / LINE ID 連携 UI |
| `admin_logic_master_data.html` | 試験区分・ジャンル CRUD（master のみ） |
| `admin_stylesheet.html` | 管理画面スタイル |

### 生徒向けフロントエンド（`src/`）
| ファイル | 役割 |
|---------|------|
| `index_app.html` | 生徒アプリのシェル（`appData` を受け取り `renderApp()` を呼ぶ） |
| `logic_ui_render.html` | 生徒アプリの描画ロジック |
| `logic_ui_action.html` | 生徒アプリの操作ロジック（得点保存など） |

### 共通（`src/`）
| ファイル | 役割 |
|---------|------|
| `common_stylesheet.html` | 共通スタイル |
| `common_showMessage.html` | トースト通知 |

### GitHub Pages（`docs/`）
| ファイル | 役割 |
|---------|------|
| `docs/index.html` | LIFF エンドポイント（LINE userId → GAS へリダイレクト） |
| `docs/config.js` | LIFF_ID / GAS_URL（git 管理外・CI が Secrets から生成） |
| `docs/config.example.js` | ローカル開発用テンプレート |

## スプレッドシート構造

詳細は [spreadsheet-schema.md](../spreadsheet-schema.md) を参照。

### 親 SS
| シート | 役割 |
|--------|------|
| `admin_users` | 管理者一覧（email / role / cram_id / is_active / last_login） |
| `audit_log` | 操作ログ |
| `branches` | cram_id → 子 SS の spreadsheet_id / is_active |
| `student_index` | line_user_id → cram_id ルーティングテーブル（LINE ID 連携時に更新） |
| `term_tests_master` | 試験区分マスター（is_two_terms） |
| `genres_master` | 教科ジャンル |
| `subjects_master` | 教科マスター |

### 子 SS（校舎ごと）
| シート | 役割 |
|--------|------|
| `config` | CRAM_ID / PARENT_SS_ID / BRANCH_NAME |
| `【設定】学校・科` | 学校名・2学期制フラグ・コース一覧 |
| `exam_patterns` | 学校×コース×学年×sub_course×試験区分 |
| `exam_schedule` | pattern_id × year → 日程 |
| `pattern_subjects` | pattern_id → subject_id の紐付け |
| `students_master` | 生徒情報（PII）/ student_id / line_user_id など |
| `students_branch` | student_id / grade / is_active（軽量ルーティング用） |
| `scores_data` | 得点・順位（score_id / exam_id / student_id / subject_id / score / rank） |
