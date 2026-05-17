const BRANCHES_SHEET = 'branches';

/**
 * cram_id に対応する子 SS を返す。
 * branches シートで spreadsheet_id を引き、SpreadsheetApp.openById() で開く。
 * @param {string} cramId
 * @returns {Spreadsheet}
 */
function getChildSS(cramId) {
  if (!cramId) throw new Error('cram_id が指定されていません。');

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BRANCHES_SHEET);
  if (!sheet) throw new Error('branches シートが見つかりません。setupAdminSS() を実行してください。');

  const rows   = getRowsData(sheet);
  const branch = rows.find(r =>
    String(r.cram_id || '').trim() === String(cramId).trim() &&
    (r.is_active === true || String(r.is_active).trim() === '1' || String(r.is_active).trim() === 'true')
  );

  if (!branch) throw new Error(`校舎 "${cramId}" が branches シートに見つかりません。`);
  const ssId = String(branch.spreadsheet_id || '').trim();
  if (!ssId) throw new Error(`校舎 "${cramId}" の spreadsheet_id が未設定です。`);

  try {
    return SpreadsheetApp.openById(ssId);
  } catch (e) {
    throw new Error(`校舎 "${cramId}" のスプレッドシートを開けません: ${e.message}`);
  }
}

/**
 * branches 一覧を返す（master 管理者向け）。
 */
function getBranches() {
  try {
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: '権限がありません' };
    const sheet    = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BRANCHES_SHEET);
    const branches = sheet ? stringifyDates(getRowsData(sheet)) : [];
    return { success: true, branches };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 新規校舎を branches シートに登録する。
 * @param {{ cram_id: string, branch_name: string, spreadsheet_id: string }} payload
 */
function addBranch(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: '権限がありません' };

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BRANCHES_SHEET);
    if (!sheet) return { success: false, error: 'branches シートが見つかりません' };

    const cramId = String(payload.cram_id || '').trim();
    if (!cramId) return { success: false, error: 'cram_id を入力してください' };

    const rows = getRowsData(sheet);
    if (rows.some(r => String(r.cram_id || '').trim() === cramId)) {
      return { success: false, error: `cram_id "${cramId}" は既に登録されています` };
    }

    sheet.appendRow([cramId, payload.branch_name || '', payload.spreadsheet_id || '', true, new Date()]);
    writeAuditLog(ctx, 'add_branch', payload, 'success');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 既存校舎の情報を更新する（branch_name / spreadsheet_id / is_active）。
 */
function updateBranch(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: '権限がありません' };

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BRANCHES_SHEET);
    if (!sheet) return { success: false, error: 'branches シートが見つかりません' };

    const target  = String(payload.cram_id || '').trim();
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const cramIdCol      = headers.indexOf('cram_id')         + 1;
    const branchNameCol  = headers.indexOf('branch_name')     + 1;
    const spreadsheetCol = headers.indexOf('spreadsheet_id')  + 1;
    const isActiveCol    = headers.indexOf('is_active')       + 1;

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][cramIdCol - 1] || '').trim() !== target) continue;
      if (payload.branch_name    !== undefined && branchNameCol  > 0) sheet.getRange(i + 1, branchNameCol).setValue(payload.branch_name);
      if (payload.spreadsheet_id !== undefined && spreadsheetCol > 0) sheet.getRange(i + 1, spreadsheetCol).setValue(payload.spreadsheet_id);
      if (payload.is_active      !== undefined && isActiveCol    > 0) sheet.getRange(i + 1, isActiveCol).setValue(payload.is_active);
      writeAuditLog(ctx, 'update_branch', payload, 'success');
      return { success: true };
    }
    return { success: false, error: `cram_id "${target}" が見つかりません` };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * branches シートをメイン SS に作成する（setupAdminSS() から呼ぶ）。
 */
function _ensureBranchesSheet(ss) {
  if (!ss.getSheetByName(BRANCHES_SHEET)) {
    const sheet = ss.insertSheet(BRANCHES_SHEET);
    sheet.getRange(1, 1, 1, 5).setValues([[
      'cram_id', 'branch_name', 'spreadsheet_id', 'is_active', 'created_at'
    ]]);
    Logger.log('branches シートを作成しました。');
  } else {
    Logger.log('branches シートは既に存在します。');
  }
}
