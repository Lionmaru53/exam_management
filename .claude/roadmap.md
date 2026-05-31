# 開発ロードマップ

> **Notion に移行しました**
> 詳細は Notion を参照してください。
> https://www.notion.so/36df79283f7081a7b1eef58fe310e99e

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
- [x] **2-C**: `shareBranchSS()` 実装（DriveApp スコープ分離・校舎管理者への共有）→ **2026-05-29 廃止**（未使用のため削除）
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

### 生徒向け科目編集 UI 改善（完了 2026-05-28・feature/score ブランチ）
- [x] ✎ボタン押下時の GAS 呼び出しを廃止（ページロード済みデータで即座に編集モードへ）
- [x] `replacePatternSubject` が `patternSubjectIds` を返し、保存後の `getInitialData` 再呼び出しを廃止
- [x] 「タップして科目を追加」ボタンを全教科セクション末尾に常時表示（合計 genre は除外）
- [x] ドロップダウンに「その他（名称を入力）」選択肢を追加・仮教科登録と連携
- [x] genres_master の行順で教科表示をソート
- [x] ✎ アイコンを SVG（四角＋鉛筆、class="icon-edit"）に刷新
- [x] パターン初回作成時の subject_id 自動登録を廃止（`_setDefaultSubjectsForPatterns` の呼び出し削除）→ **2026-05-29 関数本体・`default` 列・デッドコードをすべて削除**
- [x] パターン初回作成時に genre_id='to'（合計）科目のみ自動登録（`_addTotalGenreSubjects` 新設）
- [x] CSS 改善: `.subj-replace-select` をコンテンツ幅に縮小・ボタン高さ統一・余白縮小
- [x] usage-hint に説明文を追記（✎ボタン説明・変更保持・不具合報告）

### 管理画面 UI 改善（完了 2026-05-29・main マージ済み）
- [x] **②得点一覧タブ** のクロス表をフラットテーブルに変更
  - 列: 学校名 / コース / 学年 / 文理 / 氏名⇅ / 科目⇅
  - 学校/コース・学年/文理 スライサーチップ（複数選択・複合キー）
  - 氏名・各科目の昇順/降順ソート
  - 同一校舎の再訪問時にキャッシュ即時表示（バックグラウンド更新）
- [x] **①生徒一覧スライサー** を「学校/コース」「学年/文理」の複合チップ方式に変更（得点一覧と同仕様）
- [x] 管理画面をフレックスレイアウトに変更（ヘッダー固定・コンテンツのみスクロール）
- [x] ユーザー入力画面をフレックスレイアウトに変更（ヘッダー固定・main のみスクロール）
- [x] 校舎切り替え・初回ロード時にローディングオーバーレイを追加
- [x] 並び替え機能ボタンを非表示化（Issue #021: 動作不具合のため暫定対処）

### スキーマ移行・コード整理（完了 2026-05-29）
- [x] `_CHILD_SHEET_DEFS` 定数を新設し `_createChildSheets` / `reconcileChildSchemas` を統一
- [x] `exam_patterns` に `term_test_id` 列を追加（`_createChildSheets` / `reconcileChildSchemas`）
- [x] `scores_data` の `raw_subject_name` / `genre_name` をスキーマ定義から除外（reconcile 時に自動削除）
- [x] `migrateToCurrentSchema(cramId)` 新設（単一校舎の一括移行）
- [x] `migrateAllChildSchemas()` 新設（全校舎への一括適用）
- [x] `reconcileChildSchemas` に `config` シートの存在確認・余剰列削除を追加
- [x] `setupAdminSS` に親 SS の全シートの reconcile を追加（`term_tests_master` / `genres_master` / `subjects_master` / `school_subject_aliases` / `school_term_test_settings` / `bug_reports`）
- [x] `line_student_import` を reconcile 対象外とし、存在しない場合のみ空シート作成
- [x] `subjects_master` から `default` 列を廃止（`setupAdminSS` / `spreadsheet-schema.md`）
- [x] `_setDefaultSubjectsForPatterns` 関数を削除（デッドコード）
- [x] `_autoCreateExamPatterns` 内の `patternInfosForDefault` を削除（デッドコード）
- [x] `migratePatternSchema` を削除（旧設計の移行関数・現スキーマと矛盾）
- [x] `shareBranchSS` を GAS / HTML 両方から削除（未使用）

### 管理画面 UI/UX 改善（完了 2026-05-30）
- [x] ナビゲーションバーに「トップ」タブを追加（ダッシュボードへ直感的に戻れるように）
- [x] 「生徒入力画面デモ」を完全再現モードに刷新
  - 旧実装（`admin_logic_demo.html` 独自描画モーダル）を廃止
  - GASサーバーに `?demo=1&type=...` デモモードを追加（`demoData.js` 新規）
  - 実際の生徒アプリを別タブで開き、架空データを注入する方式に変更
  - デモ時はオレンジバナーを表示、保存・コース設定・不具合報告の GAS 呼び出しをスキップ
  - GAS の `admin_getData.js` → `masterData.gasWebAppUrl` を追加（`window.location.href` は googleusercontent.com になるため使用不可）

---

## Phase 5 — UX強化・管理機能拡張（完了 2026-05-31）

### 生徒アプリ UI 改修
- [x] フッターメニュー4タブ化（得点入力 / 成績表画像 / お知らせ / メニュー）
  - ヘッダーのベルアイコンをフッター「お知らせ」タブに移設
  - ハンバーガーメニュー（「メニュー」ラベル）を追加、プルアップパネルに不具合報告
- [x] 未保存変更のフローティングバー（ダーティバー）
  - 1箇所でも入力変更があると画面下部に「入力が終わったら必ず保存してください」バー出現
  - 「取り消す」で全タブの入力を編集前に戻す
  - 「保存する」で現在タブを保存
- [x] 得点バリデーション改修: 合計ジャンルは 0〜2000 に緩和（他は 0〜200 を維持）
- [x] スマホ（Android）対応改善
  - `viewport-fit=cover` 追加（`env(safe-area-inset-bottom)` が正しく機能）
  - ボトムナビ高さ 58px → 64px、`padding-bottom: max(env(...), 28px)` でジェスチャーバー対策
  - メニューパネルを `bottom: max(env(...), 28px)` でジェスチャーバーの上に配置

### お知らせ機能拡充
- [x] カード折りたたみ: 初期表示はタイトルのみ、タップで本文・日付を展開（シェブロン ▼/▲）
- [x] 重要お知らせ（`category='important'`）の自動展開: 初回起動時にパネルが開き展開
- [x] 「次回から表示しない」チェックボックス: LocalStorage で dismissed 管理

### 管理画面 機能追加
- [x] **お知らせ管理タブ**（master のみ）を新設（masterTabs 最左に追加）
  - `getAdminAnnouncements()` / `addAnnouncement()` / `updateAnnouncement()` / `deleteAnnouncement()` を `admin_getData.js` に追加
  - 一覧表示（本文プレビュー・状態バッジ）・インライン編集フォーム・削除
- [x] **生徒一覧** 改善
  - 状態表示テキスト: 「有効」→「在席」、「無効」→「退塾」
  - 検索機能追加（氏名・読み・学校名でリアルタイムフィルタ）
  - IME対応（composition フラグ方式でローマ字入力が正常化）
- [x] **得点一覧** 改善
  - 検索機能追加（氏名・読み・学校名、IME対応）
  - 「成績表」列追加（写真提出済みの生徒に ✔ 表示）
  - 編集モーダル刷新: 行クリックで全科目一括編集モーダルを開く
    - 左列: 科目（ジャンル別セクション）× 得点/順位/欠試、科目変更ドロップダウン（学年・ジャンルフィルタ）
    - 右列: 成績表画像サムネイル（クリックで拡大、左列は常時編集可能）
  - `changeScoreSubject()` 追加（スコアレコードの subject_id を直接更新）
- [x] **生徒インポート** 改修
  - `school_course` / `sub_course` を上書きしない（既存値を保持）
  - インポートにない管理番号を `is_active=false`（退塾）に自動設定
  - テスト追加（16テスト、全PASS）

### バージョン管理
- [x] アプリバージョン `0.1.0`、GASビルド番号 `v1` を `main.js` 定数で管理
- [x] 管理画面タイトルバー右上に `0.1.0 (build 1)` を表示
- [x] 生徒アプリのメニューパネル下部に `0.1.0 (build 1)` を表示
- [x] `package.json` に `"version": "0.1.0"` を追加

### その他（バックログ）
- [ ] 得点シート・過去成績の表示機能（[backlog.md](backlog.md) 参照）
- [ ] 生徒入力による表記ゆれ対応・パターン統合機能（[backlog.md](backlog.md) 参照）
- [ ] 教科ごとの満点設定・バリデーション強化（[backlog.md](backlog.md) 参照）

---

## 開発基盤

- [x] ファイル階層化: GAS ソースを `src/`、Jest テストを `tests/unit/`、GAS テストを `tests/` に整理
- [x] 環境分離: `.clasp.dev.json`（開発環境）/ `.clasp.json`（本番、git 管理外）
- [x] テスト用 push スクリプト: `push-test.ps1`（`src/` + `tests/` を GAS テスト環境へ）
- [x] Node.js + Jest ユニットテスト導入（`npm test`）: 85 テスト・8スイート、全 PASS（2026-05-28時点）
- [x] **src/ ファイル整理**（2026-05-22）
  - `admin_saveData.js`（760行）を3分割: `admin_save_exams.js` / `admin_save_master.js` / `admin_save_students.js`
  - `common_stylesheet.html` を共通スタイルのみに絞り込み、生徒アプリ専用の `app_stylesheet.html` を新設
