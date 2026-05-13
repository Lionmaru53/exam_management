# exam_management — Claude 向けプロジェクトコンテキスト

## プロジェクト概要

塾生の定期試験の得点・順位を管理するシステム。  
Google Apps Script (GAS) + Google スプレッドシートで構成。  
生徒は LINE から自分のデータを閲覧し、管理者は Web 管理画面から試験・教科パターン・日程を管理する。

---

## LIFF 設定の注意点

GAS web app は `/exec` URL から `googleusercontent.com/userCodeAppPanel` へリダイレクトして HTML を配信する。
LIFF はエンドポイント URL と実際の配信 URL を照合するため、**LINE Developers のエンドポイント URL には `/exec` URL ではなく `googleusercontent.com` URL を設定する必要がある**。

```
誤: https://script.google.com/macros/s/{scriptId}/exec
正: https://n-{hash}-script.googleusercontent.com/userCodeAppPanel
```

`n-{hash}` のハッシュはスクリプト ID から生成される固定値で、再デプロイしても変わらない。
変わるのは GAS プロジェクト自体を作り直したときのみ。

---

## 技術スタック

- **バックエンド**: Google Apps Script (GAS) — `.js` / `.html` ファイルを clasp で push
- **フロントエンド**: GAS HtmlService でレンダリング。管理画面は `admin_*.html` / `admin_*.js`、生徒画面は `index.html` など
- **DB**: Google スプレッドシート（各シートがテーブルに対応）
- **外部連携**: LINE Messaging API（生徒の line_user_id で紐付け）
- **デプロイ**: clasp push → GAS 上でウェブアプリとして公開

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
| `admin_getData.js` | 管理者向け: 管理画面の初期データ一括取得 |
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
