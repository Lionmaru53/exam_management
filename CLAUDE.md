# 基本方針
- 必ず日本語で応対してください。
- ユーザーは「ぽん」です。
- 「ぽん」はプログラム言語を理解することはできますが、大規模なWeb開発は未経験です。セキュリティ関連も疎いので、適宜アドバイスをしてください。
- エラーが発生したら、.claude/issues.md に概要をまとめる。
- 編集をしたら、サブエージェントでテストを走らせる。
- TDD（テスト駆動開発）にする。

# Claude Code 関連
- コンテキスト節約のため、調査やデバッグにはサブエージェントを活用してください。
- 「ぽん」とClaude Codeの会話が長引くと、スレッドが圧縮要約されて記憶喪失になり困るので、自動圧縮がかからないうちに定期的に重要な点をマークダウンでプロジェクトディレクトリ内に保存・更新して。
- 開発中に生成するドキュメントにAPIキーなどの機密情報を書いてもいいけど、必ず .gitignore に追加して。
- Gitへcommitするメッセージは日本語で端的に、2～3行程度に収める。

# このプロジェクトの概要
- 塾生の定期試験の得点・順位を管理するシステム。
- Google Apps Script (GAS) + Google スプレッドシート構成。生徒は LINE / LIFF、管理者は Web 管理画面を使用。
- genre を「教科」、subject を「科目」として扱い、subject は genre のサブグループとして扱う。

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

## コマンド

| 目的 | コマンド |
|------|---------|
| 開発 GAS へ push | `clasp push --project .clasp.dev.json` |
| 本番 GAS へ push | `clasp push` |
| Jest ユニットテスト（高速） | `npm test` |
| 特定テストファイルのみ実行 | `npm test -- --testPathPattern=admin_import` |

> **push 後の必須手順**: GAS エディタ → デプロイを管理 → 鉛筆アイコン → 「新しいバージョン」を選択。`/exec` URL はデプロイ済みバージョンを実行するため push だけでは反映されない。開発中の動作確認は `/dev` URL を使う（常に HEAD を実行）。
