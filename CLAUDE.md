# exam_management — Claude 向けプロジェクトコンテキスト

## プロジェクト概要

塾生の定期試験の得点・順位を管理するシステム。  
Google Apps Script (GAS) + Google スプレッドシートで構成。  
生徒は LINE から自分のデータを閲覧し、管理者は Web 管理画面から試験・教科パターン・日程を管理する。

---

## システムフロー（現在の構成）

```
LINE アプリ
  └─→ LIFF エンドポイント（GitHub Pages: docs/index.html）
        └─ LIFF SDK で LINE userId 取得
        └─→ GAS_URL + ?userId=xxx にリダイレクト
              └─→ GAS webapp（生徒データ表示）

管理者
  └─→ GAS_URL + ?page=admin
        └─→ GAS webapp（管理画面）
```

### 各エンドポイントの役割

| エンドポイント | 用途 | 設定場所 |
|---|---|---|
| GitHub Pages URL | LIFF エンドポイント（LINE Developers に登録） | GitHub Pages の URL |
| `GAS_URL + ?userId=...` | 生徒データ表示 | `docs/config.js`（Secrets から自動生成） |
| `GAS_URL + ?page=admin` | 管理画面（Session 認証） | 直接アクセス |

### GitHub Pages のデプロイ

- `docs/` フォルダを GitHub Actions で GitHub Pages にデプロイ（`main` push 時に自動実行）
- `docs/config.js` は git 管理外。GitHub Secrets (`LIFF_ID`, `GAS_URL`) から CI が生成する
- `docs/config.example.js` をローカル開発時の参考テンプレートとして管理

---

## 技術スタック

- **バックエンド**: Google Apps Script (GAS) — `.js` / `.html` ファイルを clasp で push
- **フロントエンド（生徒）**: GitHub Pages (`docs/`) — LIFF 認証ページ。GAS URL へリダイレクトするだけ
- **フロントエンド（管理）**: GAS HtmlService でレンダリング（`admin_*.html`）
- **フロントエンド（生徒データ表示）**: GAS HtmlService でレンダリング（`index_app.html`）
- **DB**: Google スプレッドシート（各シートがテーブルに対応）
- **外部連携**: LINE Messaging API（生徒の line_user_id で紐付け）
- **デプロイ**: GAS は clasp push、GitHub Pages は main push で GitHub Actions が自動デプロイ

---

## 重要な設計原則

### シート分離（2026-05 に移行済み）
- `exam_data` は廃止。`exam_patterns` + `exam_schedule` に分離した
- **`exam_patterns`**: 学校・コース・学年・サブコース・試験区分の安定した対応表（ほぼ変更なし）
- **`exam_schedule`**: 年度付きの試験実施日程。同一パターンの複数年分が蓄積される

### onclick 属性への文字列埋め込みを禁止
学校名などに特殊文字が含まれる可能性があるため、`admin_logic_exams.html` と `admin_logic_patterns.html` では
`_store[]` / `_patStore[]` に数値インデックスでデータを格納し、onclick には数値のみ渡す方式を採用している。

### GAS の LockService
並行書き込みを防ぐため、すべての書き込み関数（`updateExamData`, `addNewPattern` 等）は
`LockService.getScriptLock()` を関数スコープの外 (try の前) で宣言してから `waitLock()` を呼ぶこと。
`const lock` を `try` 内に書くと `finally` でスコープ外エラーになる。

---

## スプレッドシート構造（概要）

詳細は [spreadsheet-schema.md](spreadsheet-schema.md) を参照。

| シート名 | 役割 |
|---------|------|
| `students_master` | 生徒情報（line_user_id で検索） |
| `term_tests_master` | 試験区分マスター（is_two_terms で2/3学期制を区別） |
| `branches` | 校舎一覧（cram_id → 子 SS の spreadsheet_id）※親 SS のみ |
| `exam_patterns` | 学校×コース×学年×sub_course×試験区分 → pattern_id |
| `exam_schedule` | pattern_id × year → exam_id, 開始/終了日 |
| `pattern_subjects` | pattern_id × subject_id の紐付け |
| `subjects_master` | 教科マスター（genre_id → genres_master 参照） |
| `genres_master` | 教科ジャンル（例: 文系, 理系） |
| `scores_data` | 生徒×試験×教科の得点・順位 |
| `【設定】学校・科` | 学校名・学期制フラグ・コース一覧（管理画面が自動作成） |

---

## ファイル構成

### GAS バックエンド
| ファイル | 役割 |
|---------|------|
| `getData.js` | 生徒向け: LINE ID → 試験・得点データ取得 |
| `admin_auth.js` | 管理者認証: `getAdminContext()` / `setupAdminSS()` / admin_users CRUD |
| `admin_getData.js` | 管理者向け: 管理画面の初期データ一括取得 |
| `admin_branch.js` | 校舎管理: `getChildSS()` ルーティング・`addBranch()` / `updateBranch()` |
| `admin_saveData.js` | 管理者向け: 試験・パターン・教科の書き込み |
| `getRowsData.js` | シートを `{列名: 値}` の配列に変換するユーティリティ |
| `saveData.js` | 生徒向け: 得点保存（`saveAllScores`） |
| `appsscript.json` | GAS プロジェクトマニフェスト |

### 管理画面フロントエンド
| ファイル | 役割 |
|---------|------|
| `admin_index.html` | 管理画面エントリーポイント・タブ管理 |
| `admin_logic_exams.html` | 試験日程管理タブのレンダリング・保存ロジック |
| `admin_logic_patterns.html` | 教科パターン管理タブのレンダリング・保存ロジック |
| `admin_stylesheet.html` | 管理画面専用スタイル |

### 共通
| ファイル | 役割 |
|---------|------|
| `common_stylesheet.html` | 共通スタイル |
| `common_showMessage.html` | トースト通知 |

### GitHub Pages（`docs/` フォルダ）
| ファイル | 役割 |
|---------|------|
| `docs/index.html` | LIFF エンドポイント。LINE userId を取得して GAS へリダイレクト |
| `docs/config.js` | `LIFF_ID` と `GAS_URL` を定義（git 管理外・CI が Secrets から生成） |
| `docs/config.example.js` | ローカル開発用テンプレート（git 管理済み） |

---

## clasp セットアップ（別PC・新環境での手順）

1. `npm install -g @google/clasp` で clasp をインストール
2. `clasp login` で Google アカウント認証
3. `.clasp.json.example` をコピーして `.clasp.json` を作成し、`scriptId` を設定
   - scriptId は Google Apps Script のプロジェクトURL から取得（`/projects/{scriptId}/edit`）
4. `clasp push` でファイルをデプロイ

> `.clasp.json` は git 管理外（`.gitignore` で除外済み）。各PCで個別に作成すること。

---

## 現在の開発ブランチ

- `main`: 本番
- `table-view`: 現行開発ブランチ（得点シート表示機能ほか）

---

## 注意事項

- `editingPatternId` は `admin_logic_exams.html` で宣言し、`admin_logic_patterns.html` と共有するグローバル変数
- `getRowsData()` は1行目をヘッダーとして使い、`{列名: 値}` の配列を返す — シートのヘッダー名とコードのキー名を一致させること
- GAS の日付型は `stringifyDates()` で文字列変換してからフロントに渡す
- `scores_data` の `score_id` は保存時に自動生成（`SC` + タイムスタンプ）

---

## 次回セッション開始手順

別 PC や新しいセッションで作業を再開する際は、以下を順番に実行すること。

### 1. GAS セットアップ（未実行の場合のみ）
GAS エディタで `setupAdminSS()` を手動実行 → `branches` シートが親 SS に作成される

### 2. コードのデプロイ
```
clasp push
```

### 3. 動作確認
`GAS_URL + ?page=admin` を開き、管理者アカウントでアクセスできることを確認

### 4. 続きの実装タスク（現在: Phase 2-B）
`admin_logic_branches.html` の校舎管理 UI を実装する。
- 校舎一覧の表示（`getBranches()` を呼ぶ）
- 校舎の追加フォーム（`addBranch(payload)` を呼ぶ）
- 校舎の編集（`updateBranch(payload)` を呼ぶ）
- spreadsheet_id の入力欄（2-C の子SS作成が完成するまでは手動入力）

---

## 開発ロードマップ（進捗）

### Phase 0 — 管理画面基盤（完了 2026-05-17）
- [x] 管理者認証（メール照合・簡易版）
- [x] 管理者管理タブ（admin_users CRUD）
- [x] 共通マスターデータ管理タブ（試験区分・教科ジャンル・教科一覧）
- [x] 校舎管理タブ（プレースホルダー）
- [x] 生徒インポートタブ（プレースホルダー）

### Phase 1 — 認証強化（完了 2026-05-18）
- [x] GAS: `getAdminContext()` を `Session.getActiveUser().getEmail()` ベースに変更
- [x] GAS: 全 API 関数のシグネチャから callerEmail/callerIdToken を削除（引数なし）
- [x] フロント: GIS・ログイン画面・`callerIdToken` を完全削除
- [x] フロント: ページロード時に自動で `refreshMasterData()` を呼び出すよう変更

> **GIS（Google Identity Services）は `script.google.com` を JavaScript オリジンとして登録できないため断念。**
> 代わりに GAS webapp のアクセス設定を「Google アカウントが必要」にし、
> `Session.getActiveUser().getEmail()` でサーバーサイドから確実に認証する方式を採用。

#### デプロイ設定の変更（必須）
GAS エディタ → デプロイ → デプロイを管理 → 編集（鉛筆アイコン）
- 実行ユーザー: **自分**（変更なし）
- アクセスできるユーザー: **全員（ログインが必要）** に変更
→ 新バージョンとして保存してデプロイ

### Phase 2 — 校舎管理・子 SS 連携（作業中 2026-05-18）

**設計方針**: 親 SS（現在の SS）に `branches` シートを追加し cram_id → spreadsheet_id を管理。
子 SS は校舎ごとに1枚。

| シート | 配置先 | 状態 |
|---|---|---|
| `admin_users` / `audit_log` / `branches` | 親 SS | 実装済み |
| `term_tests_master` / `genres_master` / `subjects_master` | 親 SS（全校舎共通） | 現在は親 SS に存在 |
| `exam_patterns` / `exam_schedule` / `pattern_subjects` | 子 SS（校舎固有） | 2-D で移行予定 |
| `students_master` / `scores_data` / `【設定】学校・科` | 子 SS（校舎固有） | 2-D で移行予定 |

- [x] **2-A**: `admin_branch.js` 新規作成（`getChildSS()` / `getBranches()` / `addBranch()` / `updateBranch()`）
- [x] **2-A**: `setupAdminSS()` に `branches` シート作成を追加
- [x] **2-A**: `getAdminInitialData()` に master 向け branches 一覧を追加
- [ ] **2-B**: `admin_logic_branches.html` の実装（校舎一覧・追加・編集 UI）
- [ ] **2-C**: `setupBranchSS()` 実装（子 SS のシート自動作成）
- [ ] **2-D**: データ関数の SS 切り替え対応（`getAdminInitialData(cramId)` 等）

### Phase 3 — 生徒向け機能拡張（未着手）
- [ ] 得点シート表示機能（table-view ブランチで作業中）
