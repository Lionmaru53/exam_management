# Issue トラッカー

形式: `[状態] #番号 タイトル` / 原因 / 対処

状態: `open` / `fixed` / `wontfix`

---

## fixed

### [fixed] #001 「＋ 管理者を追加」ボタンが追加フォームを開かず再読み込みになる
- **場所**: `admin_logic_admin_users.html`
- **原因**: `_auStartAdd()` が `renderAdminUserManager()` を呼び出し、その冒頭で `_auAddMode = false` にリセットされてから非同期 API 呼び出しが走るため、フォームが表示されない。
- **対処**: `_auFetchAndRender()`（API込み再描画）と `_auRerender()`（キャッシュのみ再描画）に分離。フォーム開閉は `_auRerender()` を使うよう変更。同じパターンを `admin_logic_branches.html` にも適用。

### [fixed] #002 `setupBranchSS()` で「branches シートが見つかりません」エラー
- **場所**: `admin_branch.js` → `setupBranchSS()` / `addBranch()` / `updateBranch()`
- **原因**: Phase 2-A のコード反映前に `setupAdminSS()` を実行していたため、`branches` シートがメイン SS に存在しない状態でシート操作をしようとした。
- **対処**: `setupBranchSS()` / `addBranch()` / `updateBranch()` の冒頭で `_ensureBranchesSheet()` を呼び、シートが存在しない場合は自動作成するよう変更。

### [fixed] #003 `setupBranchSS()` の DriveApp 権限エラー
- **場所**: `admin_branch.js` → `setupBranchSS()`
- **原因**: `DriveApp.getFileById().addEditor()` は `drive` スコープが必要だが、SS作成後に初めてこのコードが追加されたため既存の認可トークンにスコープが含まれていなかった。
- **対処**: `setupBranchSS()` から共有処理を完全に分離し、独立した `shareBranchSS(cramId)` 関数に移動。UI は子SS作成後に「共有設定」ボタンで個別実行する方式に変更。DriveApp スコープの認可が必要なのは「共有設定」実行時のみ（初回は GAS エディタからの手動実行で認可を取得）。

### [fixed] #004 子SS リンクの URL が壊れる（スペース + `style=` がパスに混入）
- **場所**: `admin_logic_branches.html` → `_renderBranchList()` の `ssDisplay`
- **原因**: テンプレートリテラル内で `<a href="...">` タグを複数行に分けて記述したため、GAS HtmlService の URL 解釈で改行・スペースが href の一部として扱われた。
- **対処**: `<a>` タグを 1 行に集約。GAS で動的生成する HTML の `<a>` タグは属性を改行で分割してはいけない。

### [fixed] #005 `userCodeAppPanel:84:20` — `Unexpected identifier 'style'` SyntaxError
- **場所**: `admin_index.html` → HTML 要素のインライン `style` 属性
- **症状**: ページ読み込み直後に `Uncaught SyntaxError: Unexpected identifier 'style'` が発生。
- **原因（推定）**: GAS の `userCodeAppPanel` のプリアンブル行数と HTML 構造の組み合わせで、nav の `style="display:none;"` 属性が GAS 内部 JS 生成処理の解釈で SyntaxError を引き起こしていた。
- **対処**: `admin_index.html` の HTML 要素（nav・pattern-modal）から inline `style` 属性を除去し、`admin_stylesheet.html` に `#admin-nav { display: none; }` / `#pattern-modal { display: none; }` を追加して CSS で初期非表示を管理。
- **教訓**: GAS webapp では body 構造を変更する際、inline style を使わず CSS クラス・ID セレクタで管理すること。

### [fixed] #006 `shareBranchSS()` で DriveApp 権限エラー（appsscript.json の oauthScopes 不足）
- **場所**: `src/appsscript.json` → `oauthScopes`
- **症状**: 「指定された権限では DriveApp.getFileById を呼び出すことができません」エラー。
- **原因**: `oauthScopes` に `auth/spreadsheets` と `script.container.ui` のみ明示していたため `auth/drive` が含まれていなかった。
- **対処（1/2）**: `appsscript.json` から `oauthScopes` フィールドを削除し、GAS のスコープ自動検出に委ねる。
- **対処（2/2）**: `appsscript.json` の `enabledAdvancedServices` から Drive v2 エントリを削除（→ #007 参照）。
- **再認可が必要**: `clasp push` 後、GAS エディタで任意の関数を実行するか新しいデプロイを作成して再認可ダイアログに応じる。

### [fixed] #007 `shareBranchSS()` 実行時「Drive API の有効化中に権限が拒否されました」エラー
- **場所**: GAS の Cloud プロジェクト設定 / `src/appsscript.json`
- **症状**: 管理画面「共有設定」クリック時に「プロジェクトへの API（drive）の有効化中に権限が拒否されました」エラー。
- **原因（1）**: `enabledAdvancedServices` に Drive v2（REST API）が記載されていたため、clasp が Cloud プロジェクトで Drive API を有効化しようとした。コードが使っているのは `DriveApp`（GAS 組み込みクラス）であり REST API は不使用。
- **原因（2）**: Cloud プロジェクトで Google Drive API が有効化されていなかった。
- **対処（1）**: `appsscript.json` の `enabledAdvancedServices` から Drive v2 エントリを削除。
- **対処（2）**: Cloud Console → 「API とサービス」→「Google Drive API」を有効にする。
- **教訓**: `DriveApp` を使う GAS プロジェクトでは、初回セットアップ時に Cloud Console で Google Drive API を手動有効化する必要がある環境がある（setup.md に手順を追記）。

---

## open

### [open] #008 コンソールに `message channel closed before a response was received` が出る
- **場所**: ブラウザコンソール（Chrome）
- **症状**: `Uncaught (in promise) Error: A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received`
- **優先度**: 低（UI の動作には影響しない情報的な警告）
- **原因**: GAS の `google.script.run` は内部的に Chrome のメッセージパッシング API を使ってクライアント JS とサーバー間を橋渡ししている。このリスナーが「非同期で返答する」と宣言した後、何らかの理由で返答が届かない場合に Chrome が出すログ。具体的なケース：
  - `google.script.run` のサーバー側で例外が発生し返答が届かない
  - GAS の認証セッションが切れた状態でサーバー呼び出しが行われる
  - ページ遷移・再レンダリングが応答より先に走り、リスナーコンテキストが消える
- **このエラー単体では何も壊れない**: 本質的な問題は別のエラー（`withFailureHandler` や GAS 実行ログ）として表れる。
- **調査方法**: GAS エディタ →「実行」タブ でサーバー側エラーを確認するか、`withFailureHandler` で `err.message` をコンソールに出力する。
- **対処方針**: 原則として放置でよい。UI 上の不具合（ローディングが終わらない・データが表示されない）と同時に出ている場合は GAS 実行ログで根本エラーを探す。

---

## 運用メモ

- 新しい Issue が発覚したら「原因」「対処（または暫定対応）」とともにここに追記する
- `clasp push` → `/dev` URL でテスト → 修正確認 → `fixed` に移動する流れで管理する
