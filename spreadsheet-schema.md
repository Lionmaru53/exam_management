# スプレッドシート構造定義書

## 概要

`exam_management` プロジェクトのスプレッドシート構造。  
**親 SS**（GAS プロジェクトのバインド先・管理用）と**子 SS**（校舎別）の 2 層構成。

---

## 親 SS のシート

### `admin_users`
管理者一覧。`getAdminContext()` が認証照合に使用する。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `admin_id` | 管理者 ID（`A` + タイムスタンプ） |
| 2 | `email` | Google アカウントのメールアドレス |
| 3 | `cram_ids` | 担当校舎 ID（カンマ区切りで複数可。master は空欄可） |
| 4 | `role` | `master` または `branch_admin` |
| 5 | `is_active` | 有効フラグ |
| 6 | `created_at` | 登録日時 |
| 7 | `last_login` | 最終ログイン日時 |

**主キー**: `admin_id`  
**備考**: `branch_admin` は `cram_ids` に含まれる校舎のみ操作可能。

---

### `audit_log`
管理者操作のログ。`writeAuditLog()` が自動追記する。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `timestamp` | 操作日時 |
| 2 | `email` | 操作者メールアドレス |
| 3 | `cram_id` | 操作者の校舎 ID |
| 4 | `action` | 操作種別（例: `add_branch`, `import_students`） |
| 5 | `detail` | 操作詳細（JSON） |
| 6 | `result` | `success` または エラー内容 |

---

### `branches`
校舎一覧と子 SS の対応表。`getChildSS()` が参照する。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `cram_id` | 校舎 ID（外部システムと一致させる） |
| 2 | `branch_name` | 校舎名（例: 渋谷校） |
| 3 | `spreadsheet_id` | 子 SS の Google スプレッドシート ID |
| 4 | `is_active` | 有効フラグ |
| 5 | `created_at` | 登録日時 |

**主キー**: `cram_id`

---

### `student_index`
`line_user_id` → `cram_id` のルーティングテーブル。  
`getData.js` と `saveData.js` が最初に参照し、どの子 SS を開くかを決定する。  
LINE ID 連携（`linkLineIds()`）実行時に自動更新される。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `student_id` | 生徒 ID |
| 2 | `line_user_id` | LINE ユーザー ID |
| 3 | `cram_id` | 校舎 ID（子 SS 特定に使用） |

**主キー**: `student_id`  
**検索キー**: `line_user_id`（`getData.js` が LINE ID → student_id 解決に使用）

---

### `term_tests_master`
試験区分マスター（全校舎共通）。管理画面「マスターデータ」タブで管理する。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `term_test_id` | 試験区分 ID（例: `T01`） |
| 2 | `test_name` | 試験名称（例: `1学期中間`, `前期中間`） |

**主キー**: `term_test_id`  
**備考**: `is_two_terms` 列は廃止。学校ごとの試験区分の表示制御は `school_term_test_settings` で管理する。

---

### `genres_master`
教科ジャンルマスター（全校舎共通）。管理画面「マスターデータ」タブで管理する。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `genre_id` | ジャンル ID |
| 2 | `genre_name` | ジャンル名（例: 英語, 数学） |

**主キー**: `genre_id`

---

### `subjects_master`
教科マスター（全校舎共通）。管理画面「マスターデータ」タブで管理する。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `subject_id` | 教科 ID |
| 2 | `subject_name` | 教科名 |
| 3 | `genre_id` | ジャンル ID（`genres_master` 参照） |
| 4 | `grade` | 対象学年（例: `高1`, `高2`, `高3`） |

**主キー**: `subject_id`

---

### `school_subject_aliases`
学校単位の教科表示名エイリアス（全校舎共通）。  
管理画面「学校別教科名・教科パターン管理」タブで管理する。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `school_name` | 学校名 |
| 2 | `subject_id` | 教科 ID（`subjects_master` 参照） |
| 3 | `display_name` | この学校での表示名（空欄不可。削除する場合は行ごと削除） |
| 4 | `updated_at` | 楽観的ロック用タイムスタンプ |

**複合キー**: `(school_name, subject_id)`  
**備考**: エントリがなければ `subjects_master.subject_name` にフォールバック。

---

### `school_term_test_settings`
学校ごとに実施する試験区分の設定（全校舎共通）。  
管理画面「マスターデータ」タブの「学校別試験区分設定」セクションで管理する。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `school_name` | 学校名 |
| 2 | `term_test_id` | 試験区分 ID（`term_tests_master` 参照） |
| 3 | `is_active` | この学校でこの試験区分を実施するか（`1`: 実施, `0`: 非実施） |
| 4 | `display_name` | この学校での試験区分表示名（空欄 = `term_tests_master.test_name` を使用） |
| 5 | `updated_at` | 楽観的ロック用タイムスタンプ |

**複合キー**: `(school_name, term_test_id)`  
**備考**: 該当学校のエントリが存在しない場合は全試験区分を表示（フォールバック）。

---

## 子 SS のシート

校舎ごとに 1 つ作成。`setupBranchSS()` で初期化される。

### `config`
子 SS の設定情報。

| 行 | キー | 値 |
|----|------|----|
| 1 | `CRAM_ID` | この子 SS が対応する校舎 ID |
| 2 | `PARENT_SS_ID` | 親 SS の spreadsheet_id |
| 3 | `BRANCH_NAME` | 校舎名 |

---

### `students_master`
生徒の基本情報（校舎別）。xlsx インポートで登録し、LINE ID 連携で `line_user_id` を追記する。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `student_id` | 生徒 ID（外部システムの管理番号） |
| 2 | `name` | 氏名（姓＋名を結合） |
| 3 | `pronunciation` | 読み（姓かな＋名かなを結合） |
| 4 | `cram_id` | 校舎 ID（インポート時に設定） |
| 5 | `school_name` | 学校名 |
| 6 | `school_course` | 学校コース（生徒の初回 LIFF アクセス時または管理画面から設定） |
| 7 | `sub_course` | 文理区分（`文系` / `理系` / 空文字。高2・高3のみ使用） |
| 8 | `grade` | 学年（`高1` / `高2` / `高3`） |
| 9 | `line_user_id` | LINE ユーザー ID（LINE ID 連携で設定） |
| 10 | `is_active` | 在籍フラグ（インポート時は `true`） |

**主キー**: `student_id`  
**備考**: `school_course` と `sub_course` は生徒が LIFF 初回アクセス時の初期設定フローでも設定される。

---

### `school_course_master`
校舎内に存在する学校・コースの一覧。生徒インポート時または生徒の初期設定フロー完了時に自動登録される。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `school_name` | 学校名 |
| 2 | `school_course` | コース名（空文字 = コース未設定） |

**複合キー**: `(school_name, school_course)`  
**備考**: `is_two_terms` 列は廃止。新規コース追加時に `exam_patterns` の5組み合わせ（高1/文理なし・高2/文系・高2/理系・高3/文系・高3/理系）が自動生成される。

---

### `exam_patterns`
試験パターン定義（学校・コース・学年・文理 × 試験区分）。  
管理画面「教科パターン」タブで管理する。コース追加・文理設定時に自動生成される。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `pattern_id` | パターン ID（`P` + タイムスタンプ + 3桁連番） |
| 2 | `school_name` | 学校名 |
| 3 | `school_course` | コース |
| 4 | `grade` | 学年（`高1` / `高2` / `高3`） |
| 5 | `sub_course` | 文理区分（`文系` / `理系` / 空文字） |
| 6 | `term_test_id` | 試験区分 ID（`term_tests_master` 参照・親 SS） |

**主キー**: `pattern_id`  
**標準5組み合わせ**: `(高1, '')` / `(高2, 文系)` / `(高2, 理系)` / `(高3, 文系)` / `(高3, 理系)`  
**備考**: 安定テーブル。削除・変更より追加を基本とする。

---

### `exam_schedule`
試験スケジュール（年度別の実施日程）。管理画面「試験日程」タブで管理する。  
日程未設定でも生徒が得点入力可能（保存時に `exam_schedule` へ自動エントリを作成）。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `exam_id` | 試験 ID（`EX` + タイムスタンプ） |
| 2 | `pattern_id` | パターン ID（`exam_patterns` 参照） |
| 3 | `year` | 年度（例: `2024`） |
| 4 | `start_date` | 開始日 |
| 5 | `end_date` | 終了日 |

**主キー**: `exam_id`  
**備考**: 同一パターンで年度が異なれば別行。年度をまたいだ集計の基点。

---

### `pattern_subjects`
試験パターンと教科の紐付け。  
管理画面「教科パターン」タブで管理。パターン自動生成時にデフォルト教科（各ジャンル最大2教科）が自動設定される。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `pattern_id` | パターン ID（`exam_patterns` 参照） |
| 2 | `subject_id` | 教科 ID（`subjects_master` 参照・親 SS） |

---

### `scores_data`
生徒の得点・順位データ。生徒が得点を入力すると `saveAllScores()` が upsert する。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `score_id` | スコアレコード ID（`SC` + UUID） |
| 2 | `exam_id` | 試験 ID（`exam_schedule` 参照） |
| 3 | `student_id` | 生徒 ID（`students_master` 参照） |
| 4 | `subject_id` | 教科 ID（`subjects_master` 参照・親 SS） |
| 5 | `score` | 得点（0〜200 の整数、空欄可） |
| 6 | `grade_rank` | 学年順位（1 以上の整数、空欄可） |
| 7 | `class_rank` | クラス順位（1 以上の整数、空欄可） |
| 8 | `update_at` | 更新日時 |

**主キー**: `score_id`

---

## ER 図（簡略）

```
【親 SS】
term_tests_master ──────────────── school_term_test_settings
    ↑ term_test_id                      ↑ (school_name, term_test_id)
                                            ↑ school_name
genres_master                     school_subject_aliases
    ↑ genre_id                          ↑ (school_name, subject_id)
subjects_master ──────────────────────────────────────────────────
    ↑ subject_id

student_index ─── line_user_id → student_id + cram_id

【子 SS】
school_course_master
    ↑ (school_name, school_course)
exam_patterns ──────────── pattern_subjects ─── subjects_master（親SS）
    ↑ pattern_id                ↑ subject_id
exam_schedule
    ↑ exam_id
scores_data ─── student_id ─── students_master
            └── exam_id ───── exam_schedule
                                    ↑ pattern_id ─── exam_patterns
```

---

## 集計クエリの考え方

- **学校・コース別集計**: `exam_patterns.school_name / school_course` でフィルタ
- **学年別集計**: `exam_patterns.grade` でフィルタ（試験時点の学年を表す）
- **年度別集計**: `exam_schedule.year` でフィルタ
- **文理別集計**: `exam_patterns.sub_course` でフィルタ

例: 「2024年度・A高校・理系・高2の1学期中間の全得点」
```
scores_data
  JOIN exam_schedule  WHERE year = 2024
  JOIN exam_patterns  WHERE school_name = 'A高校' AND sub_course = '理系' AND grade = '高2'
  JOIN term_tests_master（親SS）  WHERE test_name = '1学期中間'
```

---

## 廃止済みシート・列

| シート/列 | 廃止理由 |
|-----------|---------|
| `term_tests_master.is_two_terms` | `school_term_test_settings` に移行（2026-05-24） |
| `school_course_master.is_two_terms` | 同上 |
| `【設定】学校・科`（子SS） | `school_course_master`（縦テーブル）に移行済み |
| `students_branch`（子SS） | 用途が `students_master` と重複するため廃止 |

---

*更新: 2026-05-24*
