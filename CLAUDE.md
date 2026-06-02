# 基本方針
- 必ず日本語で応対してください。
- ユーザーの名前は「ぽん」です。
- 「ぽん」はプログラム言語を理解することはできますが、大規模なWeb開発は未経験です。セキュリティ関連も疎いので、適宜アドバイスをしてください。
- スキーマの変更や、エラーが発生など、様々なプロジェクトの仕様に関わることは、このプロジェクト下のフォルダ ./.claude/ を更新・参照して。
- TDD（テスト駆動開発）にして、それに関するアドバイスも積極的にして。

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
- [スプレッドシートスキーマ詳細](spreadsheet-schema.md)

**Issue・バックログ管理**
- バグ・不具合・機能要望はすべて [GitHub Issues](https://github.com/Lionmaru53/exam_management/issues) で管理する。
- ラベル運用: `bug`（不具合）/ `enhancement`（機能追加・改善）/ `question`（調査・検討）
- Issue を修正したコミットには `Fixes #番号` または `Closes #番号` を含め、自動クローズを活用する。
- `.claude/issues.md` は廃止（過去の記録は git 履歴で参照可能）。

---

## コマンド

| 目的 | コマンド |
|------|---------|
| 開発 GAS へ push | `clasp push --project .clasp.dev.json` |
| 本番 GAS へ push | `clasp push` |
| Jest ユニットテスト（高速） | `npm test` |