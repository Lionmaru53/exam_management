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
  const defs = [
    { name: 'school_course_master',    headers: ['school_name', 'school_course'] },
    { name: 'exam_patterns',           headers: ['pattern_id', 'school_name', 'school_course', 'grade', 'sub_course'] },
    { name: 'school_exam_periods',     headers: ['school_name', 'school_course', 'grade', 'sub_course', 'term_test_id', 'year', 'start_date', 'end_date'] },
    { name: 'pattern_subjects',        headers: ['pattern_id', 'subject_id'] },
    { name: 'scores_data',             headers: ['score_id', 'exam_id', 'student_id', 'subject_id', 'score', 'grade_rank', 'class_rank', 'update_at', 'not_taken'] },
    { name: 'students_master',         headers: ['student_id', 'name', 'pronunciation', 'cram_id', 'school_name', 'school_course', 'sub_course', 'grade', 'is_active'] },
  ];
  defs.forEach(({ name, headers }) => {
    const sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  });
}

/**
 * 既存子 SS の exam_patterns スキーマを新設計（term_test_id 除去）に移行する。
 * 実行前に必ずバックアップを確認すること。
 * @param {string} cramId
 */
function migratePatternSchema(cramId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: '権限がありません' };

    const childSS = getChildSS(cramId);

    // Step 1: バックアップシートを作成
    ['exam_patterns', 'exam_schedule', 'pattern_subjects'].forEach(name => {
      const src = childSS.getSheetByName(name);
      if (!src) return;
      const bkName = name + '_bk';
      const existing = childSS.getSheetByName(bkName);
      if (existing) childSS.deleteSheet(existing);
      src.copyTo(childSS).setName(bkName);
    });

    const patSheet    = childSS.getSheetByName('exam_patterns');
    const schedSheet  = childSS.getSheetByName('exam_schedule');
    const psSheet     = childSS.getSheetByName('pattern_subjects');
    const scoresSheet = childSS.getSheetByName('scores_data');

    if (!patSheet) return { success: false, error: 'exam_patterns シートが見つかりません' };

    // Step 2: exam_patterns をグループ化し代表 pattern_id を選出
    const patterns     = getRowsData(patSheet);
    const groupMap     = {};
    const obsoleteRows = [];

    patterns.forEach(p => {
      const sn  = String(p.school_name   || '').trim();
      const sc  = String(p.school_course || '').trim();
      const gr  = String(p.grade         || '').trim();
      const sub = String(p.sub_course    || '').trim();
      const pid = String(p.pattern_id    || '').trim();
      const tid = String(p.term_test_id  || '').trim();

      if (!sc) {
        obsoleteRows.push([pid, sn, sc, gr, sub, tid]);
        return;
      }
      const key = `${sn}||${sc}||${gr}||${sub}`;
      if (!groupMap[key]) {
        groupMap[key] = { repId: pid, patternIds: [pid], school: sn, course: sc, grade: gr, sub };
      } else {
        groupMap[key].patternIds.push(pid);
      }
    });

    // oldPatternId → { repId, termTestId } のマップを構築
    const idToGroup = {};
    Object.values(groupMap).forEach(g => {
      g.patternIds.forEach(pid => {
        const orig = patterns.find(p => String(p.pattern_id || '').trim() === pid);
        idToGroup[pid] = { repId: g.repId, termTestId: orig ? String(orig.term_test_id || '').trim() : '' };
      });
    });

    // Step 3: exam_schedule に term_test_id を補完してリマップ（5列 → 6列）
    if (schedSheet) {
      const schedData    = schedSheet.getDataRange().getValues();
      const schedHeaders = schedData[0];
      if (!schedHeaders.includes('term_test_id')) {
        const pidIdx  = schedHeaders.indexOf('pattern_id');
        const yearIdx = schedHeaders.indexOf('year');
        const sdIdx   = schedHeaders.indexOf('start_date');
        const edIdx   = schedHeaders.indexOf('end_date');
        const newRows = [['exam_id', 'pattern_id', 'term_test_id', 'year', 'start_date', 'end_date']];
        for (let i = 1; i < schedData.length; i++) {
          const row = schedData[i];
          if (!row[0]) continue;
          const oldPid   = String(row[pidIdx]  || '').trim();
          const mapping  = idToGroup[oldPid];
          newRows.push([
            row[0],
            mapping ? mapping.repId      : oldPid,
            mapping ? mapping.termTestId : '',
            yearIdx >= 0 ? row[yearIdx] : '',
            sdIdx   >= 0 ? row[sdIdx]   : '',
            edIdx   >= 0 ? row[edIdx]   : ''
          ]);
        }
        schedSheet.clearContents();
        if (newRows.length > 0)
          schedSheet.getRange(1, 1, newRows.length, 6).setValues(newRows);
      }
    }

    // Step 4: pattern_subjects を代表 pattern_id にマージ（重複除去）
    if (psSheet) {
      const psData    = psSheet.getDataRange().getValues();
      const psHeaders = psData[0];
      const psPidIdx  = psHeaders.indexOf('pattern_id');
      const psSubIdx  = psHeaders.indexOf('subject_id');
      const seen      = new Set();
      const newPsRows = [['pattern_id', 'subject_id']];
      for (let i = 1; i < psData.length; i++) {
        const row    = psData[i];
        const oldPid = String(row[psPidIdx] || '').trim();
        const sid    = String(row[psSubIdx]  || '').trim();
        if (!oldPid || !sid) continue;
        const mapping = idToGroup[oldPid];
        const newPid  = mapping ? mapping.repId : oldPid;
        const key     = `${newPid}||${sid}`;
        if (!seen.has(key)) {
          seen.add(key);
          newPsRows.push([newPid, sid]);
        }
      }
      psSheet.clearContents();
      if (newPsRows.length > 0)
        psSheet.getRange(1, 1, newPsRows.length, 2).setValues(newPsRows);
    }

    // Step 5: exam_patterns シートを5列で書き直し
    const newPatRows = [['pattern_id', 'school_name', 'school_course', 'grade', 'sub_course']];
    Object.values(groupMap).forEach(g => {
      newPatRows.push([g.repId, g.school, g.course, g.grade, g.sub]);
    });
    patSheet.clearContents();
    if (newPatRows.length > 0)
      patSheet.getRange(1, 1, newPatRows.length, 5).setValues(newPatRows);

    // 空コースパターンを別シートに退避
    if (obsoleteRows.length > 0) {
      let obsSheet = childSS.getSheetByName('exam_patterns_obsolete');
      if (!obsSheet) {
        obsSheet = childSS.insertSheet('exam_patterns_obsolete');
        obsSheet.getRange(1, 1, 1, 6).setValues([['pattern_id', 'school_name', 'school_course', 'grade', 'sub_course', 'term_test_id']]);
      }
      obsSheet.getRange(obsSheet.getLastRow() + 1, 1, obsoleteRows.length, 6).setValues(obsoleteRows);
    }

    // Step 6: exam_subject_exclusions シートを新規作成
    if (!childSS.getSheetByName('exam_subject_exclusions')) {
      const exSheet = childSS.insertSheet('exam_subject_exclusions');
      exSheet.getRange(1, 1, 1, 3).setValues([['exam_id', 'subject_id', 'updated_at']]);
    }

    // Step 7: scores_data に not_taken 列を追加（既存行は空文字のまま）
    if (scoresSheet && scoresSheet.getLastColumn() > 0) {
      const scHeaders = scoresSheet.getRange(1, 1, 1, scoresSheet.getLastColumn()).getValues()[0];
      if (!scHeaders.includes('not_taken')) {
        scoresSheet.getRange(1, scoresSheet.getLastColumn() + 1).setValue('not_taken');
      }
    }

    writeAuditLog(ctx, 'migrate_pattern_schema', { cram_id: cramId }, 'success');
    const groups = Object.values(groupMap);
    return {
      success: true,
      groupCount: groups.length,
      obsoleteCount: obsoleteRows.length,
      message: `マイグレーション完了: ${groups.length} グループ, 廃止パターン ${obsoleteRows.length} 件`
    };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
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
      const val        = r[targetCramId];
      const isAssigned = val === true || String(val || '').trim().toUpperCase() === 'TRUE' || String(val || '').trim() === '1';
      return isAssigned &&
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
  _ensureBranchesSheet, _getTargetSS, _createChildSheets, migratePatternSchema,
});
