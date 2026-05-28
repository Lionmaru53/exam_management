function generateUniqueId(prefix) {
  return prefix + Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
}

/**
 * school_exam_periods への日程保存（学校単位 upsert）。
 * payload: { schoolName, termTestId, year, startDate, endDate }
 * startDate / endDate が null/'' → 該当行を削除。
 */
function saveSchoolExamPeriod(cramId, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const childSS = getChildSS(cramId);
    const sheet   = childSS.getSheetByName('school_exam_periods');
    if (!sheet) throw new Error('school_exam_periods シートが見つかりません。setupBranchSS() を実行してください。');

    const sn  = String(payload.schoolName  || '').trim();
    const tid = String(payload.termTestId  || '').trim();
    const yr  = String(payload.year        || '');
    if (!sn || !tid || !yr) return { success: false, error: '必須パラメータが不足しています' };

    // school-level 行（course/grade/sub_course がすべて空）を逆順で削除
    const data    = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    const col     = function(k) { return headers.indexOf(k); };

    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      if (String(row[col('school_name')]   || '').trim() === sn
       && String(row[col('school_course')] || '').trim() === ''
       && String(row[col('grade')]         || '').trim() === ''
       && String(row[col('sub_course')]    || '').trim() === ''
       && String(row[col('term_test_id')]  || '').trim() === tid
       && String(row[col('year')]          || '')         === yr) {
        sheet.deleteRow(i + 1);
      }
    }

    if (payload.startDate && payload.endDate) {
      sheet.appendRow([sn, '', '', '', tid, Number(yr), payload.startDate, payload.endDate]);
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * exam_patterns への新規パターン追加
 * payload: { school_name, school_course, grade, sub_course }
 */
function addNewPattern(cramId, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sc = _normalizeCourseName(payload.school_course || '');
    if (!sc) return { success: false, error: 'コース名は必須です（空文字は不可）' };

    const ss    = _getTargetSS(cramId);
    const sheet = ss.getSheetByName('exam_patterns');
    const rows  = getRowsData(sheet);

    const exists = rows.some(row =>
      String(row.school_name   || '').trim() === String(payload.school_name).trim() &&
      String(row.school_course || '').trim() === sc &&
      String(row.grade         || '').trim() === String(payload.grade).trim() &&
      String(row.sub_course    || '').trim() === String(payload.sub_course || '').trim()
    );
    if (exists) return { success: false, error: '既に登録済みのパターンです' };

    const newPatternId = generateUniqueId('P');
    sheet.appendRow([
      newPatternId,
      payload.school_name,
      sc,
      payload.grade,
      payload.sub_course || ''
    ]);

    return { success: true, pattern_id: newPatternId };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * pattern_subjects の更新（全削除→再登録）
 */
function updatePatternSubjects(patternId, selectedIds, newSubjectName, genreName) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const psSheet = ss.getSheetByName('pattern_subjects');

    const currentSelectedIds = Array.isArray(selectedIds) ? selectedIds.slice() : [];

    if (newSubjectName && newSubjectName.trim() !== '') {
      const addResult = addNewSubject(patternId, newSubjectName.trim(), genreName || '');
      if (!addResult.success) return addResult;
      currentSelectedIds.push(addResult.subject_id);
    }

    const psData = psSheet.getDataRange().getValues();
    for (let i = psData.length - 1; i >= 1; i--) {
      if (String(psData[i][0]) === String(patternId)) {
        psSheet.deleteRow(i + 1);
      }
    }
    currentSelectedIds.forEach(subjectId => {
      psSheet.appendRow([patternId, subjectId]);
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * subjects_master への新規教科追加
 */
function addNewSubject(patternId, newSubjectName, genreName, grade) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const subjectsSheet = ss.getSheetByName('subjects_master');
    if (!subjectsSheet) return { success: false, error: 'subjects_master シートが見つかりません' };

    const genresSheet = ss.getSheetByName('genres_master');
    let genreId = '';
    if (genresSheet) {
      const genreRows = getRowsData(genresSheet);
      const genre = genreRows.find(g => String(g.genre_name || '').trim() === String(genreName || '').trim());
      genreId = genre ? genre.genre_id : '';
    }

    const newSubjectId = generateUniqueId('S');
    subjectsSheet.appendRow([newSubjectId, newSubjectName, genreId, grade || '', '']);

    return { success: true, subject_id: newSubjectId };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

if (typeof module !== 'undefined') Object.assign(global, {
  generateUniqueId, saveSchoolExamPeriod, addNewPattern, updatePatternSubjects,
  addNewSubject, initializeDefaultPatterns, batchSetGroupSubjects,
});

/**
 * デフォルト初期化: 5組み合わせ（高1/''/高2-3/文系・理系）のパターンを確保し
 * デフォルト教科を設定する。
 * payload: { school_name, school_course }
 */
function initializeDefaultPatterns(cramId, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ctx = getAdminContext();
    const ctxCramIds = ctx.cram_ids || [];
    if (ctx.role !== 'master' && !ctxCramIds.includes(String(cramId || '').trim())) {
      return { success: false, error: '権限がありません' };
    }

    const ss = getChildSS(cramId);
    const sn = String(payload.school_name   || '').trim();
    const sc = String(payload.school_course || '').trim();
    if (!sn || !sc) return { success: false, error: '学校名とコース名を指定してください' };

    _autoCreateAllPatterns(ss, sn, sc);
    writeAuditLog(ctx, 'initialize_default_patterns',
      { cramId, school_name: sn, school_course: sc }, 'success');
    return { success: true };
  } catch (e) {
    console.error('initializeDefaultPatterns error:', e);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * グループ教科設定: (school_name, school_course, grade, sub_course) の1パターンに教科を設定
 * payload: { school_name, school_course, grade, sub_course, selected_subject_ids }
 */
function batchSetGroupSubjects(cramId, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss       = _getTargetSS(cramId);
    const patSheet = ss.getSheetByName('exam_patterns');
    const psSheet  = ss.getSheetByName('pattern_subjects');

    const sn  = String(payload.school_name   || '').trim();
    const sc  = String(payload.school_course || '').trim();
    const gr  = String(payload.grade         || '').trim();
    const sub = String(payload.sub_course    || '').trim();

    const patternRows = getRowsData(patSheet);
    const pattern = patternRows.find(p =>
      String(p.school_name   || '').trim() === sn &&
      String(p.school_course || '').trim() === sc &&
      String(p.grade         || '').trim() === gr &&
      String(p.sub_course    || '').trim() === sub
    );
    if (!pattern) return { success: false, error: 'パターンが見つかりません' };

    const patternId = String(pattern.pattern_id);
    const psData    = psSheet.getDataRange().getValues();
    for (let i = psData.length - 1; i >= 1; i--) {
      if (String(psData[i][0]) === patternId) psSheet.deleteRow(i + 1);
    }
    for (const subjectId of (payload.selected_subject_ids || [])) {
      psSheet.appendRow([patternId, subjectId]);
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

