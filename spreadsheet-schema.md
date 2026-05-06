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
| 3 | `pronunciation` / `reading` | 文字列 | 読み/フリガナ | UI で `pronunciation` または `reading` を利用 |
| 4 | `cram_id` | 文字列 | 塾の校舎ID | 現在未実装 |
| 5 | `school_name` | 文字列 | 学校名 ||
| 6 | `school_course` | 文字列 | 学校コース ||
| 7 | `grade` | 文字列 | 学年 | 例: `高1`, `高2`, `高3` |
| 8 | `line_user_id` | 文字列 | LINE 連携用ユーザー ID | `getInitialData()` の検索キー |

**主キー**: `student_id`

---

### Sheet: `exam_data`
実施試験データ

| 列位置 | 列名 | データ型 | 説明 | 備考 |
|--------|----------|--------|------|------|
| 1 | `exam_id` | 文字列 | 試験 ID | 例: `EX202405010001` |
| 2 | `term_test_id` | 文字列 | 試験区分 ID | `term_tests_master` 参照 |
| 3 | `start_date` | 日付 | 開始日 | |
| 4 | `end_date` | 日付 | 終了日 | |
| 5 | `pattern_id` | 文字列 | 試験パターン ID | `exam_patterns` 参照 |

**主キー**: `exam_id`

---

### Sheet: `exam_patterns`
学校・コース・テスト区分を組み合わせた試験パターン

| 列位置 | 列名 | データ型 | 説明 | 備考 |
|--------|------------|--------|------|------|
| 1 | `pattern_id` | 文字列 | パターン ID | 例: `P202405010001` |
| 2 | `school_name` | 文字列 | 学校名 ||
| 3 | `school_course` | 文字列 | コース ID ||
| 5 | `grade` | 文字列 | 学年 | UI 表示用 |

**主キー**: `pattern_id`

---

### Sheet: `term_tests_master`
試験区分マスター

| 列位置 | 列名 | データ型 | 説明 | 備考 |
|--------|--------------|--------|------|------|
| 1 | `term_test_id` | 文字列 | 試験区分 ID | 例: `T01` |
| 2 | `test_name` | 文字列 | 試験名称 | |

**主キー**: `term_test_id`



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

### Sheet: `pattern_subjects`
試験パターンと教科の紐付け

| 列位置 | 列名 | データ型 | 説明 | 備考 |
|--------|----------------|--------|------|------|
| 1 | `pattern_id` | 文字列 | パターン ID | `exam_patterns` 参照 |
| 2 | `subject_id` | 文字列 | 教科 ID | `subjects_master` 参照 |

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
| 2 | `exam_id` | 文字列 | 試験 ID | `exam_data` 参照 |
| 3 | `student_id` | 文字列 | 生徒 ID | `students_master` 参照 |
| 4 | `subject_id` | 文字列 | 教科 ID | `subjects_master` 参照 |
| 5 | `score` | 数値 | 得点 | |
| 6 | `grade_rank` | 数値 | 学年順位 | |
| 7 | `class_rank` | 数値 | クラス順位 | |
| 8 | `update_at` | 日時 | 更新日時 | `saveAllScores()` でセット |

**主キー**: `score_id`

---

## 2. 現状のコードと整合するシートの利用方法

- `getInitialData()` は `students_master` を `line_user_id` で検索し、`exam_patterns`, `exam_data`, `term_tests_master`, `pattern_subjects`, `subjects_master`, `genres_master`, `scores_data` を参照します。
- `saveAllScores()` は `scores_data` を `exam_id`, `student_id`, `subject_id` で検索し、該当行があれば更新、なければ新規追加します。

---

## 3. 推奨事項

- シート名と見出しはいずれもコードと厳密に一致させること。
- `students_master` の `line_user_id` は LINE 連携キーとして必須であるため、空欄を避ける。
- `scores_data` の `score_id` は保存時に自動生成されるため、1列目は必ずユニークな ID を保持する。
- 管理画面側の `subjects_master` / `genres_master` / `pattern_subjects` は教科表示と選択に直結するため、整合性を保つ。

---

*更新: 2026-05-05*
