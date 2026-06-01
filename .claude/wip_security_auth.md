# WIP: feature/security-auth-upload

作業ブランチ: `feature/security-auth-upload`
最終更新: 2026-06-01

## 実施済みの変更（未コミット）

### 変更ファイル
- `docs/index.html` — idToken・channelId・displayName を GAS URL に追加
- `src/main.js` — doPost の uploadFile 削除・idToken 検証・auth_failed ログ追加
- `src/getData.js` — _writeLiffLog に channel_id / line_display_name 追加、getInitialData に parentSS 引数追加
- `src/admin_logic_dashboard.html` — LINEニックネーム列をログテーブルに追加
- `tests/unit/jest.setup.js` — UrlFetchApp モック・main.js 読み込み追加
- `tests/unit/main.test.js` — _verifyLineIdToken のユニットテスト（新規）

### 実装した機能
1. **doPost の uploadFile デッドコード削除** — google.script.run 経由が正規ルートのため不要
2. **LIFF idToken 検証** — LINE API で署名検証し userId なりすましを防止
3. **複数チャネル対応** — LINE_CHANNEL_IDS（JSON配列）ホワイトリストで複数チャネルを管理
4. **アクセスログ強化** — channel_id / line_display_name をログに追加（auth_failed 含む）
5. **ログの parentSS 問題修正** — getActiveSpreadsheet() を先頭で一度だけ取得して共有

## デプロイ前にやること（必須）

### GAS Script Properties に設定
```
LINE_CHANNEL_IDS  →  ["1234567890", "0987654321"]
```
※ LINE Developers Console の「チャネルID」（数字）を JSON 配列で設定

### GitHub Pages に反映
`docs/index.html` を更新しないと以下が起きる：
- 旧 URL（`?userId=xxx` のみ）が送られてくる
- idToken がないため全ユーザーが auth_failed になる
- channel_id / line_display_name がログに残らない（パラメータが届かないため）

**手順：**
1. このブランチをコミット・プッシュ
2. main にマージ（または docs/ だけ先にマージ）
3. GitHub Pages が main の docs/ から配信されていることを確認

## テスト状況
- npm test: 全 112 件パス ✓
- 実機テスト: 未実施（docs/index.html 未デプロイのため channel_id / line_display_name の動作未確認）

## 注意点
- `liff.getIDToken()` は openid スコープが必要（LINE Developers Console で設定済み ✓）
- `LINE_CHANNEL_IDS` 未設定のままデプロイすると全ユーザーが auth_failed になる
- デプロイ順序: Script Properties 設定 → clasp push → docs 反映 の順に行うこと