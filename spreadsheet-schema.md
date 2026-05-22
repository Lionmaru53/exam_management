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
| 3 | `cram_id` | 担当校舎 ID（master は空欄可） |
| 4 | `role` | `master` または `branch_admin` |
| 5 | `is_active` | 有効フラグ |
| 6 | `created_at` | 登録日時 |
| 7 | `last_login` | 最終ログイン日時 |

**主キー**: `admin_id`

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
**検索キー**: `line_user_id`（`getData.js` が参照）、`student_id`（`saveData.js` が参照）

---

### `term_tests_master`
試験区分マスター（全校舎共通）。管理画面「マスターデータ」タブで管理する。

| 列 | 列名 | 説明 | 備考 |
|----|------|------|------|
| 1 | `term_test_id` | 試験区分 ID | 例: `T01` |
| 2 | `test_name` | 試験名称 | 例: `1学期中間`, `前期中間` |
| 3 | `is_two_terms` | 2学期制フラグ | `1`: 2学期制, `0`: 3学期制 |

**主キー**: `term_test_id`

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

| 列 | 列名 | 説明 | 備考 |
|----|------|------|------|
| 1 | `subject_id` | 教科 ID | |
| 2 | `subject_name` | 教科名 | |
| 3 | `genre_id` | ジャンル ID | `genres_master` 参照 |
| 4 | `grade` | 対象学年 | 例: `高1`, `高2`, `高3` |

**主キー**: `subject_id`

---

## 子 SS のシート

校舎ごとに 1 つ作成。`setupBranchSS()` で初期化される。

### `config`
子 SS の設定情報。コードから `CRAM_ID` / `PARENT_SS_ID` を参照する想定（現状は参照していない）。

| 行 | キー | 値 |
|----|------|----|
| 1 | `CRAM_ID` | この子 SS が対応する校舎 ID |
| 2 | `PARENT_SS_ID` | 親 SS の spreadsheet_id |
| 3 | `BRANCH_NAME` | 校舎名 |

---

### `students_master`
生徒の基本情報（校舎別）。xlsx インポートで登録し、LINE ID 連携で `line_user_id` を追記する。

| 列 | 列名 | 説明 | 備考 |
|----|------|------|------|
| 1 | `student_id` | 生徒 ID | 外部システムの管理番号 |
| 2 | `name` | 氏名 | 姓＋名を結合 |
| 3 | `pronunciation` | 読み | 姓かな＋名かなを結合 |
| 4 | `cram_id` | 校舎 ID | インポート時に設定 |
| 5 | `school_name` | 学校名 | |
| 6 | `school_course` | 学校コース | インポート時は空欄 |
| 7 | `sub_course` | サブコース | インポート時は空欄 |
| 8 | `grade` | 学年 | `高1` / `高2` / `高3` |
| 9 | `line_user_id` | LINE ユーザー ID | LINE ID 連携で設定 |
| 10 | `is_active` | 在籍フラグ | インポート時は `true` |

**主キー**: `student_id`

---

### `students_branch`
生徒の在籍状態サマリ（軽量版）。インポート時に `students_master` と同時に更新される。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `student_id` | 生徒 ID |
| 2 | `grade` | 学年 |
| 3 | `is_active` | 在籍フラグ |

**主キー**: `student_id`

---

### `【設定】学校・科`
学校・コース設定シート。管理画面「試験日程」タブの学校設定が使用する。

| 列 | 説明 | 備考 |
|----|------|------|
| 1 | 学校名 | `exam_patterns.school_name` と一致させる |
| 2 | 2学期制フラグ | `1`: 2学期制, `0` または空: 3学期制 |
| 3以降 | 科・コース名 | 複数列で複数コースを定義 |

---

### `exam_patterns`
試験パターン定義（学校・コース・学年・サブコース × 試験区分）。  
管理画面「教科パターン」タブで管理する。

| 列 | 列名 | 説明 | 備考 |
|----|------|------|------|
| 1 | `pattern_id` | パターン ID | `P` + タイムスタンプ + 連番 |
| 2 | `school_name` | 学校名 | |
| 3 | `school_course` | コース | |
| 4 | `grade` | 学年 | `高1` / `高2` / `高3` |
| 5 | `sub_course` | サブコース | 例: `文系`, `理系` |
| 6 | `term_test_id` | 試験区分 ID | `term_tests_master` 参照（親 SS） |

**主キー**: `pattern_id`  
**備考**: 安定テーブル。削除・変更より追加を基本とする。

---

### `exam_schedule`
試験スケジュール（年度別の実施日程）。管理画面「試験日程」タブで管理する。

| 列 | 列名 | 説明 | 備考 |
|----|------|------|------|
| 1 | `exam_id` | 試験 ID | `EX` + タイムスタンプ + 連番 |
| 2 | `pattern_id` | パターン ID | `exam_patterns` 参照 |
| 3 | `year` | 年度 | 例: `2024` |
| 4 | `start_date` | 開始日 | |
| 5 | `end_date` | 終了日 | |

**主キー**: `exam_id`  
**備考**: 同一パターンで年度が異なれば別行。年度をまたいだ集計の基点。

---

### `pattern_subjects`
試験パターンと教科の紐付け。管理画面「教科パターン」タブで管理する。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `pattern_id` | パターン ID（`exam_patterns` 参照） |
| 2 | `subject_id` | 教科 ID（`subjects_master` 参照・親 SS） |

---

### `scores_data`
生徒の得点・順位データ。生徒が得点を入力すると `saveAllScores()` が Upsert する。

| 列 | 列名 | 説明 | 備考 |
|----|------|------|------|
| 1 | `score_id` | スコアレコード ID | `SC` + UUID |
| 2 | `exam_id` | 試験 ID | `exam_schedule` 参照 |
| 3 | `student_id` | 生徒 ID | `students_master` 参照 |
| 4 | `subject_id` | 教科 ID | `subjects_master` 参照（親 SS） |
| 5 | `score` | 得点 | |
| 6 | `grade_rank` | 学年順位 | |
| 7 | `class_rank` | クラス順位 | |
| 8 | `update_at` | 更新日時 | |

**主キー**: `score_id`

---

### Sheet: `school_subject_aliases`
学校単位の教科表示名エイリアス（親SS に追加）

| 列位置 | 列名 | データ型 | 説明 | 備考 |
|--------|------|--------|------|------|
| 1 | `school_name` | 文字列 | 学校名 | 複合キーの一部 |
| 2 | `subject_id` | 文字列 | 教科ID | `subjects_master` 参照、複合キーの一部 |
| 3 | `display_name` | 文字列 | この学校での表示名 | 空欄不可（クリアは行削除） |
| 4 | `updated_at` | 日時 | 楽観的ロック用タイムスタンプ | |

**複合キー**: `(school_name, subject_id)`
**備考**: エントリがなければ `subjects_master.subject_name`（canonical name）にフォールバック。複数 branch が同じ学校を持つ場合も一元管理。

---

### Sheet: `school_course_master`
学校・コース設定シート（生徒インポート時に自動登録、管理画面から追加も可）

| 列位置 | 列名 | データ型 | 説明 | 備考 |
|--------|------|--------|------|------|
| 1 | `school_name` | 文字列 | 学校名 | 主キーの一部 |
| 2 | `school_course` | 文字列 | コース名 | 空文字 = コース未設定 |
| 3 | `is_two_terms` | 数値 | 2学期制フラグ | `1`: 2学期制, `0`: 3学期制 |

**複合キー**: `(school_name, school_course)`
**備考**: `exam_patterns` の `school_name / school_course` の選択肢として使用。生徒インポート時に `school_name` が自動登録される（`school_course = ''`, `is_two_terms = 0` で初期登録）。

---

## 集計クエリの考え方

```
term_tests_master
    ↑ term_test_id
exam_patterns ──────────── pattern_subjects ─── subjects_master
    ↑ pattern_id           ↑ subject_id               ↑ genre_id
exam_schedule                                  genres_master
    ↑ exam_id
scores_data ─── student_id ─── students_master
                                    ↑ school_name
                            school_course_master
```

## 3. 集計クエリの考え方

- **学校・コース別集計**: `exam_patterns.school_name / school_course` でフィルタ
- **学年別集計**: `exam_patterns.grade` でフィルタ（試験時点の学年を表す）
- **年度別集計**: `exam_schedule.year` でフィルタ
- **サブコース別集計**: `exam_patterns.sub_course` でフィルタ

例: 「2024年度・A高校・理系・高1の1学期中間の全得点」
```
scores_data
  JOIN exam_schedule  WHERE year = 2024
  JOIN exam_patterns  WHERE school_name = 'A高校' AND sub_course = '理系' AND grade = '高1'
  JOIN term_tests_master（親SS）  WHERE test_name = '1学期中間'
```

---

*更新: 2026-05-21*
