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

### [fixed] #004 子SS リンクの URL が壊れる（スペース + `style=` がパスに混入）
- **場所**: `admin_logic_branches.html` → `_renderBranchList()` の `ssDisplay`
- **原因**: テンプレートリテラル内で `<a href="...">` タグを複数行に分けて記述したため、GAS HtmlService の URL 解釈で改行・スペースが href の一部として扱われた。
- **対処**: `<a>` タグを 1 行に集約。GAS で動的生成する HTML の `<a>` タグは属性を改行で分割してはいけない。

## open

### [open] #005 `userCodeAppPanel:84:20` — `Unexpected identifier 'style'` SyntaxError（Cloudflare経由時のみ）
- **場所**: `admin_index.html` → HTML 要素のインライン `style` 属性
- **症状**: ページ読み込み直後に `Uncaught SyntaxError: Unexpected identifier 'style' (at userCodeAppPanel?createOAuthDialog=true:84:20)` が発生。`renderBranchManager is not defined` も連鎖して発生する可能性あり。
- **原因（推定）**: GAS の `userCodeAppPanel` はヘッドを除いた body コンテンツを 75 行のプリアンブルの後に出力する。Phase 2-D で `branch-selector-wrap` div を nav の前に追加したことで nav が body の 9 行目にシフトし、nav の `style="display:none;"` 属性が `userCodeAppPanel` のちょうど 84 行目に来た。GAS の内部 JS 生成処理がその行で `style` を予期しない識別子として扱い SyntaxError を発生させている。
- **対処**: `admin_index.html` の HTML 要素（nav・pattern-modal）から inline `style` 属性を除去し、`admin_stylesheet.html` に `#admin-nav { display: none; }` / `#pattern-modal { display: none; }` を追加して CSS で初期非表示を管理するよう変更。`clasp push` 後に確認が必要。
- **教訓**: GAS webapp では HTML 要素の inline `style` 属性が `userCodeAppPanel` の特定行に来ると SyntaxError を引き起こす。body 構造を変更する場合は inline style を使わず CSS クラス・ID セレクタで管理すること。

---

## 運用メモ

- 新しい Issue が発覚したら「原因」「対処（または暫定対応）」とともにここに追記する
- `clasp push` → HEAD でテスト → 修正確認 → `fixed` に移動する流れで管理する
