const BRANCHES_SHEET = 'branches';

/**
 * スプレッドシートへの書き込み前にフォーミュラインジェクションを防ぐ。
 * 先頭が = + - @ | で始まる文字列はシングルクォートを付加して数式化を阻止する。
 * @param {*} val
 * @returns {string}
 */
function _sanitizeCell(val) {
  var s = String(val == null ? '' : val).trim();
  return /^[=+\-@|]/.test(s) ? "'" + s : s;
}

// 子 SS の全シート定義（_createChildSheets / reconcileChildSchemas で共用）
const _CHILD_SHEET_DEFS = [
  { name: 'school_course_master', headers: ['school_name', 'school_course'] },
  { name: 'exam_patterns',        headers: ['pattern_id', 'school_name', 'school_course', 'grade', 'sub_course', 'term_test_id'] },
  { name: 'school_exam_periods',  headers: ['school_name', 'school_course', 'grade', 'sub_course', 'term_test_id', 'year', 'start_date', 'end_date'] },
  { name: 'pattern_subjects',     headers: ['pattern_id', 'subject_id'] },
  { name: 'scores_data',          headers: ['score_id', 'exam_id', 'student_id', 'subject_id', 'score', 'grade_rank', 'class_rank', 'update_at', 'not_taken', 'term_test_id', 'grade', 'year'] },
  { name: 'students_master',      headers: ['student_id', 'name', 'pronunciation', 'cram_id', 'school_name', 'school_course', 'sub_course', 'grade', 'is_active'] },
  { name: 'upload_history',       headers: ['upload_id', 'student_id', 'term_test_id', 'test_name', 'grade', 'file_url', 'uploaded_at', 'thumbnail_b64'] },
];

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

    sheet.appendRow([cramId, _sanitizeCell(payload.branch_name), _sanitizeCell(payload.spreadsheet_id), true, new Date()]);
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
 * すべての子 SS にスキーマを適用する。スキーマ変更があった際に GAS エディタから手動実行する。
 * - spreadsheet_id が空の校舎 → 子 SS を新規作成（親 SS と同じフォルダに配置）
 * - spreadsheet_id が設定済みの校舎 → reconcileChildSchemas() でスキーマ最新化
 * master 権限が必要。
 * @returns {{ success: boolean, created: number, reconciled: number, failed: number, results: object[] }}
 */
function setupBranchSS() {
  try {
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: '権限がありません' };

    const parentSS = SpreadsheetApp.getActiveSpreadsheet();
    _ensureBranchesSheet(parentSS);
    const branchSheet = parentSS.getSheetByName(BRANCHES_SHEET);

    const rows = getRowsData(branchSheet);
    const results = [];
    let created = 0;
    let reconciled = 0;
    let failed = 0;

    rows.forEach(function(branch) {
      const cramId = String(branch.cram_id || '').trim();
      if (!cramId) return;

      try {
        if (!branch.spreadsheet_id || !String(branch.spreadsheet_id).trim()) {
          const result = _createBranchSS(parentSS, branchSheet, branch);
          results.push(Object.assign({ cram_id: cramId, action: 'created' }, result));
          writeAuditLog(ctx, 'setup_branch_ss', { cram_id: cramId, spreadsheet_id: result.spreadsheet_id }, 'success');
          created++;
        } else {
          const result = reconcileChildSchemas(cramId);
          results.push(Object.assign({ cram_id: cramId, action: 'reconciled' }, result));
          reconciled++;
        }
      } catch (e) {
        results.push({ cram_id: cramId, action: 'failed', error: e.message });
        failed++;
        Logger.log('[setupBranchSS] 失敗: ' + cramId + ' → ' + e.message);
      }
    });

    Logger.log('[setupBranchSS] 完了: 新規=' + created + ' reconcile=' + reconciled + ' 失敗=' + failed);
    return { success: true, created, reconciled, failed, results };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * cramId に対応する子 SS を新規作成し、branches シートの spreadsheet_id を更新する。
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} parentSS
 * @param {GoogleAppsScript.Spreadsheet.Sheet} branchSheet
 * @param {object} branch - branches シートの行オブジェクト
 * @returns {{ success: boolean, spreadsheet_id: string, url: string }}
 */
function _createBranchSS(parentSS, branchSheet, branch) {
  const cramId     = String(branch.cram_id).trim();
  const branchName = String(branch.branch_name || cramId).trim();

  const childSS      = SpreadsheetApp.create(`[子SS] ${cramId}_${branchName}`);
  const childSSId    = childSS.getId();
  const parentFolder = DriveApp.getFileById(parentSS.getId()).getParents().next();
  DriveApp.getFileById(childSSId).moveTo(parentFolder);

  const configSheet = childSS.getActiveSheet();
  configSheet.setName('config');
  configSheet.getRange(1, 1, 3, 2).setValues([
    ['CRAM_ID',      cramId],
    ['PARENT_SS_ID', parentSS.getId()],
    ['BRANCH_NAME',  branchName],
  ]);

  _createChildSheets(childSS);

  const data      = branchSheet.getDataRange().getValues();
  const headers   = data[0];
  const cramIdCol = headers.indexOf('cram_id') + 1;
  const ssIdCol   = headers.indexOf('spreadsheet_id') + 1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][cramIdCol - 1] || '').trim() === cramId) {
      branchSheet.getRange(i + 1, ssIdCol).setValue(childSSId);
      break;
    }
  }

  return { success: true, spreadsheet_id: childSSId, url: childSS.getUrl() };
}

/**
 * 子 SS に必要なシートとヘッダーを作成する。
 */
function _createChildSheets(ss) {
  const defs = _CHILD_SHEET_DEFS;
  defs.forEach(function({ name, headers }) {
    const sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    const maxCols = sheet.getMaxColumns();
    if (maxCols > headers.length) {
      sheet.deleteColumns(headers.length + 1, maxCols - headers.length);
    }
  });
}

/**
 * 既存の子 SS の全シートを期待スキーマに reconcile する。
 * 不足列の追加・余計列の削除・余剰列のトリムを行う。
 * master 権限が必要。GAS エディタから手動実行する。
 * @param {string} cramId
 */
function reconcileChildSchemas(cramId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: '権限がありません' };

    const childSS = getChildSS(cramId);
    const results = {};

    _CHILD_SHEET_DEFS.forEach(function({ name, headers }) {
      let sheet = childSS.getSheetByName(name);
      if (!sheet) {
        sheet = childSS.insertSheet(name);
        Logger.log(name + ': シートを新規作成しました');
      }
      const report = _reconcileSheetSchema(sheet, headers);
      results[name] = report;
      _logReconcile(name, report);
    });

    // config は行ベースの KV シートのため列ヘッダー reconcile は行わない。
    // A/B 列のみ残し、余剰列があれば削除する。
    const configSheet = childSS.getSheetByName('config');
    if (configSheet) {
      const maxCols = configSheet.getMaxColumns();
      if (maxCols > 2) {
        configSheet.deleteColumns(3, maxCols - 2);
        results['config'] = { exists: true, trimmed: maxCols - 2 };
        Logger.log('config: 余剰 ' + (maxCols - 2) + ' 列を削除');
      } else {
        results['config'] = { exists: true, trimmed: 0 };
        Logger.log('config: 存在確認 OK');
      }
    } else {
      results['config'] = { exists: false, note: 'シートが見つかりません。setupBranchSS() を実行してください。' };
      Logger.log('config: シートが見つかりません。setupBranchSS() を実行してください。');
    }

    writeAuditLog(ctx, 'reconcile_child_schemas', { cram_id: cramId }, 'success');
    return { success: true, results };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
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
  let sheet = ss.getSheetByName(BRANCHES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(BRANCHES_SHEET);
    Logger.log('branches シートを作成しました。');
  }
  _logReconcile(BRANCHES_SHEET,
    _reconcileSheetSchema(sheet, ['cram_id', 'branch_name', 'spreadsheet_id', 'is_active', 'created_at'])
  );
}

// Node.js（Jest）でテストできるよう関数を global に公開する
if (typeof module !== 'undefined') Object.assign(global, {
  BRANCHES_SHEET, _CHILD_SHEET_DEFS,
  getChildSS, getBranches, addBranch, updateBranch, setupBranchSS,
  _ensureBranchesSheet, _getTargetSS, _createChildSheets, _createBranchSS,
  reconcileChildSchemas, _sanitizeCell,
});
