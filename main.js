/**
 * LIFFアプリの初期表示
 */
function doGet(e) {
  const page = (e && e.parameter) ? e.parameter.page : null;
  if (page === 'admin') {
    return HtmlService.createTemplateFromFile('admin_index')
      .evaluate()
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setTitle('成績管理システム - 管理者用');
  }

  const template = HtmlService.createTemplateFromFile('index');
  template.liffId = PropertiesService.getScriptProperties().getProperty('LIFF_ID') || '';
  return template.evaluate()
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setTitle('定期テスト得点入力フォーム');
}

/**
 * ファイルをインクルードするための補助関数
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
