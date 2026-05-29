const BRANCHES_SHEET = 'branches';

// 子 SS の全シート定義（_createChildSheets / reconcileChildSchemas で共用）
const _CHILD_SHEET_DEFS = [
  { name: 'school_course_master', headers: ['school_name', 'school_course'] },
  { name: 'exam_patterns',        headers: ['pattern_id', 'school_name', 'school_course', 'grade', 'sub_course', 'term_test_id'] },
  { name: 'school_exam_periods',  headers: ['school_name', 'school_course', 'grade', 'sub_course', 'term_test_id', 'year', 'start_date', 'end_date'] },
  { name: 'pattern_subjects',     headers: ['pattern_id', 'subject_id'] },
  { name: 'scores_data',          headers: ['score_id', 'exam_id', 'student_id', 'subject_id', 'score', 'grade_rank', 'class_rank', 'update_at', 'not_taken', 'term_test_id', 'grade', 'year'] },
  { name: 'students_master',      headers: ['student_id', 'name', 'pronunciation', 'cram_id', 'school_name', 'school_course', 'sub_course', 'grade', 'is_active'] },
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

    // 子 SS を新規作成（親 SS と同じフォルダに配置）
    const branchName   = String(branch.branch_name || cramId).trim();
    const childSS      = SpreadsheetApp.create(`[子SS] ${cramId}_${branchName}`);
    const childSSId    = childSS.getId();
    const parentFolder = DriveApp.getFileById(parentSS.getId()).getParents().next();
    DriveApp.getFileById(childSSId).moveTo(parentFolder);

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
 * 子 SS のスキーマを現在の仕様（spreadsheet-schema.md）に一括移行する。
 * - exam_patterns: term_test_id 列を追加
 * - scores_data: raw_subject_name / genre_name をレガシー列として削除
 * - students_master: line_user_id があれば削除
 * - school_course_master: is_two_terms があれば削除
 * - exam_schedule シートはコードから未参照だが削除しない（ログで警告）
 * master 権限が必要。GAS エディタまたは管理画面から実行。
 * @param {string} cramId
 * @returns {{ success: boolean, results: object, warnings: string[] }}
 */
function migrateToCurrentSchema(cramId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: '権限がありません' };

    const warnings = [];

    // exam_schedule は廃止済みだがシート削除は手動対応
    const childSS = getChildSS(cramId);
    if (childSS.getSheetByName('exam_schedule')) {
      warnings.push('exam_schedule シートが残っています。確認後、手動で削除してください。');
      Logger.log('[migrateToCurrentSchema] WARNING: exam_schedule シートが残存しています。');
    }

    const reconcileResult = reconcileChildSchemas(cramId);
    if (!reconcileResult.success) return reconcileResult;

    writeAuditLog(ctx, 'migrate_to_current_schema', { cram_id: cramId }, 'success');
    return { success: true, results: reconcileResult.results, warnings };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * spreadsheet_id が設定済みのすべての子 SS に migrateToCurrentSchema を適用する。
 * master 権限が必要。GAS エディタから手動実行する。
 * @returns {{ success: boolean, total: number, succeeded: number, failed: number, details: object[] }}
 */
function migrateAllChildSchemas() {
  try {
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: '権限がありません' };

    const sheet    = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BRANCHES_SHEET);
    if (!sheet) return { success: false, error: 'branches シートが見つかりません' };

    const branches = getRowsData(sheet).filter(r => String(r.spreadsheet_id || '').trim());
    const details  = [];
    let succeeded  = 0;
    let failed     = 0;

    branches.forEach(function(branch) {
      const cramId = String(branch.cram_id || '').trim();
      Logger.log('[migrateAllChildSchemas] 処理中: ' + cramId);
      const result = migrateToCurrentSchema(cramId);
      if (result.success) {
        succeeded++;
      } else {
        failed++;
        Logger.log('[migrateAllChildSchemas] 失敗: ' + cramId + ' → ' + result.error);
      }
      details.push({ cram_id: cramId, ...result });
    });

    writeAuditLog(ctx, 'migrate_all_child_schemas', { total: branches.length, succeeded, failed }, 'success');
    Logger.log('[migrateAllChildSchemas] 完了: ' + succeeded + '/' + branches.length + ' 成功');
    return { success: true, total: branches.length, succeeded, failed, details };
  } catch (e) {
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
  _ensureBranchesSheet, _getTargetSS, _createChildSheets,
  reconcileChildSchemas, migrateToCurrentSchema, migrateAllChildSchemas,
});
