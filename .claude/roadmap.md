# 開発ロードマップ

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

- [x] **2-A**: `admin_branch.js` 新規作成（`getChildSS` / `getBranches` / `addBranch` / `updateBranch`）
- [x] **2-A**: `setupAdminSS()` に `branches` シート作成を追加
- [x] **2-A**: `getAdminInitialData()` に master 向け branches 一覧を追加
- [x] **2-B**: `admin_logic_branches.html` の実装（校舎一覧・追加・編集 UI）
- [x] **2-C**: `setupBranchSS()` 実装（子 SS のシート自動作成・校舎管理者への自動共有）
- [x] **2-D**: 管理画面フロントエンドの cramId 引数渡し対応（exams / patterns / branches）
- [x] **2-E**: 生徒データインポート機能（xlsx → 子 SS の students_master / students_branch に Upsert）
  - xlsx 解析を SheetJS（ブラウザ側 CDN）で行い Drive API 不要とした
- [x] **2-F**: `getData.js` / `saveData.js` の子 SS ルーティング対応
  - 親 SS の `student_index`（student_id / line_user_id / cram_id）でルーティング
  - `linkLineIds()`: 外部 SS の「内部生」シートから LINE ID を取り込み student_index を更新
  - `migrateStudentsFromParentSS()`: 旧・親 SS の students_master から子 SS への一括移行ユーティリティ

**Phase 2 で判明した GAS の制約（→ `.claude/rules.md` に追記済み）**
- GAS テンプレートリテラル内の `style=` が userCodeAppPanel の特定行で SyntaxError を引き起こす
- Drive API は `appsscript.json` のスコープ宣言だけでは動作しない（OAuth 再認可が必要）
- `clasp push` は GAS エディタのコードを更新するが、バージョン固定デプロイには反映されない

## Phase 3 — 生徒向け機能拡張（未着手）
- [ ] 得点シート表示機能の改善

## バックログ（優先度未定）
→ `.claude/backlog.md` 参照
