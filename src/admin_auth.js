/**
 * 管理者認証・権限チェック（Phase 1: Session.getActiveUser() 方式）
 *
 * GAS webapp のアクセス設定を「Google アカウントが必要」にすることで
 * Session.getActiveUser().getEmail() がサーバーサイドで確実にユーザーを特定する。
 * クライアントからトークンや email を受け取る必要がない。
 * Execute as: Me (USER_DEPLOYING) を維持するため SpreadsheetApp は問題なし。
 */

const ADMIN_USERS_SHEET = 'admin_users';
const AUDIT_LOG_SHEET   = 'audit_log';

// admin_users シートの固定列。それ以外の列名は cram_id として扱う。
const _ADMIN_FIXED_COLS = new Set(['admin_id', 'email', 'name', 'role', 'is_active']);

function _getAdminSS() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('スプレッドシートにアクセスできません。');
  return ss;
}

/**
 * シートのスキーマを期待する列定義に合わせて reconcile する。
 *
 * 処理:
 *   1. 未知列を後ろから削除（allowExtra:true のときはスキップ）
 *   2. 不足列を末尾に追加
 *   3. データ使用域より右の余剰列を削除してセル数を節約
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string[]} expectedHeaders
 * @param {{ allowExtra?: boolean }} [opts]
 *   allowExtra:true のときは未知列を削除しない（admin_users の cram_id 動的列など）
 * @returns {{ added: string[], removed: string[], trimmed: number }}
 */
function _reconcileSheetSchema(sheet, expectedHeaders, opts) {
  const allowExtra = !!(opts && opts.allowExtra);
  const report = { added: [], removed: [], trimmed: 0 };

  const lastCol = sheet.getLastColumn();
  const currentHeaders = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h || '').trim(); })
    : [];

  // 1. 未知列を後ろから削除
  if (!allowExtra) {
    const expectedSet = new Set(expectedHeaders);
    for (let i = currentHeaders.length - 1; i >= 0; i--) {
      const h = currentHeaders[i];
      if (h && !expectedSet.has(h)) {
        sheet.deleteColumn(i + 1);
        report.removed.push(h);
        currentHeaders.splice(i, 1);
      }
    }
  }

  // 2. 不足列を末尾に追加
  const existingSet = new Set(currentHeaders.filter(Boolean));
  for (const h of expectedHeaders) {
    if (!existingSet.has(h)) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h);
      report.added.push(h);
    }
  }

  // 3. データ使用域より右の余剰列を削除（セル数節約）
  const usedCols = sheet.getLastColumn();
  const maxCols  = sheet.getMaxColumns();
  if (usedCols > 0 && maxCols > usedCols) {
    sheet.deleteColumns(usedCols + 1, maxCols - usedCols);
    report.trimmed = maxCols - usedCols;
  }

  return report;
}

function _logReconcile(sheetName, report) {
  if (report.added.length > 0)   Logger.log(sheetName + ': 列追加 → ' + report.added.join(', '));
  if (report.removed.length > 0) Logger.log(sheetName + ': 列削除 → ' + report.removed.join(', '));
  if (report.trimmed > 0)        Logger.log(sheetName + ': 余剰 ' + report.trimmed + ' 列を削除');
  if (!report.added.length && !report.removed.length && !report.trimmed) {
    Logger.log(sheetName + ': スキーマ変更なし');
  }
}

/**
 * Session.getActiveUser() で認証済みユーザーを取得し、admin_users シートで照合する。
 * 固定列（admin_id / email / role / is_active）以外の列名を cram_id として扱い、
 * その列値が TRUE のものを担当校舎とみなす。master は全列を担当とみなす。
 * @returns {{ email: string, role: string, cram_id: string, cram_ids: string[] }}
 */
function getAdminContext() {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('管理者ページには管理者専用 URL からアクセスしてください。Google アカウントでのログインが必要です。');

  const ss    = _getAdminSS();
  const sheet = ss.getSheetByName(ADMIN_USERS_SHEET);
  if (!sheet) throw new Error('admin_users シートが見つかりません。setupAdminSS() を実行してください。');

  const rows  = getRowsData(sheet);
  const admin = rows.find(r =>
    String(r.email || '').trim().toLowerCase() === email.toLowerCase() &&
    (r.is_active === true || String(r.is_active).trim() === '1' || String(r.is_active).trim() === 'true')
  );

  if (!admin) throw new Error('アクセス権限がありません。管理者に連絡してください。');

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const cramIdCols = headers
    .map(h => String(h || '').trim())
    .filter(h => h && !_ADMIN_FIXED_COLS.has(h));

  const role = String(admin.role || '').trim();
  const cram_ids = role === 'master'
    ? cramIdCols
    : cramIdCols.filter(col => {
        const val = admin[col];
        return val === true || String(val || '').trim().toUpperCase() === 'TRUE' || String(val || '').trim() === '1';
      });

  return {
    email:    email,
    name:     String(admin.name || '').trim(),
    role:     role,
    cram_id:  cram_ids[0] || '',
    cram_ids: cram_ids,
  };
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
 * admin_users / audit_log / liff_access_log / branches シートを親 SS に準備する。
 * 既存シートが存在する場合はスキーマを reconcile する（列の追加・削除・余剰列トリム）。
 * GAS エディタから手動実行する。
 */
function setupAdminSS() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── admin_users ──────────────────────────────────────────────────────────
  // 固定列のみを reconcile。cram_id 動的列は allowExtra:true で保持する。
  let adminSheet = ss.getSheetByName(ADMIN_USERS_SHEET);
  if (!adminSheet) {
    adminSheet = ss.insertSheet(ADMIN_USERS_SHEET);
    Logger.log('admin_users シートを作成しました。');
  }
  _logReconcile(ADMIN_USERS_SHEET,
    _reconcileSheetSchema(adminSheet, ['admin_id', 'email', 'name', 'role', 'is_active'], { allowExtra: true })
  );

  // ── audit_log ────────────────────────────────────────────────────────────
  let auditSheet = ss.getSheetByName(AUDIT_LOG_SHEET);
  if (!auditSheet) {
    auditSheet = ss.insertSheet(AUDIT_LOG_SHEET);
    Logger.log('audit_log シートを作成しました。');
  }
  _logReconcile(AUDIT_LOG_SHEET,
    _reconcileSheetSchema(auditSheet, ['timestamp', 'email', 'cram_id', 'action', 'detail', 'result'])
  );

  // ── liff_access_log ──────────────────────────────────────────────────────
  let liffSheet = ss.getSheetByName('liff_access_log');
  if (!liffSheet) {
    liffSheet = ss.insertSheet('liff_access_log');
    Logger.log('liff_access_log シートを作成しました。');
  }
  _logReconcile('liff_access_log',
    _reconcileSheetSchema(liffSheet, ['timestamp', 'line_user_id', 'result', 'student_id', 'cram_id', 'student_name'])
  );

  // ── branches ─────────────────────────────────────────────────────────────
  _ensureBranchesSheet(ss);

  // ── 実行者をマスター管理者として登録（未登録の場合のみ）────────────────
  const myEmail = Session.getActiveUser().getEmail();
  if (myEmail) {
    const rows   = getRowsData(adminSheet);
    const exists = rows.some(function(r) { return String(r.email || '').toLowerCase() === myEmail.toLowerCase(); });
    if (!exists) {
      const adminId = 'A' + Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
      adminSheet.appendRow([adminId, myEmail, '', 'master', true]);
      Logger.log('マスター管理者を登録しました: ' + myEmail);
    }
  }

  Logger.log('セットアップ完了');
}

// ---- 管理者ユーザー管理 ----

function getAdminUsers() {
  try {
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { error: '権限がありません' };
    const rows = getRowsData(_getAdminSS().getSheetByName(ADMIN_USERS_SHEET));
    return { success: true, adminUsers: stringifyDates(rows) };
  } catch (e) {
    return { error: e.message };
  }
}

function addAdminUser(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ctx   = getAdminContext();
    if (ctx.role !== 'master') return { error: '権限がありません' };

    const sheet = _getAdminSS().getSheetByName(ADMIN_USERS_SHEET);
    const rows  = getRowsData(sheet);
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email) return { error: 'メールアドレスを入力してください' };
    if (rows.some(r => String(r.email || '').trim().toLowerCase() === email)) {
      return { error: '既に登録されているメールアドレスです' };
    }

    const adminId = 'A' + Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
    sheet.appendRow([adminId, payload.email.trim(), String(payload.name || '').trim(), payload.role || 'branch_admin', true]);
    writeAuditLog(ctx, 'add_admin', { email: payload.email, name: payload.name, role: payload.role }, 'success');
    return { success: true };
  } catch (e) {
    return { error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function deactivateAdminUser(targetEmail) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ctx = getAdminContext();
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

function updateAdminUser(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { error: '権限がありません' };

    const sheet   = _getAdminSS().getSheetByName(ADMIN_USERS_SHEET);
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const emailCol = headers.indexOf('email') + 1;
    const nameCol  = headers.indexOf('name')  + 1;
    const roleCol  = headers.indexOf('role')  + 1;

    const target = String(payload.email || '').trim().toLowerCase();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][emailCol - 1] || '').trim().toLowerCase() === target) {
        if (payload.name !== undefined && nameCol > 0) sheet.getRange(i + 1, nameCol).setValue(String(payload.name || '').trim());
        if (payload.role !== undefined && roleCol > 0) sheet.getRange(i + 1, roleCol).setValue(payload.role);
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

// Node.js（Jest）でテストできるよう関数を global に公開する
// GAS では module が undefined のため、このブロックは実行されない
if (typeof module !== 'undefined') Object.assign(global, {
  ADMIN_USERS_SHEET, AUDIT_LOG_SHEET,
  getAdminContext, writeAuditLog, setupAdminSS,
  getAdminUsers, addAdminUser, deactivateAdminUser, updateAdminUser,
  _reconcileSheetSchema, _logReconcile,
});
