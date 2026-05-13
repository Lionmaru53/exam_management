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
      return jsonpOrJson(result, params.callback);
    } catch (err) {
      return jsonpOrJson(JSON.stringify({ error: err.toString() }), params.callback);
    }
  }

  // データ取得 API（GitHub Pages の LIFF フロントエンドから呼ばれる）
  if (params.userId) {
    try {
      const data = getInitialData(params.userId);
      return jsonpOrJson(JSON.stringify(data), params.callback);
    } catch (err) {
      return jsonpOrJson(JSON.stringify({ error: err.toString() }), params.callback);
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
 * JSONP または JSON でレスポンスを返す
 * callback パラメータがあれば JSONP 形式（CORS 回避）、なければ JSON
 */
function jsonpOrJson(jsonStr, callback) {
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + jsonStr + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(jsonStr)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ファイルをインクルードするための補助関数
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
