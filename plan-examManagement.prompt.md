## Plan: 管理者画面の動作完成と管理UIの安定化

TL;DR: `exam_patterns` を廃止し、`exam_data` に `school_name`, `school_course`, `grade` を追加した新スキーマに対応する。`admin_index.html` は管理画面の初期化とタブ切り替えを担当し、`admin_logic_exams.html` / `admin_logic_patterns.html` は `exam_data` に統合されたパターン情報を使って表示を行う。`admin_getData.js` / `admin_saveData.js` は `exam_data` 拡張に合わせて修正する。

---

## 実施内容

### 1. 管理画面の起動とタブ切り替えを実装
- `admin_index.html` に管理画面共通スクリプトを追加
  - `masterData` を保持するグローバル変数
  - `refreshMasterData()` で `getAdminInitialData()` を呼び出し、データを取得
  - `loadSection(section)` で `renderExamManager()` / `renderPatternManager()` を切り替え
  - `closeModal()` でモーダルを閉じる
  - 初回ロードで `loadSection('exams')` を実行

### 2. 管理画面スタイルを改善
- `admin_stylesheet.html` にアクティブタブ用スタイルを追加
- 管理ナビの見た目を調整し、現在のタブを視覚的に判別しやすくする

### 3. 新しい学校設定シートを追加
- `admin_getData.js` で `【設定】学校・科` を読み込む
- A列を `school_name`、B列を `2学期制`、C列以降を `school_course` の候補として扱う
- 新しい設定シートのすべての学校・コースを `試験日程管理` で表示する
- シートが存在しない場合は自動で作成し、ヘッダーを初期化する

### 4. 試験区分の 2学期制フィルタを追加
- `term_tests_master` に `is_two_terms` 列を追加
- `admin_logic_exams.html` で `is_two_terms=0` は「3学期制」、`is_two_terms=1` は「2学期制」として表示する
- 0/1 両方の試験区分を表示し、それぞれの大きなグループに分ける
- ただし、学校設定シートに存在する学校・コースは引き続き「パターン未登録の学校」として表示する

### 5. 既存管理ロジックの整合確認
- `admin_logic_exams.html` は `masterData` から試験パターンと試験日程を表示
- `admin_logic_patterns.html` は `masterData` から学校・試験区分・学年・sub_course をグループ化して一覧表示し、教科をジャンル別の列に分けて表示する（科目名は改行区切り）。pattern_id がない試験区分もすべて表示。`is_two_terms` と試験区分が一致するもののみ表示。列順序は試験区分のみ。教科編集はインライン編集でチェックボックスを使用、新規教科追加可能。存在しないパターンに対しても操作ボタンを表示し、upsert 処理
- 現行の `updateExamData()`, `addNewPattern()`, `updatePatternSubjects()` を利用して保存処理を完結

## 期待される完了状態
1. 管理画面を開くと `試験日程管理` が表示される
2. `教科パターン管理` タブへ切り替えられる
3. 既存パターンと教科の一覧が `masterData` から表示される
4. 新しい `【設定】学校・科` シートの全学校・コースが `試験日程管理` に表示される
5. 編集・追加・保存処理が既存の `admin_saveData.js` と連携できるようになる
6. モーダルの閉じる操作が動作する

## 注意点
- この更新では既存のシート構成を前提とし、`exam_data` に `school_name`, `school_course`, `grade` を追加した新スキーマを利用する
- `exam_patterns` シートは廃止し、`exam_data` が試験パターンと日程を兼ねる構造に変更する
- 既存の `schools_master` / `school_courses_master` 依存は管理画面では不要と判断
- 実際の Google Apps Script 実行確認は、Apps Script 側でページを開いて動作検証が必要

## 次の確認項目
1. `admin_index.html` でタブ切り替えと初期ロードが動作するか
2. `masterData` が取得され、`renderExamManager()` / `renderPatternManager()` へ渡せるか
3. `closeModal()` がモーダルを閉じるか
4. `showMessage()` がエラー通知を表示できるか

