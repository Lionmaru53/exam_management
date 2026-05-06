## Plan: スプレッドシートスキーマ改定とプログラム再構築

TL;DR: シート構成を簡素化（`schools_master`・`school_courses_master` 削除）し、`exam_patterns` に学校名・コース名を直接保持する設計に変更。管理者画面を「試験日程管理」と「教科パターン管理」の 2機能に絞ってゼロから再構築。入力画面の機能は維持しつつ、バックエンド処理を新スキーマに対応させる。

---

## フェーズ 1: ユーザー入力画面の修正（現在の機能保持） ✅完了
1. `getData.js`: `getInitialData()` を修正 ✅
   - 削除: `schools_master`・`school_courses_master` への参照 ✅
   - 追加: `exam_patterns` から `school_name`・`school_course` を直接取得 ✅
   - シート読み込み処理、データフィルタリングロジックを修正 ✅
2. `logic_ui_render.html`: `genres_master.color` 削除対応 ✅
   - 削除されたカラムの代替として、デフォルト色または固定色パレットで対応 ✅
3. `saveData.js`: `saveAllScores()` の保存処理 ✅
   - `scores_data` の構造は保持されるため、基本的に現行ロジックのまま動作確認 ✅

## フェーズ 2: 管理者画面のゼロからの再構築 ✅完了
- `admin_index.html`: タブナビを「試験日程管理」「教科パターン管理」に再設計 ✅
- `admin_logic_exams.html`: 試験日程管理をゼロから実装 ✅
   - 表示: 試験区分 → 学校名・コース → 日程 ✅
   - 機能: 試験日程一覧、新規追加、編集、削除 ✅
- `admin_logic_patterns.html`: 教科パターン管理をゼロから実装 ✅
   - 表示: 学校名 → コース → 試験区分 → 教科 ✅
   - 機能: パターン教科の一覧、選択、追加、新規教科登録 ✅

## フェーズ 3: バックエンド処理の統一修正 ✅完了
- `admin_getData.js`: `getAdminInitialData()` を修正 ✅
   - 削除: `ensureSchoolSchoolCoursesSheet()`、`schools_master`・`school_courses_master` 参照 ✅
   - 新構成: 管理者向けに 9シート対応（生徒マスター以外） ✅
- `admin_saveData.js`: 関数の削除・修正 ✅
   - 削除: `updateStudentMaster()`、学校・コース管理関連の関数 ✅
   - 修正: `updateExamData()`、`updatePatternSubjects()` を新スキーマに対応 ✅

## フェーズ 4: 削除・統廃合 ✅完了
- 削除予定: `admin_logic_students.html`、`local_logic.js`、`local_logic_unpivot.js` ✅

## フェーズ 5: スキーマ進化対応 ✅完了
- スキーマが進化中のため、拡張性を優先した設計を保持 ✅
- `exam_patterns` の列追加や構成変更に柔軟に対応可能なバックエンド設計を意識 ✅

## 実装前の確認事項
- スキーマ最終確定: `exam_patterns` の正確な列順・列名を確認
- 色付けロジックの決定: 固定色パレット vs 色付け廃止
- データ移行手順の準備: 旧シートから新スキーマへの移行フローを確立

## 検証項目
1. 入力画面: LINE ID 検索～データ取得～タブ表示～点数保存の全フローが動くこと
2. 管理画面: 試験日程管理と教科パターン管理の保存・編集が正しく動作すること
3. 新スキーマ依存性: 新しいシート構成での全処理が整合すること
