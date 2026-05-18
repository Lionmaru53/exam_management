# やりたいことリスト（バックログ）

優先度: 🔴 高 / 🟡 中 / ⚪ 低・未定

---

## ⚪ 教科マスターに「属性」と「表示名」を分離する

**概要**
教科に「属性（canonical name）」と「表示名（school-specific name）」の2層を持たせる。

**ユースケース**
- 属性: `数学Ⅰ`（全校舎共通の識別子・比較キー）
- 表示名: `数学①`（A高校独自の表記）/ `数学I`（B高校の表記）

**設計イメージ**
- `subjects_master`（親SS）: `subject_id`, `subject_name`（属性）, `genre_id`, `grade`
- `subject_aliases`（子SS）: `subject_id`, `display_name`（任意・未設定なら属性名で表示）
- マスター管理者が属性を決定 → 各校舎管理者が自校舎向け表示名を任意で設定
- 得点入力・表示は `display_name`（なければ `subject_name`）を使用
- 校舎間比較・集計は `subject_id`（属性）で突き合わせる

**影響範囲**
- `subjects_master` スキーマ変更
- 子SS に `subject_aliases` シート追加
- 管理画面: マスターデータ管理（属性編集）＋校舎管理画面（表示名編集）
- 得点表示ロジック（`getData.js`）の alias 参照

---

## ⚪ 得点バリデーション機能

**概要**
生徒の得点入力時にマイナス値・満点超過をエラーとして弾くバリデーションを追加する。

**ユースケース**
- マイナス値 → 入力エラー
- 学校ごとに設定した満点より大きい値 → 入力エラー

**設計イメージ**
- 満点の管理: 子SS の `exam_patterns` または専用シートに `max_score`（学校・教科単位で設定）
- バリデーションはクライアント側（即時フィードバック）とサーバー側（`saveAllScores`）の両方で実施
- 満点は学校・教科によって異なるため、フロントに渡すデータに `max_score` を含める

**影響範囲**
- 子SS: `pattern_subjects`（または別テーブル）に `max_score` 列を追加
- `getData.js`: 得点入力画面に `max_score` を含めて返す
- `saveData.js`: `saveAllScores` にバリデーションロジックを追加
- 生徒向けフロント: 入力時のリアルタイムチェック

---

## ⚪ 生徒の得点記入・証拠ファイルアップロード機能

**概要**
生徒が LIFF 画面から得点・順位を手動入力するだけでなく、証拠写真や成績関連ファイルをアップロードできるようにする。

**機能一覧**

| 機能 | 内容 |
|------|------|
| 得点・順位の手動入力 | 既存機能の改善・UI 整備 |
| 証拠写真アップロード | 得点・順位の裏付け写真（試験返却物など） |
| 評定アップロード | 通知表・成績証明書などの画像・PDF |
| その他ファイルアップロード | 任意の写真・PDF（用途フリー） |

**設計イメージ**
- アップロード先: Google Drive の校舎ごとのフォルダ（子SS の config シートに `DRIVE_FOLDER_ID` を保持）
- GAS 側: `DriveApp.getFolderById().createFile(blob)` でファイル保存
- ファイル情報（Drive ファイルID・種別・生徒ID・試験ID）を子SS の `student_files` シートに記録
- フロント（LIFF）: `FileReader` で base64 → GAS に送信（画像・PDF 対応）
- 閲覧: 生徒は自分のファイルのみ、管理者は校舎全体を閲覧可能

**新規シート（子SS）**
```
student_files
  file_id       - 自動生成
  student_id    - 生徒ID
  exam_id       - 試験ID（紐付ける場合）
  file_type     - score_proof / evaluation / other
  drive_file_id - Google Drive のファイルID
  uploaded_at   - アップロード日時
```

**考慮事項**
- GAS の `google.script.run` は送受信データ上限 50MB
- 画像は送信前にクライアント側で Canvas API を使って圧縮する
- PDF は分割が必要になる場合あり
- Drive フォルダの共有設定（生徒は write のみ・read 不可、または制限付き）
- 管理者画面からもファイル一覧・プレビューができると望ましい
