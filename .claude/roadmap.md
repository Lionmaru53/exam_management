# 開発ロードマップ

## Phase 0 — 管理画面基盤（完了 2026-05-17）
- [x] 管理者認証（メール照合・簡易版）
- [x] 管理者管理タブ（admin_users CRUD）
- [x] 共通マスターデータ管理タブ（試験区分・教科ジャンル・教科一覧）
- [x] 校舎管理タブ（プレースホルダー）
- [x] 生徒インポートタブ（プレースホルダー）

## Phase 1 — 認証強化（完了 2026-05-18）
- [x] `getAdminContext()` を `Session.getActiveUser().getEmail()` ベースに変更
- [x] 全 API 関数のシグネチャから callerEmail を削除（引数なし）
- [x] ログイン画面を削除し、ページロード時に自動認証
- [x] デプロイ設定をアクセス「ログインが必要」に変更

> GIS（Google Identity Services）は `script.google.com` を JavaScript オリジンとして
> 登録できないため断念。代わりに GAS webapp のアクセス設定「ログインが必要」+
> `Session.getActiveUser()` でサーバーサイドから認証する方式を採用。

## Phase 2 — 校舎管理・子 SS 連携（完了 2026-05-19・main マージ済み）

設計方針: 親 SS に `branches` シートを持ち cram_id → 子 SS の spreadsheet_id を管理。  
生徒データは校舎別の子 SS に格納し、`student_index`（親 SS）でルーティングする。

| シート | 配置先 | 状態 |
|--------|--------|------|
| `admin_users` / `audit_log` / `branches` / `student_index` | 親 SS | 実装済み |
| `term_tests_master` / `genres_master` / `subjects_master` / `school_subject_aliases` | 親 SS（全校舎共通） | 実装済み |
| `school_term_test_settings` | 親 SS（学校別試験区分設定） | 実装済み |
| `exam_patterns` / `exam_schedule` / `pattern_subjects` | 子 SS | 実装済み |
| `students_master` / `scores_data` / `school_course_master` | 子 SS | 実装済み |

### 2-A〜2-F: 基盤実装（完了）
- [x] **2-A**: `admin_branch.js` 新規作成（`getChildSS` / `getBranches` / `addBranch` / `updateBranch`）
- [x] **2-A**: `setupAdminSS()` に `branches` シート作成を追加
- [x] **2-A**: `getAdminInitialData()` に master 向け branches 一覧を追加・子SS参照対応
- [x] **2-B**: `admin_logic_branches.html` 実装（校舎一覧・追加・編集・有効化/無効化 UI）
- [x] **2-C**: `setupBranchSS()` 実装（子 SS のシート自動作成）
- [x] **2-C**: `shareBranchSS()` 実装（DriveApp スコープ分離・校舎管理者への共有）
- [x] **2-D**: 管理画面フロントエンドの cramId 引数渡し対応（exams / patterns / branches）
- [x] **2-E**: `admin_import.js` 実装（`importStudentData` / `linkLineIds` / `migrateStudentsFromParentSS`）
  - xlsx 解析を SheetJS（ブラウザ側 CDN）で行い Drive API 不要とした
- [x] **2-F**: `getData.js` / `saveData.js` の子 SS ルーティング対応（完了 2026-05-19）
  - 親 SS の `student_index`（student_id / line_user_id / cram_id）でルーティング
  - `linkLineIds()`: 外部 SS の「内部生」シートから LINE ID を取り込み student_index を更新
  - `migrateStudentsFromParentSS()`: 旧・親 SS の students_master から子 SS への一括移行ユーティリティ
- [x] **2-F**: `getStudentList()` 実装 + 管理画面「生徒一覧」タブ追加（学校名グループ化）

### 2-G: 管理者・校舎の拡張（完了）
- [x] 管理者が複数校舎を担当可能に（`admin_users.cram_id` → カンマ区切り `cram_ids`）
- [x] `branch_admin` でも校舎セレクタープルダウンを表示（nav の下に配置）
- [x] 生徒インポート時に校舎列（`_cram_id`）でフィルタリング

**Phase 2 で判明した GAS の制約（→ `.claude/rules.md` に追記済み）**
- GAS テンプレートリテラル内の `style=` が userCodeAppPanel の特定行で SyntaxError を引き起こす
- Drive API は `appsscript.json` のスコープ宣言だけでは動作しない（OAuth 再認可が必要）
- `clasp push` は GAS エディタのコードを更新するが、バージョン固定デプロイには反映されない

---

## 開発基盤

### 学校設定の正規化（完了）
- [x] 旧横並びシート `【設定】学校・科` を廃止し `school_course_master`（縦テーブル）に移行
- [x] 生徒インポート時に `school_name` を `school_course_master` へ自動登録（upsert）
- [x] migrate 系関数を削除

### 生徒一覧の強化（完了 2026-05-24）
- [x] 学校→学年の2段階階層表示（インデントなし）
- [x] 氏名（読み）・コースでのソート
- [x] コース列・文理列（sub_course）の追加
- [x] 複数生徒のコース・文理を一括変更（チェックボックス＋プルダウン）
- [x] サブ区分の名称を「文理」に統一、選択肢を文系/理系に固定
- [x] 「コースを編集」「文理を編集」ボタンを分離（別々の編集フローに）
- [x] コース編集時のヘッダーチェックボックスで学年全選択
- [x] コース・文理の必須設定を促す説明文の追加
- [x] タブ順序変更：生徒一覧 → 生徒インポート → 教科パターン → 試験日程
- [x] 初期表示を「生徒一覧」に変更

### school_term_test_settings 導入（完了 2026-05-24）
- [x] 親SS に `school_term_test_settings` シート追加（`school_name × term_test_id → is_active, display_name`）
- [x] `getData.js`: `is_two_terms` フラグを廃止し `school_term_test_settings` ベースのフィルタに移行
- [x] `admin_getData.js`: `getAdminInitialData()` に `schoolTermTestSettings` 追加
- [x] `admin_save_master.js`: `_ensureSchoolTermTestSettingsSheet()` / `upsertSchoolTermTestSetting()` 追加
- [x] 管理画面「学校別試験区分設定」セクション追加
- [x] `is_two_terms` の廃止（term_tests_master・school_course_master・管理画面UIから除去）

### 教科パターン管理の改善（完了 2026-05-24）
- [x] 階層構造を 学校 / コース / 文理 / 学年 の4段階に変更
- [x] 標準グループ（高1/文理なし・高2/文系・高2/理系・高3/文系・高3/理系）を常に表示（schoolSettings ベース）
- [x] 「教科を編集」パネルに checkbox・正式名・表示名 input を並べる UI
- [x] 試験日程を任意化（日程未設定でも生徒が得点入力可能、保存時に自動作成）
- [x] コース追加時のパターン自動生成: `_autoCreateAllPatterns()`（5組み合わせ×全試験区分、1パスで ID 衝突なし）
- [x] 文理設定時のパターン自動生成: `_autoCreateExamPatterns()`（高2・高3×指定文理のみ）
- [x] パターン生成時にデフォルト教科を自動設定: `_setDefaultSubjectsForPatterns()`（各ジャンル最大2教科）
- [x] デフォルト教科の設定: 各ジャンル2教科に変更

### 2-H: 教科表示名エイリアス（完了）
- [x] 親SS に `school_subject_aliases` シート追加（`school_name × subject_id → display_name`）
- [x] `getData.js` で alias lookup を実装（エントリなければ canonical name にフォールバック）
- [x] 管理画面タブ名を「学校別教科名・教科パターン管理」に変更
- [x] 教科パターン管理タブの編集パネルに表示名入力欄を追加（onblur で自動保存）
- [x] 楽観的ロック: `updated_at` による競合検出 → 自動更新

---

## Phase 3 — 生徒向け機能拡張（完了 2026-05-24）

### 得点入力 UI（完了）
- [x] 点数・順位の入力を `<select>` から `<input type="text">` に変更
- [x] 半角数字のみ入力制限（`oninput` フィルタ＋`inputmode="numeric"`）
- [x] 保存時バリデーション: 点数 0〜200 の整数、順位 1 以上の整数、空欄は許可
- [x] 試験区分の切り替えをタブからプルダウン（`<select>`）に変更

### エラー表示の改善（完了）
- [x] エラーコード別の端的なメッセージ表示（`NOT_LINKED` / `NO_BRANCH` / `STUDENT_NOT_FOUND` / `SYSTEM_ERROR`）
- [x] LINE 未紐づけ時（`NOT_LINKED`）にユーザー登録 URL をリンクで表示

### 初期設定フロー（完了）
- [x] コース未設定生徒が LIFF にアクセスすると「コース入力 → 文理選択（高2/高3のみ）→ 確認」の多段フロー
- [x] 文理未設定生徒（高2/高3）が LIFF にアクセスすると「文系/理系選択 → 確認」フロー
- [x] フロー完了後: `setStudentCourseAndSubCourse()` / `setStudentSubCourse()` でシートを更新し再描画
- [x] コース設定時: `upsertSchoolCourse()` でパターン自動生成（`_autoCreateAllPatterns`）＋デフォルト教科設定

### 開発者モード（完了）
- [x] `/dev` URL（`Session.getActiveUser().getEmail()` でメール取得可）でアクセスした場合、userId 手動入力フォームを表示
- [x] `google.script.run.getStudentAppHtml(uid)` → `document.write()` で LIFF 画面を表示（`window.location.href` 不使用）

---

## Phase 4 — 教科管理・得点機能拡張

### 「その他」教科の仮登録フロー（完了 2026-05-27）
- [x] 生徒が「その他」で教科を入力した際、`subjects_master` に仮教科を自動登録（`is_temp='1'`）
- [x] 仮教科の `subject_id` を `SUB{学年数字}{連番}` 形式で自動採番（例: 高3の16番目→`SUB316`）
- [x] 重複防止: `is_temp='1'` かつ同名エントリがあれば既存 ID を再利用
- [x] `grade` を仮教科レコードにも保存（絞り込み・表示に使用）
- [x] 管理画面④得点一覧：仮教科をジャンル別にインライン表示（既存教科と同ジャンルに混在）
- [x] 管理画面「未解決教科」紐づけUI：「新しい科目として登録（承認）」vs「既存の科目に統合」の2択
- [x] 承認（`approveNewSubject`）: `subjects_master.is_temp` を空にして正式教科に昇格
- [x] 統合（`resolveOtherSubject`）: `scores_data` の `subject_id` を一括更新し仮エントリを削除
- [x] 仮教科の検出を `is_temp='1'` カラム基準に統一（命名形式に依存しない設計）
- [x] 旧方式（`subject_id='OTHER'` + `raw_subject_name`）からの移行コードを `saveAllScores` に追加

### 生徒向け教科編集モーダル（未実装）
- [ ] 得点表右上の ⋮ ボタン → 教科を編集モーダル
- [ ] ジャンル別チェックボックスで表示教科を変更
- [ ] 「その他」チェック → 教科名入力 → 仮教科として保存

### その他（バックログ）
- [ ] 得点シート・過去成績の表示機能（[backlog.md](backlog.md) 参照）
- [ ] 証拠写真・評定のアップロード（[backlog.md](backlog.md) 参照）
- [ ] 生徒入力による表記ゆれ対応・パターン統合機能（[backlog.md](backlog.md) 参照）
- [ ] 教科ごとの満点設定・バリデーション強化（[backlog.md](backlog.md) 参照）

---

## 開発基盤

- [x] ファイル階層化: GAS ソースを `src/`、Jest テストを `tests/unit/`、GAS テストを `tests/` に整理
- [x] 環境分離: `.clasp.dev.json`（開発環境）/ `.clasp.json`（本番、git 管理外）
- [x] テスト用 push スクリプト: `push-test.ps1`（`src/` + `tests/` を GAS テスト環境へ）
- [x] Node.js + Jest ユニットテスト導入（`npm test`）: 42 テスト・5スイート、全 PASS
- [x] **src/ ファイル整理**（2026-05-22）
  - `admin_saveData.js`（760行）を3分割: `admin_save_exams.js` / `admin_save_master.js` / `admin_save_students.js`
  - `common_stylesheet.html` を共通スタイルのみに絞り込み、生徒アプリ専用の `app_stylesheet.html` を新設
