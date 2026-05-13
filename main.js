/**
 * 生徒向けアプリ / 管理画面 の振り分け
 */
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};

  // 管理画面
  if (params.page === 'admin') {
    return HtmlService.createTemplateFromFile('admin_index')
      .evaluate()
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setTitle('成績管理システム - 管理者用');
  }

  // 得点保存 API（GitHub Pages からの GET リクエスト）
  if (params.action === 'saveScores') {
    try {
      const payload = JSON.parse(params.payload || '{}');
      const result  = saveAllScores(payload);
      return ContentService.createTextOutput(result)
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // データ取得 API（GitHub Pages の LIFF フロントエンドから呼ばれる）
  if (params.userId) {
    try {
      const data = getInitialData(params.userId);
      return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // デフォルト（直接アクセス）
  return HtmlService.createHtmlOutput(`
    <!DOCTYPE html><html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
    </head><body style="font-family:sans-serif;padding:24px;text-align:center;">
      <p>このページは LINE アプリからご利用ください。</p>
    </body></html>
  `);
}

/**
 * ファイルをインクルードするための補助関数
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
