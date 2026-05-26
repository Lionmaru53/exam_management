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

## LIFF 環境構成

| 環境 | LIFF アプリ | GitHub Pages | GAS / スプレッドシート | docs/config.js |
|------|------------|--------------|----------------------|----------------|
| **テスト** | 自前の LIFF アプリ（開発者自身が作成・管理） | 開発用 GitHub Pages | 開発用 GAS（`.clasp.dev.json` で push）＋ 開発用親 SS / 子 SS | GitHub Secrets から自動生成（下記参照） |
| **本番** | 会社管理の LIFF アプリ | 会社管理の GitHub Pages（Cloudflare で `wasedazemi-highschool.com` に紐づけ） | 本番 GAS（`.clasp.json` で push）＋ 本番親 SS / 子 SS | GitHub Secrets から自動生成（下記参照） |

### docs/config.js の管理方法

- **git 管理外**（`.gitignore` 対象）。リポジトリには含まない
- `LIFF_ID` / `GAS_URL` の実値は **GitHub Secrets** で管理
- デプロイ時に GitHub Actions のスクリプトが Secrets を読み取り `docs/config.js` を自動生成
- ローカル開発時は `docs/config.example.js` を参考に手動で `docs/config.js` を作成する

### その他

- テスト時は LINE アプリ外からアクセスして「開発用テストモード」フォームで userId を直接入力できる
- 本番は Cloudflare を経由するため GAS URL が外部に露出しない設計

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

### 管理画面の動作確認 URL

| 方法 | URL | 備考 |
|------|-----|------|
| **手動確認**（ブラウザ直接） | `/dev?page=admin` | 常に最新コード（HEAD）を実行。push 後すぐ反映 |
| **Playwright 自動確認** | `/exec?page=admin` | `wasedazemi.com` 組織ポリシーにより `/dev` が制限されるため `/exec` を使う |

- `/dev` URL: `https://script.google.com/macros/d/{scriptId}/dev`
- `/exec` URL（開発デプロイ）: `https://script.google.com/macros/s/AKfycbwQdmCh2CmSg0zFX5d_mCH9tR5Da4LkFIWbjDdMDHhdizNIVMm3srbG-88u2mQRyP4q0Q/exec`
- Playwright は `--user-data-dir` でセッション保存済み（`.playwright-mcp/user-data/`）

## ディレクトリ構成

```
exam_management/
├── src/       GAS push 対象（clasp rootDir）。本番コード（.js / .html / appsscript.json）
├── tests/     テストファイル（GAS push 対象外。push-test.ps1 でテスト用プロジェクトへ）
├── docs/      GitHub Pages（LIFF エンドポイント）
├── .claude/   プロジェクトドキュメント
└── （ルート）  clasp 設定・git 設定・CLAUDE.md 等
```

## GAS プロジェクト構成（単一プロジェクト方式）

```
src/   ← 全ロジック・HTML  .clasp.dev.json → 開発 GAS プロジェクトに直接 push
                           .clasp.json     → 本番 GAS プロジェクト（git 管理外）
```

`src/` を clasp で直接 GAS プロジェクトへ push する。ライブラリ構成・ラッパー関数は不要。

---

## ファイル構成

### GAS バックエンド（`src/`）

| ファイル | 役割 |
|---------|------|
| `main.js` | `doGet()` / `include()` / `jsonpOrJson()` |
| `getRowsData.js` | シート → `{列名: 値}[]` 変換ユーティリティ |
| `getData.js` | 生徒向け: LINE ID → 試験・得点データ取得。school_exam_periods を優先度照合（コース>学年>文理）で参照 |
| `saveData.js` | 生徒向け: 得点保存（student_id / subject_id / score 等を scores_data へ） |
| `admin_auth.js` | 管理者認証 / admin_users CRUD / setupAdminSS |
| `admin_branch.js` | 校舎管理 / getChildSS / getBranches / addBranch / updateBranch / setupBranchSS / shareBranchSS |
| `admin_getData.js` | 管理者向け初期データ一括取得（親SS＋子SS）/ school_course_master ヘルパー |
| `admin_save_exams.js` | 試験日程・パターン・教科設定の保存（saveSchoolExamPeriod / addNewPattern / initializeDefaultPatterns 等） |
| `admin_save_master.js` | 試験区分・ジャンル・教科表示名エイリアスの保存 |
| `admin_save_students.js` | 生徒フィールド一括更新・コース追加 |
| `admin_import.js` | 生徒インポート / LINE ID 連携（importStudentData / linkLineIds） |

### 管理画面フロントエンド（`src/`）

| ファイル | 役割 |
|---------|------|
| `admin_index.html` | エントリーポイント・タブ管理・校舎セレクター・`_resolveDisplayName` |
| `admin_logic_patterns.html` | 学校別教科名・教科パターン管理（表示名 onblur 自動保存含む） |
| `admin_logic_exams.html` | 試験日程管理（ガントチャート: 学校×日付、月ナビ、ドラッグ入力） |
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
| `admin_users` | 管理者一覧。固定列 `admin_id / email / role / is_active` ＋ 校舎ごとの動的列（列名 = cram_id、値 TRUE = 担当）。`getAdminContext()` が動的列を走査して `cram_ids[]` を構築する |
| `audit_log` | 管理者操作ログ |
| `branches` | cram_id → 子 SS の spreadsheet_id / is_active |
| `line_student_import` | LINE ID 紐づけの入力シート（student_id / line_user_id / cram_id）。外部担当者が直接入力する |
| `student_index` | line_user_id → student_id + cram_id のルーティングテーブル。VSTACK 等の数式で `line_student_import` から自動生成。直接編集しない |
| `bug_reports` | 生徒アプリからの不具合報告（report_id / timestamp / student_id / student_name / school_name / grade / report_type / detail）。Sheets 通知ルールでメール通知 |
| `liff_access_log` | LIFF アクセスログ（timestamp / line_user_id / result / student_id / cram_id / student_name） |
| `term_tests_master` | 試験区分マスター（term_test_id / test_name） |
| `genres_master` | 教科ジャンル |
| `subjects_master` | 教科マスター（subject_id / subject_name / genre_id / grade / default）。`default=TRUE` の教科が新パターン自動生成時の初期教科 |
| `school_subject_aliases` | 学校単位の教科表示名（school_name × subject_id → display_name） |
| `school_term_test_settings` | 学校単位の試験区分設定（school_name × term_test_id → is_active / display_name） |

### 子 SS（校舎ごと）

| シート | 役割 |
|--------|------|
| `students_master` | 生徒情報（PII）/ student_id / name / school_name / grade / is_active 等。LINE ID は持たない（親 SS の `student_index` で管理） |
| `school_course_master` | 学校名・コース（生徒インポート時または初回 LIFF アクセス時に自動登録） |
| `exam_patterns` | 学校×コース×学年×文理 の組み合わせマスター |
| `pattern_subjects` | pattern_id → subject_id の紐付け |
| `school_exam_periods` | 試験実施期間（school_name / school_course / grade / sub_course / term_test_id / year / start_date / end_date）。school_course 等は省略可（空=全共通）。詳細なレコードが優先照合される |
| `scores_data` | 得点・順位（score_id / exam_id / student_id / subject_id / score / grade_rank / class_rank / not_taken） |
