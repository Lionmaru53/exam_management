# アーキテクチャ

## システムフロー

```
LINE アプリ
  └─→ LIFF エンドポイント（GitHub Pages: docs/index.html）
        └─ LIFF SDK で LINE userId 取得
        └─→ wasedazemi-highschool.com/exams/test?userId=xxx  ← Cloudflare 経由
              └─→ 生徒用 GAS デプロイ（ANYONE_ANONYMOUS）
                    └─ getInitialData(lineUserId)
                          └─ 親 SS の student_index で line_user_id → cram_id を解決
                          └─ getChildSS(cram_id) で校舎別子 SS を開く
                          └─ 子 SS から試験・得点データを取得

管理者（Google アカウントでログイン）
  └─→ script.google.com/macros/s/[管理者デプロイID]/exec?page=admin  ← 直接 GAS URL（Cloudflare 経由なし）
        └─→ 管理者用 GAS デプロイ（ANYONE = Google ログイン必須）
              └─→ Session.getActiveUser() → admin_users シート照合
```

## デプロイ構成（同一プロジェクト・コード共有）

| デプロイ | executeAs | access | アクセス方法 | 用途 |
|---------|-----------|--------|------------|------|
| 生徒用 | USER_DEPLOYING | ANYONE_ANONYMOUS | Cloudflare 経由 | 生徒向け（LINE認証・Google不要） |
| 管理者用 | USER_DEPLOYING | **全員（ログインが必要）** | 直接 GAS URL | 管理者向け（Google認証必須） |

- 同一 GAS プロジェクトから 2 つのデプロイを作成（コードは共通）
- `appsscript.json` の `access` は `ANYONE_ANONYMOUS`（生徒用デフォルト値）
- 管理者用デプロイは GAS エディタから手動で `ANYONE` で作成
- 管理者は Cloudflare を経由しない（直接 GAS URL をブックマーク）
- `Session.getActiveUser().getEmail()` は「ログインが必要」設定時のみ実際のメールを返す

## ファイル構成

### GAS バックエンド
| ファイル | 役割 |
|---------|------|
| `main.js` | `doGet()` / `include()` |
| `getData.js` | 生徒向け: LINE ID → student_index → 子 SS → 試験・得点データ取得 |
| `saveData.js` | 生徒向け: student_index → 子 SS の scores_data へ得点保存 |
| `admin_auth.js` | 管理者認証 / admin_users CRUD / setupAdminSS |
| `admin_branch.js` | 校舎管理 / getChildSS / getBranches / addBranch / updateBranch / setupBranchSS / shareBranchSS |
| `admin_getData.js` | 管理者向け初期データ一括取得 |
| `admin_saveData.js` | 試験・パターン・教科・term_tests・genres の書き込み（子 SS ルーティング済み） |
| `admin_import.js` | 生徒インポート（xlsx → 子 SS）/ LINE ID 連携（外部 SS → student_index + 子 SS） |
| `getRowsData.js` | シート → `{列名: 値}[]` 変換ユーティリティ |

### 管理画面フロントエンド
| ファイル | 役割 |
|---------|------|
| `admin_index.html` | エントリーポイント・ログイン・タブ管理・校舎セレクター |
| `admin_logic_exams.html` | 試験日程管理 |
| `admin_logic_patterns.html` | 教科パターン管理 |
| `admin_logic_admin_users.html` | 管理者ユーザー管理（master のみ） |
| `admin_logic_branches.html` | 校舎管理（一覧・追加・編集・子 SS 作成・共有） |
| `admin_logic_import.html` | 生徒インポート（xlsx）/ LINE ID 連携（外部 SS URL 貼り付け） |
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

## スプレッドシート構造

詳細は [spreadsheet-schema.md](../spreadsheet-schema.md) を参照。

### 親 SS（管理 SS・GAS プロジェクトのバインド先）

| シート | 役割 |
|--------|------|
| `admin_users` | 管理者一覧（email / role / cram_id） |
| `audit_log` | 操作ログ |
| `branches` | cram_id → 子 SS の spreadsheet_id |
| `student_index` | line_user_id / student_id → cram_id のルーティングテーブル |
| `term_tests_master` | 試験区分マスター（is_two_terms）全校舎共通 |
| `genres_master` | 教科ジャンル 全校舎共通 |
| `subjects_master` | 教科マスター 全校舎共通 |

### 子 SS（校舎別・branches シートで管理）

| シート | 役割 |
|--------|------|
| `config` | CRAM_ID / PARENT_SS_ID / BRANCH_NAME |
| `【設定】学校・科` | 学校名・学期制・コース定義 |
| `students_master` | 生徒情報（xlsx インポートで登録・LINE ID 連携で更新） |
| `students_branch` | 生徒の在籍状態サマリ（student_id / grade / is_active） |
| `exam_patterns` | 学校×コース×学年×sub_course×試験区分 |
| `exam_schedule` | pattern_id × year → 日程 |
| `pattern_subjects` | pattern_id → subject_id の紐付け |
| `scores_data` | 得点・順位 |

## データフロー概要

### 生徒インポート（管理者操作）

```
管理画面「インポート」タブ
  → xlsx ファイル選択
  → SheetJS（ブラウザ）で解析
  → importStudentData(cramId, rows)
        → 子 SS の students_master に Upsert
        → 子 SS の students_branch に Upsert
```

### LINE ID 連携（管理者操作）

```
管理画面「インポート」タブ → LINE ID 連携セクション
  → 外部 SS の URL を入力（「内部生」シート: 2行目=ヘッダー, 3行目以降=データ）
  → linkLineIds(cramId, url)
        → SpreadsheetApp.openByUrl() で外部 SS を開く
        → 「管理番号」「生徒」列を読み取る
        → 子 SS の students_master.line_user_id を更新
        → 親 SS の student_index に Upsert（student_id / line_user_id / cram_id）
```

### 生徒向けデータ取得（LINE アクセス時）

```
getInitialData(lineUserId)
  → 親 SS の student_index で line_user_id → cram_id
  → getChildSS(cram_id) で子 SS を開く
  → 子 SS: students_master, exam_patterns, exam_schedule,
            pattern_subjects, scores_data, 【設定】学校・科
  → 親 SS: term_tests_master, genres_master, subjects_master
```

### 得点保存（生徒操作）

```
saveAllScores({ student_id, exam_id, scores })
  → 親 SS の student_index で student_id → cram_id
  → getChildSS(cram_id) で子 SS を開く
  → 子 SS の scores_data に Upsert
```
