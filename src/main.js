/** アプリバージョン（機能変更時に更新） */
const APP_VERSION = '0.1.4';
/** GASデプロイ番号（clasp push → git tag v? と連動して更新） */
const GAS_BUILD   = 'v84';

/**
 * 生徒向けアプリ / 管理画面 の振り分け
 */
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};

  // 管理画面
  if (params.page === 'admin') {
    const tmplAdmin = HtmlService.createTemplateFromFile('admin_index');
    tmplAdmin.appVersion = APP_VERSION;
    tmplAdmin.gasBuild   = GAS_BUILD;
    return tmplAdmin.evaluate()
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

  // デモモード：?demo=1[&type=first_g1|first_g2|returning]
  if (params.demo === '1') {
    const demoType = params.type || 'returning';
    try {
      const data = getDemoInitialData(demoType);
      const tmpl = HtmlService.createTemplateFromFile('index_app');
      tmpl.appData    = JSON.stringify(data).split('<').join('\\u003c').split('>').join('\\u003e');
      tmpl.isDemoMode = true;
      tmpl.appVersion = APP_VERSION;
      tmpl.gasBuild   = GAS_BUILD;
      return tmpl.evaluate()
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setTitle('定期テスト得点確認 [デモ]')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch (err) {
      return HtmlService.createHtmlOutput(
        `<p style="color:red;padding:20px;">デモエラー: ${err.toString()}</p>`
      ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  // 生徒アプリ：GitHub Pages で userId 取得後リダイレクトされてくる
  if (params.userId) {
    // parentSS を先頭で一度だけ取得し、認証失敗・成功の両パスで共有する
    const parentSS = SpreadsheetApp.getActiveSpreadsheet();

    // idToken がない、または検証失敗は認証エラー
    if (!params.idToken || !_verifyLineIdToken(params.idToken, params.userId, params.channelId)) {
      _writeLiffLog(
        parentSS,
        params.userId    || '',
        'auth_failed',
        '', '', '',
        params.channelId   || '',
        params.displayName || ''
      );
      return HtmlService.createHtmlOutput(
        '<p style="font-family:sans-serif;padding:24px;text-align:center;">認証に失敗しました。LINEアプリから再度アクセスしてください。</p>'
      ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    try {
      const data = getInitialData(params.userId, params.channelId, params.displayName, parentSS);
      const tmpl = HtmlService.createTemplateFromFile('index_app');
      // </script> を壊す < > を split/join でエスケープ（regex を使わない）
      tmpl.appData    = JSON.stringify(data).split('<').join('\\u003c').split('>').join('\\u003e');
      tmpl.isDemoMode = false;
      tmpl.appVersion = APP_VERSION;
      tmpl.gasBuild   = GAS_BUILD;
      return tmpl.evaluate()
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setTitle('定期テスト得点確認')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch (err) {
      return HtmlService.createHtmlOutput(
        `<p style="color:red;padding:20px;">エラー: ${err.toString()}</p>`
      ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  // デフォルト（直接アクセス）
  // ?mode=dev を明示指定した場合のみ開発者モードを表示（master 権限保持者のみ）
  if (params.mode === 'dev') {
    const devEmail = Session.getActiveUser().getEmail();
    if (_isScriptOwner(devEmail)) {
      return HtmlService.createHtmlOutput(_devInputPage(devEmail))
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
  }

  return HtmlService.createHtmlOutput(
    '<p style="font-family:sans-serif;padding:24px;text-align:center;">LINE アプリからアクセスしてください。</p>'
  )
  .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(_e) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: 'unknown action' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * LINE idToken を LINE Platform API で検証する。
 * channelId がホワイトリスト（LINE_CHANNEL_IDS）に含まれる場合のみ検証を実行し、
 * sub が expectedUserId と一致するか確認する。
 * GAS Script Property に LINE_CHANNEL_IDS（JSON配列文字列）が設定されている必要がある。
 */
function _verifyLineIdToken(idToken, expectedUserId, channelId) {
  if (!channelId) {
    Logger.log('[_verifyLineIdToken] channelId が未指定');
    return false;
  }
  const raw = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_IDS');
  if (!raw) {
    Logger.log('[_verifyLineIdToken] LINE_CHANNEL_IDS が未設定');
    return false;
  }
  let allowedIds;
  try {
    allowedIds = JSON.parse(raw);
  } catch (_) {
    Logger.log('[_verifyLineIdToken] LINE_CHANNEL_IDS のパースエラー');
    return false;
  }
  if (!Array.isArray(allowedIds) || !allowedIds.includes(String(channelId))) {
    Logger.log('[_verifyLineIdToken] channelId がホワイトリスト外: ' + channelId);
    return false;
  }
  try {
    const res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'post',
      payload: { id_token: idToken, client_id: String(channelId) },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return false;
    const json = JSON.parse(res.getContentText());
    return String(json.sub || '') === String(expectedUserId || '');
  } catch (e) {
    Logger.log('[_verifyLineIdToken] エラー: ' + e.message);
    return false;
  }
}

/**
 * 訪問者がスクリプトオーナー（デプロイ者）本人かを確認する。
 * getEffectiveUser() は "Execute as: Me" 設定で常にオーナーのメールを返す。
 * getActiveUser() は /dev URL 経由でログイン中の場合に訪問者メールを返す。
 * 両者が一致 → オーナー本人 → dev モード許可。
 */
function _isScriptOwner(visitorEmail) {
  try {
    const ownerEmail = Session.getEffectiveUser().getEmail();
    return !!(visitorEmail && ownerEmail &&
      visitorEmail.trim().toLowerCase() === ownerEmail.trim().toLowerCase());
  } catch (_) {
    return false;
  }
}

function _devInputPage(email) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>開発者モード</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: sans-serif; padding: 48px 24px; max-width: 420px; margin: 0 auto; color: #333; }
    h2 { color: #2c4a7c; margin: 0 0 4px; }
    .badge { display: inline-block; background: #f0a500; color: #fff;
             font-size: 0.72em; padding: 2px 8px; border-radius: 10px;
             vertical-align: middle; margin-left: 8px; font-weight: bold; }
    .email { color: #888; font-size: 0.85em; margin: 0 0 24px; }
    label { display: block; font-size: 0.88em; color: #555; margin-bottom: 6px; }
    input { width: 100%; padding: 10px 12px; border: 1px solid #ccc;
            border-radius: 6px; font-size: 0.95em; }
    button { margin-top: 14px; width: 100%; padding: 12px;
             background: #4a7fc1; color: #fff; border: none;
             border-radius: 6px; font-size: 1em; cursor: pointer; }
    button:hover { background: #2c5fa0; }
    .section-divider { border: none; border-top: 1px solid #eee; margin: 28px 0 16px; }
    .btn-admin { width: 100%; padding: 10px; background: #fff; color: #2c4a7c;
                 border: 2px solid #2c4a7c; border-radius: 6px; font-size: 0.95em;
                 cursor: pointer; font-weight: bold; }
    .btn-admin:hover { background: #e8f0fb; }
  </style>
</head>
<body>
  <h2>開発者モード <span class="badge">DEV</span></h2>
  <p class="email">ログイン中: ${email}</p>
  <form onsubmit="go(event)">
    <label for="uid">LINE userId を入力</label>
    <input type="text" id="uid" placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
    <button type="submit">アプリを表示</button>
  </form>
  <hr class="section-divider">
  <button class="btn-admin" onclick="goAdmin()">管理画面へ →</button>
  <script>
    function go(e) {
      e.preventDefault();
      var uid = document.getElementById('uid').value.trim();
      if (!uid) return;
      var btn = document.querySelector('button[type=submit]');
      btn.disabled = true;
      btn.textContent = '読み込み中...';
      google.script.run
        .withSuccessHandler(function(html) {
          document.open();
          document.write(html);
          document.close();
        })
        .withFailureHandler(function(err) {
          btn.disabled = false;
          btn.textContent = 'アプリを表示';
          alert('エラー: ' + (err && err.message ? err.message : JSON.stringify(err)));
        })
        .getStudentAppHtml(uid);
    }
    function goAdmin() {
      var btn = document.querySelector('.btn-admin');
      btn.disabled = true;
      btn.textContent = '読み込み中...';
      google.script.run
        .withSuccessHandler(function(html) {
          document.open();
          document.write(html);
          document.close();
        })
        .withFailureHandler(function(err) {
          btn.disabled = false;
          btn.textContent = '管理画面へ →';
          alert('エラー: ' + (err && err.message ? err.message : JSON.stringify(err)));
        })
        .getAdminPageHtml();
    }
  </script>
</body>
</html>`;
}

/**
 * 開発者モード用: 管理画面の HTML 文字列を返す
 */
function getAdminPageHtml() {
  const tmpl = HtmlService.createTemplateFromFile('admin_index');
  tmpl.appVersion = APP_VERSION;
  tmpl.gasBuild   = GAS_BUILD;
  return tmpl.evaluate().getContent();
}

/**
 * 開発者モード用: 生徒アプリの HTML 文字列を返す
 */
function getStudentAppHtml(userId) {
  const data = getInitialData(userId);
  const tmpl = HtmlService.createTemplateFromFile('index_app');
  tmpl.appData    = JSON.stringify(data).split('<').join('\\u003c').split('>').join('\\u003e');
  tmpl.isDemoMode = false;
  tmpl.appVersion = APP_VERSION;
  tmpl.gasBuild   = GAS_BUILD;
  return tmpl.evaluate().getContent();
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

if (typeof module !== 'undefined') Object.assign(global, {
  _verifyLineIdToken,
});
