# exam_management — Claude 向けプロジェクトコンテキスト

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

## アクセス URL（確定）

| 用途 | URL | 備考 |
|------|-----|------|
| 管理者 | `script.google.com/macros/s/[管理者デプロイID]/exec?page=admin` | Google ログイン必須・Cloudflare 経由なし |
| 生徒（LIFF） | `wasedazemi-highschool.com/exams/test?userId=...` | Cloudflare 経由・Google ログイン不要 |

---

## 現在の開発状況（2026-05-25 更新）

- **Phase 0〜2: 完了・main にマージ済み（2026-05-19）**
- **単一プロジェクト構成**: `src/` を直接 GAS プロジェクトへ push

**現在の main ブランチ最新 commit**: `adb2cac`

---

### 直近の実装内容（2026-05-25）

**生徒 LIFF：不具合報告セクション（commit `adb2cac`）**

- 得点入力画面の下部に「不具合を報告する」トグルを追加
- 5種別（表示名が違う／科目が足りない／保存した点数が消えた／テスト名・試験区分がおかしい／その他）
- 種別ごとに補助入力フィールドが動的に表示（プルダウン・テキスト入力）
- 「確認する」→ 確認画面（内容表示）→「送信する」の2ステップ送信フロー
- 報告内容は親 SS の `bug_reports` シートに記録（Google Sheets の通知ルールでメール通知）
- MailApp スコープは未使用（Workspace ポリシーによりブロックされるため）

**生徒 LIFF：未受験チェックボックス・未実施バッジ（commit `adb2cac`）**

- 科目テーブルに「未受験」列を追加。チェックすると得点・順位入力が無効化され `not_taken: true` として保存
- `exam_subject_exclusions` で除外設定された科目には「未実施」バッジを表示（入力不可）
- `exam_subject_exclusions` シートは任意扱いに変更（旧子 SS には存在しないため後方互換）

**管理画面：パターン手動追加 UI（commit `adb2cac`）**

- 「全学校・全学年を初期化」ボタンを「コースを追加する」フォームに置換
- 学校名チェックリスト（全選択補助あり）＋ コース入力 →「追加する」で高1・高2文系/理系・高3文系/理系の5パターンを自動生成

**`subjects_master.default` 列（commit `adb2cac`）**

- `default` 列が `true`/`1` の科目のみ新パターンの初期科目として登録（従来の「ジャンル上位2件」ヒューリスティックを廃止）

---

### 過去の重要な経緯（参考）

**`main.js` の JSON 埋め込み修正（2026-05-24）**

GAS HtmlTemplate に JSON を埋め込む際 U+2028/U+2029 混入で `SyntaxError` が発生した。現在の実装:

```javascript
tmpl.appData = JSON.stringify(data).split('<').join('\\u003c').split('>').join('\\u003e');
```

**`getData.js` の student 検索方式変更（2026-05-24）**

`student_index` で LINE ID → `student_id` を解決し、`students_master` は `student_id` で引く。  
保護者の LINE ID でも同じ生徒データを参照できる。

> ⚠️ `student_index` シートに `student_id` 列が必要。VSTACK 数式で自動生成（`spreadsheet-schema.md` 参照）。

---

### 次にやること（優先順）

1. **LIFF 動作確認**（最優先）
   - 不具合報告フォームの送受信が実際に機能するか確認
   - 未受験チェックが保存・再表示されるか確認
   - `bug_reports` シートへの書き込みと Google Sheets 通知の動作確認

2. **スプレッドシート設定**
   - `subjects_master` に `default` 列を追加（既存行は `TRUE`/空 で設定）
   - `student_index` に `student_id` 列が VSTACK 数式で存在することを確認

3. **教科ごとの満点設定・バリデーション強化**（バックログ）
   - `pattern_subjects` に `max_score` 列追加
   - フロント・サーバー両方でバリデーション

4. **コース表記ゆれ対応**（バックログ）
   - 管理画面でコースをマージできる UI

5. **過去成績の表示機能**（バックログ）
   - 生徒 LIFF から自分の得点推移・履歴を確認できる画面

---

## プロジェクト構成（重要）

```
src/          ← 全ロジック・HTML → .clasp.dev.json で push（開発）/ .clasp.json で push（本番）
```

| clasp 設定 | push 先 | rootDir | 用途 |
|---|---|---|---|
| `.clasp.dev.json` | 開発 GAS プロジェクト | `src/` | 開発・動作確認 |
| `.clasp.json`（git 管理外） | 本番 GAS プロジェクト | `src/` | 本番デプロイ |

---

## 次回セッション開始手順

### 1. コードの push

| 目的 | コマンド |
|------|---------|
| **開発中（通常）** | `clasp push --project .clasp.dev.json` |
| テストコード込み push | `.\push-test.ps1`（要確認: test 用 clasp 設定） |
| 本番リリース時 | `clasp push` → GAS エディタで「デプロイを管理 → 新しいバージョン」を作成 |

> ⚠️ push 後は GAS エディタで「デプロイ → デプロイを管理 → 新しいバージョン」の作成が必要（exec URL への反映）。

### 2. 動作確認
管理者デプロイ URL（直接 GAS URL）にアクセスし、Google アカウントでログインできることを確認

### 3. テスト実行

| 目的 | コマンド |
|------|---------|
| ローカル Jest テスト（高速・推奨） | `npm test` |
| GAS テスト（シート操作込み） | `.\push-test.ps1` → GAS エディタで `runAllTests()` |

詳細は [testing.md](.claude/testing.md) を参照。

### 4. 現在の状況

「次にやること」は上の「直近の実装内容」セクションに記載済み。詳細は [roadmap.md](.claude/roadmap.md) 参照。

---

## 技術スタック（要約）

- **バックエンド**: GAS（clasp で push）
- **フロントエンド**: GAS HtmlService（管理画面）/ GitHub Pages（LIFF）
- **DB**: Google スプレッドシート（親 SS + 校舎別子 SS）
- **認証**: `Session.getActiveUser()` + admin_users シート照合（管理者）/ LINE LIFF（生徒）
- **xlsx 解析**: SheetJS（CDN）でブラウザ側解析 → GAS に JSON 送信（Drive API 不要）
