# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

塾生の定期試験の得点・順位を管理するシステム。  
Google Apps Script (GAS) + Google スプレッドシート構成。生徒は LINE / LIFF、管理者は Web 管理画面を使用。

**詳細ドキュメント（必要に応じて参照）**
- [アーキテクチャ・ファイル構成](.claude/architecture.md)
- [設計原則・コーディングルール](.claude/rules.md)
- [環境構築・デプロイ手順](.claude/setup.md)
- [開発ロードマップ](.claude/roadmap.md)
- [テスト戦略・手順](.claude/testing.md)
- [やりたいことリスト（バックログ）](.claude/backlog.md)
- [既知の Issue](.claude/issues.md)
- [スプレッドシートスキーマ詳細](spreadsheet-schema.md)

---

## コマンド

| 目的 | コマンド |
|------|---------|
| 開発 GAS へ push | `clasp push --project .clasp.dev.json` |
| 本番 GAS へ push | `clasp push` |
| テストコード込み push | `.\push-test.ps1` |
| Jest ユニットテスト（高速） | `npm test` |
| GAS 統合テスト | `push-test.ps1` → GAS エディタで `runAllTests()` |

> **push 後の必須手順**: GAS エディタ → デプロイを管理 → 鉛筆アイコン → 「新しいバージョン」を選択。`/exec` URL はデプロイ済みバージョンを実行するため push だけでは反映されない。開発中の動作確認は `/dev` URL を使う（常に HEAD を実行）。

---

## アーキテクチャ概要

### システム構成

```
LINE アプリ → LIFF エンドポイント（GitHub Pages: docs/）
  └─ LINE userId 取得 → GAS（ANYONE_ANONYMOUS）へ
        └─ 親 SS の student_index で line_user_id → student_id を解決
        └─ branches シートで cram_id → 子 SS を特定
        └─ 子 SS から試験・得点データを取得

管理者（Google アカウント）→ GAS（ANYONE = Google ログイン必須）へ
  └─ Session.getActiveUser() → admin_users シート照合
```

### GAS デプロイ構成（同一プロジェクト・コード共有）

| デプロイ | access | 用途 |
|---------|--------|------|
| 生徒用 | ANYONE_ANONYMOUS（Cloudflare 経由） | LINE 認証・Google 不要 |
| 管理者用 | 全員（ログインが必要） | Google 認証必須 |

同一の `src/` から 2 つのデプロイを作成。`appsscript.json` の `access` は `ANYONE_ANONYMOUS`（生徒用デフォルト）。管理者用デプロイは GAS エディタから手動で `ANYONE` で作成する。

### clasp 設定

| clasp 設定 | push 先 | git 管理 |
|---|---|---|
| `.clasp.dev.json` | 開発 GAS | 管理内 |
| `.clasp.json` | 本番 GAS | **管理外** |

### docs/config.js の管理

`docs/config.js`（`LIFF_ID` / `GAS_URL` を含む）は git 管理外。GitHub Secrets から CI が自動生成。ローカル開発時は `docs/config.example.js` を参考に手動作成。

### スプレッドシート構造

- **親 SS**: `admin_users` / `branches` / `student_index` / `subjects_master` 等のマスターデータ
- **子 SS（校舎ごと）**: `students_master` / `exam_patterns` / `scores_data` 等の校舎別データ
- `student_index`: `line_user_id → student_id` のルーティングテーブル（保護者の LINE ID も登録可）

詳細は [spreadsheet-schema.md](spreadsheet-schema.md) を参照。

---

## GAS 固有の重要ルール

### LockService は try の外で宣言する

```javascript
function updateExamData(payload) {
  const lock = LockService.getScriptLock(); // try の外に書く
  try {
    lock.waitLock(10000);
    // ...
  } finally {
    lock.releaseLock(); // try 内だと finally でスコープ外エラー
  }
}
```

### onclick 属性への文字列埋め込み禁止

学校名等に特殊文字が入りうるため、`_store[]` に数値インデックスで格納し onclick には数値のみ渡す。

```javascript
// NG: html += `<button onclick="edit('${schoolName}')">`;
const idx = _store.push({ schoolName }) - 1;
html += `<button onclick="edit(${idx})">`;
```

### HtmlTemplate への JSON 埋め込みは split/join でエスケープする

```javascript
// U+2028/U+2029 混入と </script> 終端を防ぐ
tmpl.appData = JSON.stringify(data)
  .split('<').join('\\u003c')
  .split('>').join('\\u003e');
```

### GAS webapp 内で window.location.href によるページ遷移はしない

`googleusercontent.com` 上の GAS webapp から `script.google.com` へ `window.location.href` で遷移すると画面が空白になる。代わりに `google.script.run` でサーバーに HTML を生成させ `document.write()` で書き換える。

### テンプレートリテラル内に style= 属性を書かない

`<script>` ブロック内のテンプレートリテラルに `style="..."` が含まれると GAS が `Unexpected identifier 'style'` SyntaxError を起こす。HTML 生成は文字列連結（`+`）で書き、インラインスタイルは CSS クラスに置き換える。

### appsscript.json に oauthScopes を明示してはいけない

書いてデプロイするとスコープ要件が焼き付いて SpreadsheetApp 系が権限エラーになる。GAS の自動スコープ検出に任せる。

### スコープ変更後は完全新規デプロイが必要

`appsscript.json` のスコープや `webapp` 設定を変えた後は「新バージョン」ではなく完全に新しいデプロイを作成する。

### executeAs USER_ACCESSING は使わない

`SpreadsheetApp.getActiveSpreadsheet()` が try-catch で捕捉不可能な権限エラーを投げるケースがある。認証は `executeAs: USER_DEPLOYING` + アクセス設定「ログインが必要」+ `Session.getActiveUser()` で行う。

### その他

- シートから読んだ `Date` 型は `stringifyDates()` で文字列変換してからフロントに渡す
- `<a href="...">` タグの属性はすべて 1 行で記述する（複数行にすると改行がhrefに入る）
- `autofocus` 属性は cross-origin subframe（GAS webapp）では使わない
- xlsx 解析は SheetJS（CDN）でブラウザ側で行い、行データを GAS に送る（Drive API 不要）

---

## 技術スタック

- **バックエンド**: GAS（clasp で push）、`src/` が全ロジック・HTML
- **フロントエンド**: GAS HtmlService（管理画面）/ GitHub Pages（LIFF、`docs/`）
- **DB**: Google スプレッドシート（親 SS + 校舎別子 SS）
- **認証**: `Session.getActiveUser()` + admin_users（管理者）/ LINE LIFF（生徒）
- **テスト**: Jest（`tests/unit/`、GAS API はモック済み）+ GAS 統合テスト（`tests/test_runner.js`）
