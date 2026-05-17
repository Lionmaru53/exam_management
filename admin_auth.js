/**
 * 管理者認証・権限チェック（Phase 1: GIS トークン検証）
 *
 * クライアントサイドで Google Identity Services (GIS) が発行した ID トークンを
 * Google tokeninfo エンドポイントで検証し、メールアドレスを取得する。
 * USER_DEPLOYING モードを維持しているため、SpreadsheetApp へのアクセスは問題なし。
 */

const ADMIN_USERS_SHEET = 'admin_users';
const AUDIT_LOG_SHEET   = 'audit_log';

function _getAdminSS() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('スプレッドシートにアクセスできません。');
  return ss;
}

/**
 * HTML テンプレートに OAuth クライアント ID を注入するためのヘルパー。
 * Script Properties に OAUTH_CLIENT_ID が未設定の場合は空文字を返す。
 */
function getOAuthClientId() {
  return PropertiesService.getScriptProperties().getProperty('OAUTH_CLIENT_ID') || '';
}

/**
 * GIS が発行した ID トークンを Google tokeninfo API で検証し、メールアドレスを返す。
 * @param {string} idToken
 * @returns {string} 検証済みメールアドレス
 */
function _verifyIdToken(idToken) {
  if (!idToken) throw new Error('認証トークンがありません。再ログインしてください。');
  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('認証トークンの検証に失敗しました。再ログインしてください。');
  }
  const payload = JSON.parse(res.getContentText());
  if (payload.email_verified !== 'true' && payload.email_verified !== true) {
    throw new Error('メールアドレスが未確認のGoogleアカウントです。');
  }
  return String(payload.email || '').trim();
}

/**
 * ID トークンを検証し、admin_users シートで管理者を照合する。
 * @param {string} idToken  GIS が発行した ID トークン
 * @returns {{ email: string, role: string, cram_id: string }}
 */
function getAdminContext(idToken) {
  const email = _verifyIdToken(idToken);

  const ss    = _getAdminSS();
  const sheet = ss.getSheetByName(ADMIN_USERS_SHEET);
  if (!sheet) throw new Error('admin_users シートが見つかりません。setupAdminSS() を実行してください。');

  const rows  = getRowsData(sheet);
  const admin = rows.find(r =>
    String(r.email || '').trim().toLowerCase() === email.toLowerCase() &&
    (r.is_active === true || String(r.is_active).trim() === '1' || String(r.is_active).trim() === 'true')
  );

  if (!admin) throw new Error('アクセス権限がありません。管理者に連絡してください。');

  _updateLastLogin(sheet, rows, email);

  return {
    email:   email,
    role:    String(admin.role    || '').trim(),
    cram_id: String(admin.cram_id || '').trim()
  };
}

function _updateLastLogin(sheet, rows, email) {
  try {
    const headers      = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const lastLoginCol = headers.indexOf('last_login') + 1;
    if (lastLoginCol < 1) return;
    const rowIdx = rows.findIndex(
      r => String(r.email || '').trim().toLowerCase() === email.toLowerCase()
    );
    if (rowIdx >= 0) sheet.getRange(rowIdx + 2, lastLoginCol).setValue(new Date());
  } catch (e) {
    console.warn('last_login 更新失敗:', e.message);
  }
}

function writeAuditLog(adminContext, action, detail, result) {
  try {
    const sheet = _getAdminSS().getSheetByName(AUDIT_LOG_SHEET);
    if (!sheet) return;
    sheet.appendRow([
      new Date(),
      adminContext.email,
      adminContext.cram_id,
      action,
      typeof detail === 'object' ? JSON.stringify(detail) : String(detail || ''),
      result || 'success'
    ]);
  } catch (e) {
    console.warn('audit_log 書き込み失敗:', e.message);
  }
}

/**
 * admin_users / audit_log シートをメインSSに作成する。
 * GAS エディタから一度だけ手動実行する。
 */
function setupAdminSS() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let adminSheet = ss.getSheetByName(ADMIN_USERS_SHEET);
  if (!adminSheet) {
    adminSheet = ss.insertSheet(ADMIN_USERS_SHEET);
    adminSheet.getRange(1, 1, 1, 7).setValues([[
      'admin_id', 'email', 'cram_id', 'role', 'is_active', 'created_at', 'last_login'
    ]]);
    Logger.log('admin_users シートを作成しました。');
  } else {
    Logger.log('admin_users シートは既に存在します。');
  }

  if (!ss.getSheetByName(AUDIT_LOG_SHEET)) {
    const auditSheet = ss.insertSheet(AUDIT_LOG_SHEET);
    auditSheet.getRange(1, 1, 1, 6).setValues([[
      'timestamp', 'email', 'cram_id', 'action', 'detail', 'result'
    ]]);
    Logger.log('audit_log シートを作成しました。');
  }

  // 実行者をマスター管理者として登録（未登録の場合のみ）
  const myEmail = Session.getActiveUser().getEmail();
  if (myEmail) {
    const rows   = getRowsData(adminSheet);
    const exists = rows.some(r => String(r.email || '').toLowerCase() === myEmail.toLowerCase());
    if (!exists) {
      const adminId = 'A' + Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
      adminSheet.appendRow([adminId, myEmail, '', 'master', true, new Date(), '']);
      Logger.log('マスター管理者を登録しました: ' + myEmail);
    }
  }

  Logger.log('セットアップ完了');
}

// ---- 管理者ユーザー管理 ----

function getAdminUsers(callerIdToken) {
  try {
    const ctx = getAdminContext(callerIdToken);
    if (ctx.role !== 'master') return { error: '権限がありません' };
    const rows = getRowsData(_getAdminSS().getSheetByName(ADMIN_USERS_SHEET));
    return { success: true, adminUsers: stringifyDates(rows) };
  } catch (e) {
    return { error: e.message };
  }
}

function addAdminUser(callerIdToken, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ctx   = getAdminContext(callerIdToken);
    if (ctx.role !== 'master') return { error: '権限がありません' };

    const sheet = _getAdminSS().getSheetByName(ADMIN_USERS_SHEET);
    const rows  = getRowsData(sheet);
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email) return { error: 'メールアドレスを入力してください' };
    if (rows.some(r => String(r.email || '').trim().toLowerCase() === email)) {
      return { error: '既に登録されているメールアドレスです' };
    }

    const adminId = 'A' + Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
    sheet.appendRow([adminId, payload.email.trim(), payload.cram_id || '', payload.role || 'branch_admin', true, new Date(), '']);
    writeAuditLog(ctx, 'add_admin', { email: payload.email, role: payload.role }, 'success');
    return { success: true };
  } catch (e) {
    return { error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function deactivateAdminUser(callerIdToken, targetEmail) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ctx = getAdminContext(callerIdToken);
    if (ctx.role !== 'master') return { error: '権限がありません' };
    if (ctx.email.toLowerCase() === targetEmail.toLowerCase()) return { error: '自分自身は無効化できません' };

    const sheet   = _getAdminSS().getSheetByName(ADMIN_USERS_SHEET);
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const emailCol    = headers.indexOf('email') + 1;
    const isActiveCol = headers.indexOf('is_active') + 1;

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][emailCol - 1] || '').trim().toLowerCase() === targetEmail.toLowerCase()) {
        sheet.getRange(i + 1, isActiveCol).setValue(false);
        writeAuditLog(ctx, 'deactivate_admin', { target: targetEmail }, 'success');
        return { success: true };
      }
    }
    return { error: '対象の管理者が見つかりません' };
  } catch (e) {
    return { error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function updateAdminUser(callerIdToken, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ctx = getAdminContext(callerIdToken);
    if (ctx.role !== 'master') return { error: '権限がありません' };

    const sheet   = _getAdminSS().getSheetByName(ADMIN_USERS_SHEET);
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const emailCol  = headers.indexOf('email') + 1;
    const roleCol   = headers.indexOf('role') + 1;
    const cramIdCol = headers.indexOf('cram_id') + 1;

    const target = String(payload.email || '').trim().toLowerCase();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][emailCol - 1] || '').trim().toLowerCase() === target) {
        if (payload.role    !== undefined && roleCol   > 0) sheet.getRange(i + 1, roleCol).setValue(payload.role);
        if (payload.cram_id !== undefined && cramIdCol > 0) sheet.getRange(i + 1, cramIdCol).setValue(payload.cram_id);
        writeAuditLog(ctx, 'update_admin', payload, 'success');
        return { success: true };
      }
    }
    return { error: '対象の管理者が見つかりません' };
  } catch (e) {
    return { error: e.message };
  } finally {
    lock.releaseLock();
  }
}
