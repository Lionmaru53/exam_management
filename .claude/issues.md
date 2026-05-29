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
- **場所**: `admin_logic_branches.html` → 内部テンプレートリテラルのインライン `style=` 属性
- **症状**: ページ読み込み直後に `Uncaught SyntaxError: Unexpected identifier 'style'` が発生し、`window.renderBranchManager is not a function` が連鎖。校舎管理タブが表示されない。
- **原因**: GAS の `userCodeAppPanel` が JS ファイルのコンテンツを特定行で処理する際、テンプレートリテラル内の `style=` を JS 識別子として解釈して SyntaxError を起こす。行位置依存（4行削除すると 84→80 に正確に移動することで確認）。
- **対処**: `admin_logic_branches.html` の HTML 生成コードをテンプレートリテラルから文字列連結（`+`）に全面書き換え、すべての `style=` 属性を CSS クラスに置換。対応クラスを `admin_stylesheet.html` に追加。
- **教訓**: GAS webapp では `<script>` 内のテンプレートリテラルに `style=` が含まれると特定行で SyntaxError が起きる。HTML 生成はテンプレートリテラルを避けて文字列連結か CSS クラスで管理すること。

### [fixed] #006 `Drive.Files.insert()` の OAuth 権限エラー（xlsx インポート実装）
- **場所**: `admin_import.js`（当初の xlsx インポート実装）
- **症状**: `drive.files.insert を呼び出す権限がありません` エラー。`appsscript.json` に Drive API の Advanced Service と oauthScopes を追加しても解消しなかった。
- **原因**: Drive API の OAuth 認可は `appsscript.json` のスコープ宣言だけでは取得できず、GAS エディタでの手動認可フローが必要。管理者デプロイ経由では再認可ダイアログが表示されないケースがある。
- **対処**: Drive API を使用する設計を廃止。xlsx 解析をブラウザ側の **SheetJS**（CDN）で行い、解析済みの行データ（2次元配列）を GAS に渡す方式に変更。Drive API・OAuth スコープ問題が完全になくなった。
- **教訓**: GAS で xlsx を扱う場合は Drive API よりブラウザ側 SheetJS が安定。Drive API が必要な場合は GAS エディタからの手動実行で事前認可が必要。

### [fixed] #007 `clasp push` 後も生徒向け GAS が古いコードで動作する
- **場所**: 生徒向け GAS デプロイ（`ANYONE_ANONYMOUS`）
- **症状**: `clasp push` でコードを更新したのに、LINE からアクセスすると旧コードの挙動（`students_master` を親 SS から直接読む）のままだった。GAS エディタでも `getData.js` の更新日が古い日付のままに見えた（実際には main ブランチの古いコードを参照していた）。
- **原因**: GAS の Web アプリデプロイは「バージョン固定」の場合、`clasp push` でコードを更新してもデプロイには反映されない。新しいバージョンを作成してデプロイを更新する必要がある。また、git の `main` ブランチ（未マージ）を参照していたため、エディタのコードが古く見えた。
- **対処**: GAS エディタ → デプロイを管理 → 編集 → 「新しいバージョン」を選択して更新。
- **教訓**: `clasp push` はコードを GAS エディタに上げるだけ。本番デプロイへの反映は GAS エディタで「新バージョン」の作成が必要。→ `rules.md` に追記。

### [fixed] #008 Phase 2-F 移行後、LINE アクセスで「生徒未登録」になる
- **場所**: `getData.js` → `student_index` 参照
- **症状**: 旧・親 SS の `students_master` にデータがあると LINE で表示できるが、削除すると「生徒未登録」になる。`student_index` に手動でデータを入れても解消しなかった（#007 の影響で旧コードが動いていたため）。
- **原因**: ① `clasp push` 後のデプロイ更新漏れ（#007）により旧コードが動作していた。② 旧データが親 SS の `students_master` にあり、子 SS・`student_index` への移行が未実施だった。
- **対処**: ① GAS デプロイを新バージョンに更新。② `migrateStudentsFromParentSS()`（`admin_import.js`）を GAS エディタから手動実行し、旧データを子 SS と `student_index` に移行。

### [fixed] #009 `shareBranchSS()` で DriveApp 権限エラー（appsscript.json の oauthScopes 不足）
- **場所**: `src/appsscript.json` → `oauthScopes`
- **症状**: 「指定された権限では DriveApp.getFileById を呼び出すことができません。必要な権限: ...auth/drive」エラー。副作用として「A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received」がブラウザコンソールに出る。
- **原因**: `oauthScopes` に `https://www.googleapis.com/auth/spreadsheets` と `script.container.ui` のみ明示していたため、GAS がその2スコープしか認可しない。`DriveApp.getFileById().addEditor()` は `auth/drive` スコープが必要だが含まれていなかった。
- **対処（1/2）**: `appsscript.json` から `oauthScopes` フィールドを削除し、GAS のスコープ自動検出に委ねる（`setup.md` の方針と一致）。自動検出では `DriveApp` の使用を検出して `auth/drive` が自動的にスコープに含まれる。
- **対処（2/2）**: `appsscript.json` の `enabledAdvancedServices` から Drive v2 エントリを削除（→ #010 参照）。
- **再認可が必要**: `clasp push` 後、GAS エディタで任意の関数を実行するか新しいデプロイを作成して再認可ダイアログに応じる。
- **コンソールエラーの補足**: 「message channel closed」はサーバー側エラーによる `google.script.run` の接続切断が原因。DriveApp エラーが解消されれば消える。
- **#003 との関係**: #003 の「GAS エディタから手動実行で認可を取得」という暫定対処では、新しい認証トークンが発行されても webapp 側のスコープが不足したままになるため根本解決にはなっていなかった。

### [fixed] #010 `shareBranchSS()` 実行時「Drive API の有効化中に権限が拒否されました」エラー（Cloud プロジェクト側の Drive API 未有効化）
- **場所**: GAS の Cloud プロジェクト設定 / `src/appsscript.json` → `enabledAdvancedServices`
- **症状**: 管理画面「共有設定」クリック時に「プロジェクト XXXXXX への API（drive）の有効化中に権限が拒否されました」エラー。
- **原因（1）**: `enabledAdvancedServices` に Drive v2（REST API）が記載されていたため、clasp が Cloud プロジェクトで Drive API を有効化しようとした（clasp push 時）。コードが使っているのは `DriveApp`（GAS 組み込みクラス）であり、Drive Advanced Service（REST API）は不使用。
- **原因（2）**: GAS の Cloud プロジェクトで Google Drive API が有効化されていなかった。`DriveApp` の実行には Cloud プロジェクトで Drive API が有効である必要がある。Google Workspace 環境や特定の制限下では GAS の自動有効化が失敗するため、手動有効化が必要。
- **対処（1）**: `appsscript.json` の `enabledAdvancedServices` から Drive v2 エントリを削除。
- **対処（2）**: Cloud Console（console.cloud.google.com）でプロジェクトを選択 → 「API とサービス」→「API とサービスを有効にする」→「Google Drive API」を検索 → 有効にする。
- **教訓**: `DriveApp` を使う GAS プロジェクトでは、初回セットアップ時に Cloud Console で Google Drive API を手動有効化する必要がある環境がある（setup.md に手順を追記）。

---

### [fixed] #011 ファイルアップロード機能追加コミットで LIFF 画面が破壊された
- **場所**: `src/` 全体（commit `6364ce9`）
- **症状**: `userCodeAppPanel:220 Uncaught SyntaxError: Invalid or unexpected token` / `renderApp is not defined` が発生し LIFF 画面が表示されない。
- **原因**: ファイルアップロード機能追加コードに含まれる不正なトークンが GAS パーサーエラーを引き起こした（詳細は未特定）。
- **対処**: `git revert 6364ce9`（commit `266d178`）でロールバック後、stash の差分を統合（commit `bcdcbff`）で解消。

### [fixed] #012 HtmlTemplate への JSON 埋め込みで `SyntaxError: Invalid regular expression: missing /`
- **場所**: `src/main.js` → `doGet()` の `tmpl.appData` セット
- **症状**: LIFF 画面表示時に `SyntaxError: Invalid regular expression: missing /` が発生。
- **原因**: `JSON.stringify()` の出力に U+2028 / U+2029（Unicode 行区切り文字）が混入し、正規表現リテラルの途中で改行扱いになった。また `</script>` 文字列がHTMLパーサーに誤解釈されるリスクもあった。
- **対処**: `split('<').join('\\u003c').split('>').join('\\u003e')` に変更。正規表現の代替（副作用なし）。
- **教訓**: GAS HtmlTemplate に JSON を埋め込む際は `<` と `>` を必ずエスケープする。→ `rules.md` に追記。

### [fixed] #013 開発者モードで `window.location.href` 遷移後に画面が空白
- **場所**: `src/main.js` → `_devInputPage()` 内の `go()` 関数
- **症状**: userId を入力して「表示」ボタンを押すと画面が空白になる（LIFF 画面が表示されない）。
- **原因**: GAS webapp は `googleusercontent.com` サブドメインで配信されるため、`window.location.href` で `script.google.com` 側の URL に遷移しても `doGet` は再実行されない。同一オリジン外への遷移は iframe 内では無効になる。
- **対処**: `google.script.run.getStudentAppHtml(uid)` でサーバー側に HTML を生成させ、`document.open(); document.write(html); document.close();` でページを書き換える方式に変更。
- **教訓**: GAS webapp 内では `window.location.href` によるページ遷移は使わない。→ `rules.md` に追記。

### [fixed] #014 `autofocus` 属性で cross-origin subframe エラー
- **場所**: `src/main.js` → `_devInputPage()` の入力フォーム
- **症状**: "Blocked autofocusing on a `<input>` element in a cross-origin subframe" がコンソールに出続ける。
- **原因**: GAS webapp が `googleusercontent.com` の iframe 内で動作するため、`autofocus` 属性がブラウザのセキュリティポリシーでブロックされる。
- **対処**: `autofocus` 属性を削除。
- **教訓**: GAS webapp 内のフォームには `autofocus` を使わない。→ `rules.md` に追記。

### [fixed] #015 同一秒内に `_autoCreateExamPatterns` を複数回呼ぶと pattern_id が衝突する
- **場所**: `src/admin_getData.js` → `upsertSchoolCourse()`
- **症状**: 文系・理系・高1 の3パターンを生成しようとすると、タイムスタンプベースの ID が同一になり重複 pattern_id が発生する。
- **原因**: `_autoCreateExamPatterns()` を3回呼ぶと、各呼び出しで `Utilities.formatDate(new Date(), ...)` が同じ秒を返し、`idx` もそれぞれ 1 からリセットされるため ID が重複する。
- **対処**: `_autoCreateAllPatterns()` を新設し、5組み合わせ（高1/'', 高2/文系, 高2/理系, 高3/文系, 高3/理系）を1パスで生成。idx を通し番号にして衝突を排除。
- **教訓**: 同一 GAS 実行内で ID をタイムスタンプベースで複数生成する場合は必ず連番サフィックスを通し番号で付与する。

### [fixed] #016 管理画面の教科パターン管理で文系・理系グループが表示されない
- **場所**: `src/admin_logic_patterns.html` → `renderPatternManager()`
- **症状**: `school_course_master` にコースを追加しても、教科パターン管理の UI に文系・理系のグループが表示されない。
- **原因**: `groupKeySet` を既存の `exam_patterns` の sub_course 一覧から構築していたため、パターンが存在しないと表示もされない循環依存になっていた。
- **対処**: `groupKeySet` の初期構築を `schoolSettings`（school_course_master）ベースに変更し、常に標準5組み合わせを生成してから実際のパターンを追加する方式に変更。

### [fixed] #017 教科パターン管理クロス表で全教科が「英語」列に集中して表示される
- **場所**: `src/admin_logic_patterns.html` → `.pt-cell` CSS クラス
- **症状**: クロス表の全ジャンル列に `<td class="pt-cell">` が存在するにもかかわらず、すべての教科チップが「英語」列のセルにしか表示されない。DevTools では他の列の td.pt-cell が英語列位置にスタックして見える。
- **原因**: `.pt-cell { display: flex; }` を `<td>` 要素に直接適用したことで、ブラウザが `<td>` を `display: table-cell`（テーブルセル）ではなく `display: block` として扱い、table formatting context から外れた。その結果、全ての `<td class="pt-cell">` が最初のジャンル列（英語）の位置にブロック要素として縦積みされた。
- **対処**: `_ptRenderCell()` の `<td>` 内に `<div class="pt-cell-inner">` ラッパーを追加し、`display: flex` は `<td>` ではなく `<div>` に適用するよう変更。`<td>` 自体は `display: table-cell` のままになる。
- **教訓**: `display: flex` を `<td>` / `<th>` など table 系要素に直接適用してはいけない。flex が必要な場合は td 内の div に適用する。→ memory/feedback_flex_on_td.md に保存済み。

### [fixed] #018 `/exec` URL にアクセスするとdevモードページが表示される
- **場所**: `src/main.js` → `doGet()`
- **症状**: 本番 `/exec` URL にパラメータなしでアクセスすると、「LINEアプリからアクセスしてください」ではなく開発者モードページが表示される。
- **原因**: `Session.getActiveUser().getEmail()` が `/exec` 実行時にもオーナーのメールアドレスを返すため、`devEmail` が truthy になり dev モード分岐に入っていた。
- **対処**: `?mode=dev` パラメータが明示された場合のみ dev モードページを返すよう変更。開発者は `/dev?mode=dev` でアクセスする。

### [fixed] #019 `updateStudentField` で `activeTermTests` が grades として誤渡し
- **場所**: `src/admin_save_students.js` → `updateStudentField()` 内 `_autoCreateExamPatterns` 呼び出し
- **症状**: 文理を設定しても exam_patterns が正しい学年（高2・高3）で生成されず、試験IDが grade 列に書き込まれる。
- **原因**: `_autoCreateExamPatterns(ss, sn, sc, subCourse, activeTermTests, ['高2', '高3'])` と6引数で呼んでいたため、5番目の引数 `grades` に試験ID配列 `activeTermTests` が入っていた（6番目の `['高2', '高3']` は無視）。
- **対処**: `_autoCreateExamPatterns(ss, sn, sc, subCourse, ['高2', '高3'])` に修正。`activeTermTests.length > 0` のガードは維持。

### [fixed] #020 生徒一覧スライサークリックで `Uncaught SyntaxError: Unexpected end of input`
- **場所**: `src/admin_logic_students.html` → `_stRerender()` 内スライサーボタン生成
- **症状**: 学校・学年スライサーチップをクリックすると `Uncaught SyntaxError: Unexpected end of input` が発生し、フィルターが動作しない。
- **原因**: `onclick="_stToggleSchoolFilter(' + JSON.stringify(s) + ')"` で生成した HTML が `onclick="_stToggleSchoolFilter("高校A")"` になり、ダブルクォートが onclick 属性を途中で閉じるため `_stToggleSchoolFilter(` だけが実行式として残っていた。
- **対処**: 値を `data-school` / `data-grade` 属性に格納し、onclick では `this.dataset.school` / `this.dataset.grade` で読み取るよう変更。コース追加ボタンの同問題も合わせて修正。
- **教訓**: HTML 属性内の onclick に文字列を直接埋め込む場合は `JSON.stringify` を使わず `data-*` 属性経由にする。

## open

### [open] #021 ユーザー入力画面の科目・教科の並び替え（ドラッグ）が動作しない
- **場所**: `src/logic_ui_action.html` → `_onDragStart` / `_onDragMove` / `_onDragEnd`
- **症状**: 並び替えモードをONにしてドラッグハンドルを操作しても、科目・教科の順序が変わらない。
- **推定原因（未調査）**: `_onDragMove` が `document.elementFromPoint(touch.clientX, touch.clientY)` でドロップ先要素を特定しているが、`#subject-list` が `overflow-y: auto` のスクロールコンテナになった際に hit-test が正しく機能しない可能性がある。または、ゴースト要素（`drag-ghost`）の `position: fixed` がスクロールコンテナのスタッキングコンテキストと干渉している可能性がある。
- **関連**: フレックスレイアウト導入（2026-05-29）以前から不具合が存在していた可能性もある。再現手順・ブラウザ確認が先決。
- **暫定対処**: `.reorder-toggle-wrap { display: none; }` で UI を非表示化（2026-05-29）
- **根本対処**: 未実施（調査待ち）

---

## 技術的負債・将来対応メモ（Issue 化候補）

- `getData.js` の `getSubjectsForEdit` 関数は UI から未使用（削除候補）
- 合計 genre（genre_id='to'）への「タップして科目を追加」は非表示だが、✎ボタン（置換）は表示される。将来的に合計科目の追加を管理者のみに制限することを検討

---

## 運用メモ

- 新しい Issue が発覚したら「原因」「対処（または暫定対応）」とともにここに追記する
- `clasp push` → GAS エディタで新バージョン作成 → HEAD でテスト → 修正確認 → `fixed` に移動する流れで管理する
