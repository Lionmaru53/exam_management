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
| 3 | `role` | `master` または `branch_admin` |
| 4 | `is_active` | 有効フラグ |
| 5以降 | `{cram_id}` | 校舎ごとの動的列（列名 = cram_id、値 `TRUE` = その校舎を担当） |

**主キー**: `admin_id`  
**備考**: `admin_id` / `email` / `role` / `is_active` が固定列。5列目以降は校舎を追加するたびに列を増やす。  
`master` ロールは全 cram_id 列を担当とみなす（TRUE/FALSE 不問）。  
`branch_admin` は値が `TRUE` の列の校舎のみ操作可能。  
`setupAdminSS()` が初期ヘッダー `[admin_id, email, role, is_active]` を作成する。

---

### `bug_reports`
生徒アプリから送信された不具合報告。`submitBugReport()`（`saveData.js`）が追記する。  
Google Sheets の通知ルール（ツール → 通知）でメール通知を設定する（MailApp は未使用）。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `report_id` | レポート ID（`BR` + UUID 先頭12文字） |
| 2 | `timestamp` | 送信日時 |
| 3 | `student_id` | 生徒 ID |
| 4 | `student_name` | 生徒名 |
| 5 | `school_name` | 学校名 |
| 6 | `grade` | 学年 |
| 7 | `report_type` | 種別（`表示名が違う` / `科目が足りない` / `保存した点数が消えた` / `テスト名・試験区分がおかしい` / `その他`） |
| 8 | `detail` | 詳細（種別ごとの補助入力＋自由記述を結合した文字列） |

**備考**: シートが存在しない場合は `submitBugReport()` が自動作成する。

---

### `liff_access_log`
LIFF（生徒アプリ）へのアクセスログ。`_writeLiffLog()`（`getData.js`）が自動追記する。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `timestamp` | アクセス日時 |
| 2 | `line_user_id` | LINE ユーザー ID |
| 3 | `result` | 結果（例: `success`, `NOT_LINKED`, `NO_BRANCH`） |
| 4 | `student_id` | 解決した生徒 ID（失敗時は空） |
| 5 | `cram_id` | 校舎 ID（失敗時は空） |
| 6 | `student_name` | 生徒名（失敗時は空） |

**備考**: シートが存在しない場合は `_writeLiffLog()` が自動作成する。

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
`line_user_id` → `student_id` + `cram_id` のルーティングテーブル。  
`getData.js` と `saveData.js` が最初に参照し、どの子 SS を開くかを決定する。  
データはスプレッドシート関数（VSTACK 等）で `line_student_import` シートから自動生成される。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `student_id` | 生徒 ID |
| 2 | `line_user_id` | LINE ユーザー ID |
| 3 | `cram_id` | 校舎 ID（子 SS 特定に使用） |

**主キー**: `student_id`  
**検索キー**: `line_user_id`（`getData.js` が LINE ID → student_id 解決に使用）  
**備考**: このシートは数式で自動集計されるため直接編集しない。紐づけの追加・変更は `line_student_import` シートで行う。

---

### `line_student_import`
`student_id` / `line_user_id` / `cram_id` の紐づけを管理する入力シート。  
ここに行を追加すると `student_index` の数式が自動的に取り込む。

| 列 | 列名 | 説明 |
|----|------|------|
| A | `cram_id` | 校舎 ID |
| B | `student_id` | 生徒 ID |
| C〜H | （未使用） | 削除しない |
| I〜N | `line_user_id` | LINE ユーザー ID（複数列） |

**備考**: 外部担当者が直接入力する運用を想定。`student_index` は VSTACK 等の数式でこのシートを参照している。  
**注意**: 列構成が特殊なため `setupAdminSS()` の reconcile 対象外。シートが存在しない場合のみ空シートを作成する。

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
| 1 | `subject_id` | 教科 ID。通常は手動設定（例: `SUB101`）。仮教科の場合は `SUB{学年数字}{連番}` で自動生成（例: 高3の16番目→`SUB316`） |
| 2 | `subject_name` | 教科名 |
| 3 | `genre_id` | ジャンル ID（`genres_master` 参照） |
| 4 | `grade` | 対象学年（例: `高1`, `高2`, `高3`） |
| 5 | `is_temp` | 仮教科フラグ（`'1'` = 生徒が「その他」で入力した未解決教科。管理者が「新規登録」または「既存に統合」するまで保持） |

**主キー**: `subject_id`

**仮教科の命名ルール**: `SUB{学年数字}{通し番号}`。学年数字は `高3` → `3`。通し番号は `subjects_master` の全 `SUB{g}*` エントリの最大番号に +1。通し番号はパディングなし（`SUB316` = 高3の16番目）。

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

### `announcements`
管理者がお知らせを登録するシート。`getInitialData()` が生徒アプリ初期ロード時に取得する。

| 列 | 列名 | 説明 |
|----|------|------|
| 1 | `announcement_id` | 一意ID（例: `ann_001`）。手動入力 |
| 2 | `title` | タイトル |
| 3 | `body` | 本文。改行は `\n` で入力 |
| 4 | `category` | カテゴリ（`important` / `info` / `notice`）|
| 5 | `target_cram_id` | 対象校舎の cram_id。空欄 = 全校舎に表示 |
| 6 | `published_at` | 公開日（この日付以降に表示される） |
| 7 | `expires_at` | 掲載終了日（空欄 = 無期限） |
| 8 | `is_active` | 表示フラグ（`1`: 表示 / `0`: 非表示） |

**備考**: シートが存在しない場合は `getInitialData()` が `[]` を返す（既存機能への影響なし）。  
未読管理は生徒のブラウザのローカルストレージ（キー: `ann_read_{student_id}`）で行う。

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
| 9 | `is_active` | 在籍フラグ（インポート時は `true`） |

**主キー**: `student_id`  
**備考**: `school_course` と `sub_course` は生徒が LIFF 初回アクセス時の初期設定フローでも設定される。  
LINE ID とのひも付けは親 SS の `student_index` で管理するため、このシートには持たない。

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
| 2 | `exam_id` | ~~試験 ID（廃止予定・既存レコードは値あり、新規は空）~~ |
| 3 | `student_id` | 生徒 ID（`students_master` 参照） |
| 4 | `subject_id` | 教科 ID（`subjects_master` 参照・親 SS） |
| 5 | `score` | 得点（0〜200 の整数、空欄可） |
| 6 | `grade_rank` | 学年順位（1 以上の整数、空欄可） |
| 7 | `class_rank` | クラス順位（1 以上の整数、空欄可） |
| 8 | `update_at` | 更新日時 |
| 9 | `not_taken` | 欠試フラグ（`1` or 空） |
| 10 | `term_test_id` | 試験区分 ID（`term_tests_master` 参照・親 SS） |
| 11 | `grade` | 保存時点の学年（UPDATE 時は変更しない） |
| 12 | `year`  | 学年暦年度（例: 2025 = 2025年4月〜2026年3月）。UPDATE 時は変更しない。LIFF の `examTab.year` から取得 |
| 13 | `raw_subject_name` | **レガシー列**。旧方式（`subject_id='OTHER'`）で保存された場合の教科名入力値。新方式では仮教科を `subjects_master` に登録するため不使用。既存レコードの値は移行処理で空に変換される |
| 14 | `genre_name` | ジャンル名（保存時点の値をコピー）。参照用キャッシュ |

**主キー**: `score_id`  
**upsert キー**: `(student_id, subject_id, term_test_id)`

> `grade` と `year` は INSERT 時のみ記録。年度をまたいだ再保存でも初回の値が保持される。

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
scores_data ─── student_id ──── students_master
            └── term_test_id ── term_tests_master（親SS）
```

---

## 集計クエリの考え方

- **学校・コース別集計**: `exam_patterns.school_name / school_course` でフィルタ
- **学年別集計**: `exam_patterns.grade` でフィルタ（試験時点の学年を表す）
- **文理別集計**: `exam_patterns.sub_course` でフィルタ

例: 「A高校・理系・高2の1学期中間の全得点」
```
scores_data
  JOIN term_tests_master（親SS）  WHERE test_name = '1学期中間'
  JOIN students_master            WHERE school_name = 'A高校'
  （→ exam_patterns で sub_course = '理系', grade = '高2' に絞り込み）
```

---

## 廃止済みシート・列

| シート/列 | 廃止理由 |
|-----------|---------|
| `admin_users.cram_ids` | 校舎ごとの動的列方式（5列目以降）に変更 |
| `exam_schedule`（子SS） | `scores_data.term_test_id` で直接結合する設計に移行。本番 SS からは手動削除。 |
| `scores_data.exam_id` | `exam_schedule` 廃止に伴い不要。既存レコードの値は残し、新規は空文字。 |
| `admin_users.created_at` | 不要と判断し廃止 |
| `admin_users.last_login` | 不要と判断し廃止 |
| `term_tests_master.is_two_terms` | `school_term_test_settings` に移行（2026-05-24） |
| `school_course_master.is_two_terms` | 同上 |
| `【設定】学校・科`（子SS） | `school_course_master`（縦テーブル）に移行済み |
| `students_branch`（子SS） | 用途が `students_master` と重複するため廃止 |
| `students_master.line_user_id`（子SS） | LINE ID 解決は親 SS の `student_index` に一元化。コードから参照なし |
| `scores_data.subject_id = 'OTHER'`（旧方式） | 「その他」教科を `OTHER` + `raw_subject_name` で表現する旧方式を廃止。新方式は `subjects_master` に `is_temp='1'` で仮登録し、固有の `SUB{学年}{連番}` ID を使用 |

---

*更新: 2026-05-30*
