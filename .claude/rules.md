# 設計原則・コーディングルール

## GAS の LockService

書き込み関数はすべて `LockService.getScriptLock()` を **try の外** で宣言する。
`try` 内に書くと `finally` でスコープ外エラーになる。

```javascript
function updateExamData(payload) {
  const lock = LockService.getScriptLock(); // ← try の外
  try {
    lock.waitLock(10000);
    // ...
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock(); // ← lock は必ずここで参照できる
  }
}
```

## onclick 属性への文字列埋め込みを禁止

学校名などに特殊文字が含まれる可能性があるため、`admin_logic_exams.html` と `admin_logic_patterns.html` では
`_store[]` / `_patStore[]` に数値インデックスでデータを格納し、onclick には数値のみ渡す。

```javascript
// NG
html += `<button onclick="edit('${schoolName}')">`;

// OK
const idx = _store.push({ schoolName }) - 1;
html += `<button onclick="edit(${idx})">`;
```

## GAS の日付型

シートから読んだ Date 型は `stringifyDates()` で文字列変換してからフロントに渡す。
フロントに生の Date オブジェクトを渡すと JSON シリアライズで壊れる。

## getRowsData() の使い方

1行目をヘッダーとして使い `{列名: 値}[]` の配列を返す。
シートのヘッダー名とコードのキー名を一致させること。

## appsscript.json の oauthScopes を明示してはいけない

`oauthScopes` を書いてデプロイすると、スコープ要件がデプロイに焼き付いて
SpreadsheetApp 系の呼び出しが権限エラーになる。GAS の自動スコープ検出に任せること。

## スコープ変更後は完全新規デプロイが必要

`appsscript.json` のスコープや `webapp` 設定を変えた後は「新バージョン」ではなく
**完全に新しいデプロイ**を作成する。既存デプロイのバージョン更新では反映されない。

## clasp push 後は必ず新バージョンのデプロイが必要

`clasp push` はコードをスクリプトエディタの HEAD に送るだけ。
`/exec`（公開 URL）は**デプロイ済みのバージョン**を実行するため、push しただけでは反映されない。

```
正しい手順:
  1. clasp push --project .clasp.dev.json
  2. GAS エディタ → デプロイ → デプロイを管理 → 鉛筆アイコン
  3. バージョン: 「新しいバージョン」を選択 → デプロイ
```

`/dev` URL は常に HEAD を実行するため、開発中の動作確認には `/dev` を使う。

## USER_ACCESSING は使わない

`executeAs: USER_ACCESSING` にすると `SpreadsheetApp.getActiveSpreadsheet()` が
try-catch で捕捉不可能な権限エラーを投げるケースがある（GAS の内部仕様）。
認証は `executeAs: USER_DEPLOYING` + アクセス設定「ログインが必要」+ `Session.getActiveUser()` で行う。

## GAS の HtmlService: テンプレートリテラル内に `style=` を書かない

`<script>` ブロック内のテンプレートリテラルに `style="..."` 属性が含まれると、
GAS の `userCodeAppPanel` が特定の行位置で `Unexpected identifier 'style'` SyntaxError を起こす。
HTML 生成コードはテンプレートリテラルを避けて **文字列連結（`+`）** で書き、
インラインスタイルは CSS クラスに置き換えること。

```javascript
// NG（SyntaxError の原因になりうる）
html += `<tr style="background:#fffde7;">`;

// OK
html += '<tr class="tr-editing">';
// → admin_stylesheet.html に .tr-editing { background: #fffde7; } を追加
```

## xlsx 解析は SheetJS（ブラウザ側）で行う

GAS サーバーサイドで xlsx を扱うには Drive API の OAuth スコープが必要で、
デプロイ経由では認可ダイアログが出ないケースがある。
ブラウザ側で **SheetJS CDN** を使って解析し、行データ（2次元配列）を GAS に送ると
Drive API が不要になり安定する。

```html
<!-- admin_logic_import.html の先頭に追加 -->
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
```

```javascript
var workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
google.script.run.importStudentData(cramId, rows); // 解析済み配列を送信
```

## `clasp push` 後は GAS エディタで新バージョンを作成する

`clasp push` はコードを GAS エディタ（HEAD）に反映するだけで、
**バージョン固定のデプロイには自動的に反映されない**。
コードを本番反映するには毎回 GAS エディタから操作が必要。

> GAS エディタ → デプロイ → デプロイを管理 → 鉛筆アイコン → 「新しいバージョン」を選択 → デプロイ

対象デプロイ: 生徒用（ANYONE_ANONYMOUS）と管理者用（ANYONE）の両方。

## GAS の `<a>` タグは 1 行に収める

テンプレートリテラルやHTML文字列内の `<a href="...">` タグを複数行に分けると、
GAS HtmlService が改行・スペースを href に含める場合がある。
`<a>` タグの属性はすべて 1 行で記述すること。

## GAS webapp 内で `window.location.href` によるページ遷移はしない

GAS webapp はコンテンツを `googleusercontent.com` のサブドメインで配信するため、
`window.location.href = scriptUrl` で `script.google.com` へ遷移しようとしても
同一オリジンポリシーの都合でページが空白になる（`doGet` が再実行されない）。

代わりに `google.script.run` でサーバー側に HTML 文字列を生成させ、
`document.open(); document.write(html); document.close();` で書き換える。

```javascript
// NG: 画面が空白になる
window.location.href = 'https://script.google.com/macros/s/.../exec?page=xxx';

// OK: サーバーで HTML を生成して書き換え
google.script.run
  .withSuccessHandler(function(html) {
    document.open(); document.write(html); document.close();
  })
  .getStudentAppHtml(userId);
```

## HtmlTemplate への JSON 埋め込みは split/join でエスケープする

`JSON.stringify()` の結果には `<`・`>` が含まれることがある（`</script>` で JS が途切れる）。
また正規表現リテラル内に U+2028 / U+2029（行区切り文字）が混入すると
`SyntaxError: Invalid regular expression: missing /` が発生する。

`split('<').join(...)` の代替を使い、`<` と `>` を必ずエスケープすること。

```javascript
// 正しい実装
tmpl.appData = JSON.stringify(data)
  .split('<').join('\\u003c')
  .split('>').join('\\u003e');
```

## `autofocus` 属性は cross-origin subframe では使わない

GAS webapp は `googleusercontent.com` の iframe 内で動作する場合があり、
その場合 `<input autofocus>` が "Blocked autofocusing on a `<input>` element in a cross-origin subframe"
というコンソールエラーを出す（動作はするが警告が出続ける）。

GAS webapp 内のフォームには `autofocus` 属性を使わないこと。
