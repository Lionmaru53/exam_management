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

## ファイル構成

### GAS バックエンド
| ファイル | 役割 |
|---------|------|
| `main.js` | `doGet()` / `include()` |
| `getData.js` | 生徒向け: LINE ID → 試験・得点データ |
| `saveData.js` | 生徒向け: 得点保存 |
| `admin_auth.js` | 管理者認証 / admin_users CRUD / setupAdminSS |
| `admin_branch.js` | 校舎管理 / getChildSS / getBranches / addBranch / updateBranch |
| `admin_getData.js` | 管理者向け初期データ一括取得 |
| `admin_saveData.js` | 試験・パターン・教科・term_tests・genres の書き込み |
| `getRowsData.js` | シート → `{列名: 値}[]` 変換ユーティリティ |

### 管理画面フロントエンド
| ファイル | 役割 |
|---------|------|
| `admin_index.html` | エントリーポイント・ログイン・タブ管理 |
| `admin_logic_exams.html` | 試験日程管理 |
| `admin_logic_patterns.html` | 教科パターン管理 |
| `admin_logic_admin_users.html` | 管理者ユーザー管理（master のみ） |
| `admin_logic_branches.html` | 校舎管理（Phase 2-B で実装予定） |
| `admin_logic_import.html` | 生徒インポート（Phase 2 完了後に有効化） |
| `admin_logic_master_data.html` | 試験区分・ジャンル CRUD（master のみ） |
| `admin_stylesheet.html` | 管理画面スタイル |

### 共通
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

## スプレッドシート構造（親 SS）

詳細は [spreadsheet-schema.md](../spreadsheet-schema.md) を参照。

| シート | 役割 | 配置 |
|--------|------|------|
| `admin_users` | 管理者一覧 | 親 SS |
| `audit_log` | 操作ログ | 親 SS |
| `branches` | cram_id → 子 SS の spreadsheet_id | 親 SS |
| `term_tests_master` | 試験区分マスター（is_two_terms） | 親 SS（全校舎共通） |
| `genres_master` | 教科ジャンル | 親 SS（全校舎共通） |
| `subjects_master` | 教科マスター | 親 SS（全校舎共通） |
| `exam_patterns` | 学校×コース×学年×sub_course×試験区分 | 子 SS（Phase 2-D 移行予定） |
| `exam_schedule` | pattern_id × year → 日程 | 子 SS（Phase 2-D 移行予定） |
| `scores_data` | 得点・順位 | 子 SS（Phase 2-D 移行予定） |
| `students_master` | 生徒情報（PII） | 子 SS（Phase 2-D 移行予定） |
| `【設定】学校・科` | 学校名・学期制・コース | 子 SS |
