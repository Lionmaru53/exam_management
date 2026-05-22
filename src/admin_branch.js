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

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    _ensureBranchesSheet(ss);
    const sheet = ss.getSheetByName(BRANCHES_SHEET);

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

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    _ensureBranchesSheet(ss);
    const sheet = ss.getSheetByName(BRANCHES_SHEET);

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
 * 校舎の子 SS を新規作成し、必要なシートを初期化する。
 * branches シートの spreadsheet_id を自動更新する。
 * @param {string} cramId
 */
function setupBranchSS(cramId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: '権限がありません' };

    const parentSS    = SpreadsheetApp.getActiveSpreadsheet();
    _ensureBranchesSheet(parentSS);
    const branchSheet = parentSS.getSheetByName(BRANCHES_SHEET);

    const rows   = getRowsData(branchSheet);
    const branch = rows.find(r => String(r.cram_id || '').trim() === String(cramId).trim());
    if (!branch) return { success: false, error: `cram_id "${cramId}" が見つかりません。先に「＋ 校舎を追加」で校舎を登録してください。` };

    if (branch.spreadsheet_id && String(branch.spreadsheet_id).trim()) {
      return { success: false, error: '既に子 SS が設定されています。上書きする場合は編集ボタンから spreadsheet_id を変更してください。' };
    }

    // 子 SS を新規作成
    const branchName = String(branch.branch_name || cramId).trim();
    const childSS    = SpreadsheetApp.create(`[子SS] ${branchName}`);
    const childSSId  = childSS.getId();

    // config シート（デフォルトシートを改名して使用）
    const configSheet = childSS.getActiveSheet();
    configSheet.setName('config');
    configSheet.getRange(1, 1, 3, 2).setValues([
      ['CRAM_ID',      cramId],
      ['PARENT_SS_ID', parentSS.getId()],
      ['BRANCH_NAME',  branchName]
    ]);

    // 業務データシートを作成
    _createChildSheets(childSS);

    // branches シートの spreadsheet_id を更新
    const data      = branchSheet.getDataRange().getValues();
    const headers   = data[0];
    const cramIdCol = headers.indexOf('cram_id') + 1;
    const ssIdCol   = headers.indexOf('spreadsheet_id') + 1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][cramIdCol - 1] || '').trim() === String(cramId).trim()) {
        branchSheet.getRange(i + 1, ssIdCol).setValue(childSSId);
        break;
      }
    }

    writeAuditLog(ctx, 'setup_branch_ss', { cram_id: cramId, spreadsheet_id: childSSId }, 'success');
    return { success: true, spreadsheet_id: childSSId, url: childSS.getUrl(), sharedEmails: [] };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 子 SS に必要なシートとヘッダーを作成する。
 */
function _createChildSheets(ss) {
  const defs = [
    { name: 'school_course_master', headers: ['school_name', 'school_course', 'is_two_terms'] },
    { name: 'exam_patterns',     headers: ['pattern_id', 'school_name', 'school_course', 'grade', 'sub_course', 'term_test_id'] },
    { name: 'exam_schedule',     headers: ['exam_id', 'pattern_id', 'year', 'start_date', 'end_date'] },
    { name: 'pattern_subjects',  headers: ['pattern_id', 'subject_id'] },
    { name: 'scores_data',       headers: ['score_id', 'exam_id', 'student_id', 'subject_id', 'score', 'grade_rank', 'class_rank', 'update_at'] },
    { name: 'students_master',   headers: ['student_id', 'name', 'pronunciation', 'cram_id', 'school_name', 'school_course', 'sub_course', 'grade', 'line_user_id', 'is_active'] },
    { name: 'students_branch',   headers: ['student_id', 'grade', 'is_active'] }
  ];
  defs.forEach(({ name, headers }) => {
    const sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  });
}

/**
 * 子 SS を admin_users の対象校舎管理者へ共有する（DriveApp スコープが必要）。
 * setupBranchSS() とは分離して独立して呼び出す。
 * @param {string} cramId
 */
function shareBranchSS(cramId) {
  try {
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: '権限がありません' };

    const parentSS    = SpreadsheetApp.getActiveSpreadsheet();
    const branchSheet = parentSS.getSheetByName(BRANCHES_SHEET);
    if (!branchSheet) return { success: false, error: 'branches シートが見つかりません' };

    const rows   = getRowsData(branchSheet);
    const branch = rows.find(r => String(r.cram_id || '').trim() === String(cramId).trim());
    if (!branch)                       return { success: false, error: `cram_id "${cramId}" が見つかりません` };
    if (!branch.spreadsheet_id)        return { success: false, error: '先に子 SS を作成してください' };

    const adminSheet = parentSS.getSheetByName(ADMIN_USERS_SHEET);
    if (!adminSheet) return { success: false, error: 'admin_users シートが見つかりません' };

    const adminRows    = getRowsData(adminSheet);
    const targetCramId = String(cramId).trim();
    const targetAdmins = adminRows.filter(r => {
      const ids = String(r.cram_id || '').split(',').map(s => s.trim()).filter(Boolean);
      return ids.includes(targetCramId) &&
        r.role === 'branch_admin' &&
        (r.is_active === true || String(r.is_active).trim() === '1' || String(r.is_active).trim() === 'true');
    });

    if (targetAdmins.length === 0) return { success: false, error: 'この校舎に有効な校舎管理者が登録されていません' };

    const file         = DriveApp.getFileById(String(branch.spreadsheet_id).trim());
    const sharedEmails = [];
    targetAdmins.forEach(r => {
      try {
        file.addEditor(String(r.email).trim());
        sharedEmails.push(String(r.email).trim());
      } catch (e) {
        console.error('共有失敗:', r.email, e.message);
      }
    });

    writeAuditLog(ctx, 'share_branch_ss', { cram_id: cramId, shared: sharedEmails }, 'success');
    return { success: true, sharedEmails };
  } catch (e) {
    console.error('shareBranchSS error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * cramId から対象子 SS を取得するヘルパー。
 * master は cramId を明示、branch_admin は adminContext.cram_id を使用。
 */
function _getTargetSS(cramId) {
  const cid = cramId || '';
  if (!cid) throw new Error('校舎が選択されていません。校舎セレクターで校舎を選択してください。');
  return getChildSS(cid);
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

// Node.js（Jest）でテストできるよう関数を global に公開する
if (typeof module !== 'undefined') Object.assign(global, {
  BRANCHES_SHEET,
  getChildSS, getBranches, addBranch, updateBranch, setupBranchSS, shareBranchSS,
  _ensureBranchesSheet, _getTargetSS,
});
