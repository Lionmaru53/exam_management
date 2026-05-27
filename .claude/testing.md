# テスト戦略・手順

## テスト方針

GAS + スプレッドシート構成のため、従来のユニットテストフレームワークは使えない。
以下の 2 段構えで品質を担保する。

| 種別 | ファイル | 実行方法 |
|------|---------|---------|
| Jest ユニットテスト | `tests/unit/*.test.js` | `npm test` |
| 手動テスト | 本ドキュメント下部の「手動テスト手順」 | ブラウザで実際に操作 |

---

## Jest ユニットテスト（推奨・高速）

```
npm test
```

42 テスト・5 スイート、実行時間 < 1 秒。GAS API は `tests/unit/jest.setup.js` でモック済み。

### テストスイート一覧

| ファイル | 対象モジュール |
|---------|--------------|
| `getRowsData.test.js` | `getRowsData.js` |
| `admin_branch.test.js` | `admin_branch.js` |
| `admin_getData.test.js` | `admin_getData.js` |
| `admin_import.test.js` | `admin_import.js` |
| `admin_auth.test.js` | `admin_auth.js` |
| `admin_dashboard.test.js` | `admin_dashboard.js` |
| `admin_save_students.test.js` | `admin_save_students.js` |
| `admin_save_exams.test.js` | `admin_save_exams.js` |

### ソース読み込み順（`jest.setup.js`）

GAS のグローバルスコープを再現するため、依存順に `require` する:

```js
require('getRowsData.js');   // 依存なし
require('getData.js');       // stringifyDates を定義
require('admin_auth.js');    // getAdminContext, writeAuditLog
require('admin_branch.js');  // getChildSS, _getTargetSS 等
require('admin_import.js');  // _mapRows, _upsertStudentsMaster 等
require('admin_getData.js'); // getAdminInitialData, upsertSchoolCourse 等
```

---

## Jest でテストできないもの（→ 手動テスト）

| 機能 | 理由 |
|------|------|
| `getAdminContext()` | `Session.getActiveUser()` はモック不可 |
| `getChildSS()` | 実際の spreadsheet_id が必要 |
| `setupBranchSS()` | `SpreadsheetApp.create()` は副作用（新SSが作られる） |
| `shareBranchSS()` | DriveApp スコープが必要 |
| `importStudentData()` End-to-End | フロントから xlsx を送るフローが必要 |
| 管理画面の表示・操作 | ブラウザ操作が必要 |
| LIFF 初期設定フロー | LINE LIFF 環境が必要 |

---

## 手動テスト手順

### A. 管理画面ログイン

1. `GAS_URL?page=admin` を開く
2. 自分の Google アカウントでログイン
3. admin_users に登録済みの場合 → 管理画面が表示される（ナビ・校舎セレクター）
4. 未登録アカウントでアクセス → 「アクセス権限がありません」エラーになること

### B. 校舎管理

| 操作 | 期待動作 |
|------|---------|
| 「＋ 校舎を追加」クリック | インラインフォームが開く（ページ遷移なし） |
| cram_id / 校舎名を入力して「追加」 | 一覧に行が追加される |
| 既存 cram_id で追加 | 「既に登録されています」エラーが出る |
| 「編集」→ 校舎名を変更して「保存」 | 一覧の名前が更新される |
| 「子SS作成」クリック | 確認ダイアログ → 子SSが新規作成され行に spreadsheet_id が入る |
| 「共有設定」クリック | 対象校舎の branch_admin に共有されること |
| 「無効化」→「有効化」 | is_active が切り替わり、状態列の表示が変わる |

### C. 生徒インポート（Excel アップロード）

| 操作 | 期待動作 |
|------|---------|
| 正常な xlsx をアップロード | 追加件数・更新件数が表示される |
| 「校舎」列の cram_id が対象校舎と不一致 | その行はスキップされる |
| student_id 列がない xlsx | エラーが返る |
| 同じ student_id を 2回インポート | 2回目は「更新」になり重複しない |
| 既存の line_user_id がある生徒を再インポート | line_user_id が保持される |

### D. 生徒一覧・コース/文理編集

| 操作 | 期待動作 |
|------|---------|
| 「コースを編集」クリック | チェックボックスとコース入力欄が表示される |
| 「文理を編集」クリック | チェックボックスと文系/理系プルダウンが表示される |
| 学年行ヘッダーのチェックボックスをON | その学年の全生徒が一括選択される |
| チェックボックスをONにして「適用」 | 選択した生徒のコース/文理が更新される |
| 文理設定後 | `exam_patterns` に高2・高3の文系/理系パターンが追加されていること |
| 文理設定後 | 新規パターンに `pattern_subjects` のデフォルト教科が設定されていること |

### E. 教科パターン管理

| 操作 | 期待動作 |
|------|---------|
| コースを新規追加後に教科パターン管理を開く | 高1/なし・高2/文系・高2/理系・高3/文系・高3/理系 の5グループが表示される |
| 各グループのパターン行を確認 | `exam_patterns` に5組み合わせ×試験区分数の行が存在する |
| 各グループのパターン行を確認 | `pattern_subjects` にデフォルト教科（各ジャンル最大2教科）が設定されている |
| 「デフォルト初期化」クリック | 未設定の試験区分にパターンが追加され、デフォルト教科が設定される |

### F. 生徒向け得点入力フォーム（通常フロー）

| 操作 | 期待動作 |
|------|---------|
| LIFF にアクセス（コース・文理設定済み） | 試験区分プルダウン＋教科テーブルが表示される |
| 試験区分プルダウンを切り替え | 対応する教科テーブルが表示される |
| 数字以外を入力 | oninput で即時除去される |
| 点数に 201 以上を入力して保存 | 「点数は 0〜200 の整数で…」エラートースト |
| 順位に 0 を入力して保存 | 「1 以上の整数で…」エラートースト |
| 空欄のまま保存 | 空欄は許可（未入力として保存） |

### G. コース未設定フロー（初期設定）

| 操作 | 期待動作 |
|------|---------|
| コース未設定の生徒で LIFF にアクセス | 「科・コースを教えてください」入力画面が表示される |
| 空欄のまま「次へ」 | 「コース名を入力してください」エラーが表示される |
| コース名を入力して「次へ」（高1） | 確認画面が表示される（文理選択はスキップ） |
| コース名を入力して「次へ」（高2/高3） | 文系・理系の選択画面が表示される |
| 文系/理系を選択 | 「○○で設定します」確認画面が表示される |
| 確認画面で「確定」 | 保存後に通常の得点入力画面が表示される |
| 確認画面で「戻る」 | 前の画面に戻る |
| 確定後 | students_master の school_course / sub_course が更新されている |
| 確定後 | exam_patterns に5組み合わせのパターンが生成されている |
| 確定後 | pattern_subjects にデフォルト教科が設定されている |

### H. 文理未設定フロー（高2/高3）

| 操作 | 期待動作 |
|------|---------|
| sub_course 未設定の高2/高3生徒で LIFF にアクセス | 「文系・理系を選択してください」画面が表示される |
| 文系/理系を選択 | 「○○で設定します」確認画面が表示される |
| 「確定」 | 保存後に通常の得点入力画面が表示される |
| 確定後 | students_master の sub_course が更新されている |
| 確定後 | exam_patterns に高2・高3の選択した文理パターンが生成されている |
| 確定後 | pattern_subjects にデフォルト教科が設定されている |

### I. エラーケース

| ケース | 期待動作 |
|--------|---------|
| LINE 未紐づけの userId でアクセス | 「未登録のアカウントです」エラーボックス＋登録 URL リンクが表示される |
| 校舎未設定（NO_BRANCH）の生徒でアクセス | 「校舎情報が設定されていません」エラーが表示される |
| student_index に存在しない userId でアクセス | 「生徒情報が見つかりません」エラーが表示される |
| システムエラー（SYSTEM_ERROR）が発生 | 「システムエラーが発生しました」エラーが表示される |
| branches に spreadsheet_id なし | `getChildSS` → "spreadsheet_id が未設定" |
| admin_users に is_active = false | `getAdminContext` → "アクセス権限がありません" |

### J. 開発者モード（/dev URL）

| 操作 | 期待動作 |
|------|---------|
| `/dev` URL にアクセス（Google ログイン済み） | userId 入力フォームが表示される |
| userId を入力して「表示」 | 対応する生徒の LIFF 画面が表示される |
| 存在しない userId を入力 | エラーメッセージが表示される |
| `/exec` URL にアクセス（LINE 外） | 「LINE アプリからアクセスしてください」メッセージが表示される |

