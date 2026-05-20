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
      .setTitle('成績管理システム - 管理者用')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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

  // 生徒アプリ：GitHub Pages で userId 取得後リダイレクトされてくる
  if (params.userId) {
    try {
      const data    = getInitialData(params.userId);
      const tmpl    = HtmlService.createTemplateFromFile('index_app');
      tmpl.appData  = JSON.stringify(data);
      return tmpl.evaluate()
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setTitle('定期テスト得点確認')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch (err) {
      return HtmlService.createHtmlOutput(
        `<p style="color:red;padding:20px;">エラー: ${err.toString()}</p>`
      )
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  // デフォルト（直接アクセス）
  return HtmlService.createHtmlOutput(
    '<p style="font-family:sans-serif;padding:24px;text-align:center;">LINE アプリからアクセスしてください。</p>'
  )
  .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
