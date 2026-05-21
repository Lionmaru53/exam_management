# スプレッドシート構造定義書

## 概要
このドキュメントは、現在の `exam_management` プロジェクトで使用されている Google Apps Script 連携のスプレッドシート構造を定義します。

---

## 1. 現在のシート構造

### Sheet: `students_master`
生徒の基本情報を保持するマスターシート

| 列位置 | 列名 | データ型 | 説明 | 備考 |
|--------|------|--------|------|------|
| 1 | `student_id` | 文字列 | 生徒 ID | 例: `405010001` |
| 2 | `name` | 文字列 | 氏名 | |
| 3 | `pronunciation` | 文字列 | 読み | UI で `pronunciation` を利用 |
| 4 | `cram_id` | 文字列 | 塾の校舎ID | 現在未実装 |
| 5 | `school_name` | 文字列 | 学校名 ||
| 6 | `school_course` | 文字列 | 学校コース ||
| 7 | `sub_course` | 文字列 | サブコース | 例: `普通科 A` |
| 8 | `grade` | 文字列 | 学年 | 例: `高1`, `高2`, `高3` |
| 9 | `line_user_id` | 文字列 | LINE 連携用ユーザー ID | `getInitialData()` の検索キー |

**主キー**: `student_id`

---

### Sheet: `term_tests_master`
試験区分マスター（学校から独立した定義）

| 列位置 | 列名 | データ型 | 説明 | 備考 |
|--------|--------------|--------|------|------|
| 1 | `term_test_id` | 文字列 | 試験区分 ID | 例: `T01` |
| 2 | `test_name` | 文字列 | 試験名称 | 例: `1学期中間`, `前期中間` |
| 3 | `is_two_terms` | 文字列 | 2学期制フラグ | `1`: 2学期制, `0`: 3学期制 |

**主キー**: `term_test_id`
**備考**: 学校ごとの違いは `is_two_terms` のみ。学校・コースとは独立して管理する。

---

### Sheet: `exam_patterns`
試験パターン定義（学校・コース・学年・サブコースと試験区分の対応）

| 列位置 | 列名 | データ型 | 説明 | 備考 |
|--------|------|--------|------|------|
| 1 | `pattern_id` | 文字列 | パターン ID | 例: `P20240501120000` |
| 2 | `school_name` | 文字列 | 学校名 | |
| 3 | `school_course` | 文字列 | コース | |
| 4 | `grade` | 文字列 | 学年 | 例: `高1`, `高2`, `高3` |
| 5 | `sub_course` | 文字列 | サブコース | 例: `文系`, `理系` |
| 6 | `term_test_id` | 文字列 | 試験区分 ID | `term_tests_master` 参照 |

**主キー**: `pattern_id`
**備考**: 学校・コース・学年・サブコース・試験区分が決まれば一意に決まる安定したテーブル。ほぼ変更されない。

---

### Sheet: `exam_schedule`
試験スケジュール（年度別の実施日程）

| 列位置 | 列名 | データ型 | 説明 | 備考 |
|--------|----------|--------|------|------|
| 1 | `exam_id` | 文字列 | 試験 ID | 例: `EX20240501120000` |
| 2 | `pattern_id` | 文字列 | パターン ID | `exam_patterns` 参照 |
| 3 | `year` | 数値 | 年度 | 例: `2024` |
| 4 | `start_date` | 日付 | 開始日 | |
| 5 | `end_date` | 日付 | 終了日 | |

**主キー**: `exam_id`
**備考**: 同一パターンで年度が異なれば別行として管理する。年度をまたいだ集計の基点となる。

---

### Sheet: `pattern_subjects`
試験パターンと教科の紐付け

| 列位置 | 列名 | データ型 | 説明 | 備考 |
|--------|----------------|--------|------|------|
| 1 | `pattern_id` | 文字列 | パターン ID | `exam_patterns` 参照 |
| 2 | `subject_id` | 文字列 | 教科 ID | `subjects_master` 参照 |

---

### Sheet: `subjects_master`
教科マスター

| 列位置 | 列名 | データ型 | 説明 | 備考 |
|--------|-------------|--------|------|------|
| 1 | `subject_id` | 文字列 | 教科 ID | 一意識別子 |
| 2 | `subject_name` | 文字列 | 教科名 | |
| 3 | `genre_id` | 文字列 | ジャンル ID | `genres_master` 参照 |
| 4 | `grade` | 文字列 | 対象学年 | 例: `高1`, `高2`, `高3` |

**主キー**: `subject_id`

---

### Sheet: `genres_master`
教科ジャンルマスター

| 列位置 | 列名 | データ型 | 説明 | 備考 |
|--------|----------|--------|------|------|
| 1 | `genre_id` | 文字列 | ジャンル ID | 一意識別子 |
| 2 | `genre_name` | 文字列 | ジャンル名 | |

**主キー**: `genre_id`

---

### Sheet: `scores_data`
生徒ごとの点数データ

| 列位置 | 列名 | データ型 | 説明 | 備考 |
|--------|----------|--------|------|------|
| 1 | `score_id` | 文字列 | スコアレコード ID | 例: `SC...` |
| 2 | `exam_id` | 文字列 | 試験 ID | `exam_schedule` 参照 |
| 3 | `student_id` | 文字列 | 生徒 ID | `students_master` 参照 |
| 4 | `subject_id` | 文字列 | 教科 ID | `subjects_master` 参照 |
| 5 | `score` | 数値 | 得点 | |
| 6 | `grade_rank` | 数値 | 学年順位 | |
| 7 | `class_rank` | 数値 | クラス順位 | |
| 8 | `update_at` | 日時 | 更新日時 | `saveAllScores()` でセット |

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

## 2. テーブル間のリレーション

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
  JOIN term_tests_master  WHERE test_name = '1学期中間'
```

## 4. 推奨事項

- シート名と見出しはいずれもコードと厳密に一致させること。
- `students_master` の `line_user_id` は LINE 連携キーとして必須であるため、空欄を避ける。
- `scores_data` の `score_id` は保存時に自動生成されるため、1列目は必ずユニークな ID を保持する。
- `exam_patterns` は安定テーブルのため、削除・変更より追加を基本とする。
- `exam_schedule` は年度ごとに行を追加し、同一パターンの複数年分が蓄積される。

---

*更新: 2026-05-21*
