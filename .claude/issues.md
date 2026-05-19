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

---

### [fixed] #003 `setupBranchSS()` の DriveApp 権限エラー
- **場所**: `admin_branch.js` → `setupBranchSS()`
- **原因**: `DriveApp.getFileById().addEditor()` は `drive` スコープが必要だが、SS作成後に初めてこのコードが追加されたため既存の認可トークンにスコープが含まれていなかった。
- **対処**: `setupBranchSS()` から共有処理を完全に分離し、独立した `shareBranchSS(cramId)` 関数に移動。UI は子SS作成後に「共有設定」ボタンで個別実行する方式に変更。DriveApp スコープの認可が必要なのは「共有設定」実行時のみ（初回は GAS エディタからの手動実行で認可を取得）。

### [fixed] #005 `userCodeAppPanel:84:20` — `Unexpected identifier 'style'` SyntaxError
- **場所**: `admin_logic_branches.html` → 内部テンプレートリテラルのインライン `style=` 属性
- **症状**: ページ読み込み直後に `Uncaught SyntaxError: Unexpected identifier 'style'` が発生し、`window.renderBranchManager is not a function` が連鎖。校舎管理タブが表示されない。
- **原因**: GAS の `userCodeAppPanel` が JS ファイルのコンテンツを特定行で処理する際、テンプレートリテラル内の `style=` を JS 識別子として解釈して SyntaxError を起こす。行位置依存（4行削除すると 84→80 に正確に移動することで確認）。
- **対処**: `admin_logic_branches.html` の HTML 生成コードをテンプレートリテラルから文字列連結（`+`）に全面書き換え、すべての `style=` 属性を CSS クラスに置換。対応クラスを `admin_stylesheet.html` に追加。
- **教訓**: GAS webapp では `<script>` 内のテンプレートリテラルに `style=` が含まれると特定行で SyntaxError が起きる。HTML 生成はテンプレートリテラルを避けて文字列連結か CSS クラスで管理すること。

### [fixed] #004 子SS リンクの URL が壊れる（スペース + `style=` がパスに混入）
- **場所**: `admin_logic_branches.html` → `_renderBranchList()` の `ssDisplay`
- **原因**: テンプレートリテラル内で `<a href="...">` タグを複数行に分けて記述したため、GAS HtmlService の URL 解釈で改行・スペースが href の一部として扱われた。
- **対処**: `<a>` タグを 1 行に集約。GAS で動的生成する HTML の `<a>` タグは属性を改行で分割してはいけない。

## open

---

## 運用メモ

- 新しい Issue が発覚したら「原因」「対処（または暫定対応）」とともにここに追記する
- `clasp push` → HEAD でテスト → 修正確認 → `fixed` に移動する流れで管理する
