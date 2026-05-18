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

## USER_ACCESSING は使わない

`executeAs: USER_ACCESSING` にすると `SpreadsheetApp.getActiveSpreadsheet()` が
try-catch で捕捉不可能な権限エラーを投げるケースがある（GAS の内部仕様）。
認証は `executeAs: USER_DEPLOYING` + アクセス設定「ログインが必要」+ `Session.getActiveUser()` で行う。
