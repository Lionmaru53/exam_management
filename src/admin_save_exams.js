function generateUniqueId(prefix) {
  return prefix + Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
}

/**
 * exam_schedule への日程保存（upsert）
 * payload: { exam_id, pattern_id, year, start_date, end_date }
 */
function updateExamData(cramId, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = _getTargetSS(cramId);
    const sheet = ss.getSheetByName('exam_schedule');
    const data = sheet.getDataRange().getValues();

    let rowIndex = -1;
    let examId = payload.exam_id;

    if (examId && examId !== '') {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(examId)) {
          rowIndex = i + 1;
          break;
        }
      }
    }

    if (rowIndex < 0 && payload.pattern_id && payload.year) {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][1]) === String(payload.pattern_id) &&
            String(data[i][2]) === String(payload.year)) {
          rowIndex = i + 1;
          examId = String(data[i][0]);
          break;
        }
      }
    }

    if (!examId) {
      examId = generateUniqueId('EX');
    }

    const rowValues = [
      examId,
      payload.pattern_id || '',
      payload.year || '',
      payload.start_date || '',
      payload.end_date || ''
    ];

    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }

    return { success: true, exam_id: examId };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * exam_patterns への新規パターン追加
 * payload: { school_name, school_course, grade, sub_course, term_test_id }
 */
function addNewPattern(cramId, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = _getTargetSS(cramId);
    const sheet = ss.getSheetByName('exam_patterns');
    const rows = getRowsData(sheet);

    const exists = rows.some(row =>
      String(row.school_name).trim() === String(payload.school_name).trim() &&
      String(row.school_course).trim() === String(payload.school_course).trim() &&
      String(row.term_test_id).trim() === String(payload.term_test_id).trim() &&
      String(row.grade).trim() === String(payload.grade).trim() &&
      String(row.sub_course || '').trim() === String(payload.sub_course || '').trim()
    );

    if (exists) {
      return { success: false, error: '既に登録済みのパターンです' };
    }

    const newPatternId = generateUniqueId('P');
    sheet.appendRow([
      newPatternId,
      payload.school_name,
      payload.school_course,
      payload.grade,
      payload.sub_course || '',
      payload.term_test_id
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
      if (!addResult.success) {
        return addResult;
      }
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
    if (!subjectsSheet) {
      return { success: false, error: 'subjects_master シートが見つかりません' };
    }

    const genresSheet = ss.getSheetByName('genres_master');
    let genreId = '';
    if (genresSheet) {
      const genreRows = getRowsData(genresSheet);
      const genre = genreRows.find(g => String(g.genre_name || '').trim() === String(genreName || '').trim());
      genreId = genre ? genre.genre_id : '';
    }

    const newSubjectId = generateUniqueId('S');
    subjectsSheet.appendRow([newSubjectId, newSubjectName, genreId, grade || '']);

    return { success: true, subject_id: newSubjectId };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

globalThis.addNewSubject = addNewSubject;

/**
 * 試験パターンのデフォルト初期化
 * - 未登録の試験区分に exam_patterns を追加し、各ジャンルの先頭教科を pattern_subjects に設定
 * - school_term_test_settings の未登録エントリを is_active=1 で追加
 * payload: { school_name, school_course, sub_course, grade }
 */
function initializeDefaultPatterns(cramId, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ctx        = getAdminContext();
    const ctxCramIds = ctx.cram_ids || [];
    if (ctx.role !== 'master' && !ctxCramIds.includes(String(cramId || '').trim())) {
      return { success: false, error: '権限がありません' };
    }

    const parentSS = SpreadsheetApp.getActiveSpreadsheet();
    const childSS  = getChildSS(cramId);

    const sn  = String(payload.school_name   || '').trim();
    const sc  = String(payload.school_course || '').trim();
    const sub = String(payload.sub_course    || '').trim();
    const gr  = String(payload.grade         || '').trim();

    // term_tests_master
    const ttSheet = parentSS.getSheetByName('term_tests_master');
    if (!ttSheet) return { success: false, error: 'term_tests_master が見つかりません' };
    const allTermTestIds = getRowsData(ttSheet)
      .map(r => String(r.term_test_id || '').trim()).filter(Boolean);

    // subjects_master: grade 一致 × 各ジャンルの先頭教科 ID
    const subSheet       = parentSS.getSheetByName('subjects_master');
    const defaultSubjectIds = [];
    if (subSheet) {
      const genreCount = new Map();
      getRowsData(subSheet).forEach(s => {
        const gid = String(s.genre_id   || '').trim();
        const sid = String(s.subject_id || '').trim();
        const sgr = String(s.grade      || '').trim();
        if (sgr === gr && gid && sid) {
          const cnt = genreCount.get(gid) || 0;
          if (cnt < 2) {
            genreCount.set(gid, cnt + 1);
            defaultSubjectIds.push(sid);
          }
        }
      });
    }

    // 既存 exam_patterns から未登録の term_test_id を特定
    const patSheet = childSS.getSheetByName('exam_patterns');
    if (!patSheet) return { success: false, error: 'exam_patterns シートが見つかりません' };
    const existingPats  = getRowsData(patSheet);
    const missingTtIds  = allTermTestIds.filter(ttId => !existingPats.some(p =>
      String(p.school_name   || '').trim() === sn  &&
      String(p.school_course || '').trim() === sc  &&
      String(p.sub_course    || '').trim() === sub &&
      String(p.grade         || '').trim() === gr  &&
      String(p.term_test_id  || '').trim() === ttId
    ));

    // exam_patterns 追加
    const newPatternIds = [];
    if (missingTtIds.length > 0) {
      const base   = Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
      const newRows = missingTtIds.map((ttId, i) => {
        const pid = 'P' + base + String(i + 1).padStart(2, '0');
        newPatternIds.push(pid);
        return [pid, sn, sc, gr, sub, ttId];
      });
      patSheet.getRange(patSheet.getLastRow() + 1, 1, newRows.length, 6).setValues(newRows);
    }

    // pattern_subjects: デフォルト教科を追加
    if (newPatternIds.length > 0 && defaultSubjectIds.length > 0) {
      const psSheet = childSS.getSheetByName('pattern_subjects');
      if (psSheet) {
        const psRows = [];
        newPatternIds.forEach(pid => defaultSubjectIds.forEach(sid => psRows.push([pid, sid])));
        psSheet.getRange(psSheet.getLastRow() + 1, 1, psRows.length, 2).setValues(psRows);
      }
    }

    // school_term_test_settings: 未設定のエントリを is_active=1 で追加
    const sttSheet = _ensureSchoolTermTestSettingsSheet(parentSS);
    const sttData  = sttSheet.getDataRange().getValues();
    const sttHdrs  = sttData[0].map(h => String(h).trim());
    const sttSnCol = sttHdrs.indexOf('school_name');
    const sttTtCol = sttHdrs.indexOf('term_test_id');
    const sttIaCol = sttHdrs.indexOf('is_active');
    const sttDnCol = sttHdrs.indexOf('display_name');
    const sttUtCol = sttHdrs.indexOf('updated_at');

    const existingSttSet = new Set();
    for (let i = 1; i < sttData.length; i++) {
      if (String(sttData[i][sttSnCol] || '').trim() === sn) {
        existingSttSet.add(String(sttData[i][sttTtCol] || '').trim());
      }
    }
    const newSttRows = allTermTestIds
      .filter(ttId => !existingSttSet.has(ttId))
      .map(ttId => {
        const row = sttHdrs.map(() => '');
        if (sttSnCol >= 0) row[sttSnCol] = sn;
        if (sttTtCol >= 0) row[sttTtCol] = ttId;
        if (sttIaCol >= 0) row[sttIaCol] = '1';
        if (sttDnCol >= 0) row[sttDnCol] = '';
        if (sttUtCol >= 0) row[sttUtCol] = new Date();
        return row;
      });
    if (newSttRows.length > 0) {
      sttSheet.getRange(sttSheet.getLastRow() + 1, 1, newSttRows.length, sttHdrs.length).setValues(newSttRows);
    }

    writeAuditLog(ctx, 'initialize_default_patterns',
      { cramId, school_name: sn, school_course: sc, sub_course: sub, grade: gr, addedPatterns: newPatternIds.length },
      'success');
    return { success: true, addedPatterns: newPatternIds.length, addedStt: newSttRows.length };

  } catch (e) {
    console.error('initializeDefaultPatterns error:', e);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * グループ一括教科設定: 同じ学校・コース・学年・サブ区分の全試験区分に同じ教科を設定
 * payload: { school_name, school_course, grade, sub_course, term_test_ids, selected_subject_ids }
 */
function batchSetGroupSubjects(cramId, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss          = _getTargetSS(cramId);
    const patSheet    = ss.getSheetByName('exam_patterns');
    const psSheet     = ss.getSheetByName('pattern_subjects');
    const patternRows = getRowsData(patSheet);
    const patternIds  = [];

    const sn  = String(payload.school_name  || '').trim();
    const sc  = String(payload.school_course || '').trim();
    const gr  = String(payload.grade        || '').trim();
    const sub = String(payload.sub_course   || '').trim();

    // 同一秒内の複数作成でも重複しないよう連番サフィックスを付与
    const base = Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
    let idCounter = 0;

    for (const termTestId of payload.term_test_ids) {
      const existing = patternRows.find(p =>
        String(p.school_name  || '').trim() === sn &&
        String(p.school_course || '').trim() === sc &&
        String(p.grade        || '').trim() === gr &&
        String(p.sub_course   || '').trim() === sub &&
        String(p.term_test_id || '').trim() === String(termTestId).trim()
      );
      if (existing) {
        patternIds.push(String(existing.pattern_id));
      } else {
        const newId = 'P' + base + (++idCounter);
        patSheet.appendRow([newId, sn, sc, gr, sub, termTestId]);
        patternIds.push(newId);
      }
    }

    const psData       = psSheet.getDataRange().getValues();
    const patternIdSet = new Set(patternIds);
    for (let i = psData.length - 1; i >= 1; i--) {
      if (patternIdSet.has(String(psData[i][0]))) {
        psSheet.deleteRow(i + 1);
      }
    }
    const uniquePatternIds = [...new Set(patternIds)];
    for (const patternId of uniquePatternIds) {
      for (const subjectId of payload.selected_subject_ids) {
        psSheet.appendRow([patternId, subjectId]);
      }
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 試験区分ごと一括教科設定
 * items: [{ school_name, school_course, grade, sub_course, term_test_id, selected_subject_ids }]
 */
function batchSetPerTermSubjects(cramId, items) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss          = _getTargetSS(cramId);
    const patSheet    = ss.getSheetByName('exam_patterns');
    const psSheet     = ss.getSheetByName('pattern_subjects');
    const patternRows = getRowsData(patSheet);
    const updates     = [];

    const base = Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
    let idCounter = 0;

    for (const item of items) {
      const sn   = String(item.school_name  || '').trim();
      const sc   = String(item.school_course || '').trim();
      const gr   = String(item.grade        || '').trim();
      const sub  = String(item.sub_course   || '').trim();
      const ttId = String(item.term_test_id || '').trim();

      const existing = patternRows.find(p =>
        String(p.school_name  || '').trim() === sn &&
        String(p.school_course || '').trim() === sc &&
        String(p.grade        || '').trim() === gr &&
        String(p.sub_course   || '').trim() === sub &&
        String(p.term_test_id || '').trim() === ttId
      );

      let patternId;
      if (existing) {
        patternId = String(existing.pattern_id);
      } else {
        patternId = 'P' + base + (++idCounter);
        patSheet.appendRow([patternId, sn, sc, gr, sub, ttId]);
        patternRows.push({ pattern_id: patternId, school_name: sn, school_course: sc, grade: gr, sub_course: sub, term_test_id: ttId });
      }
      updates.push({ patternId, selectedSubjectIds: item.selected_subject_ids || [] });
    }

    const psData      = psSheet.getDataRange().getValues();
    const affectedIds = new Set(updates.map(u => u.patternId));
    for (let i = psData.length - 1; i >= 1; i--) {
      if (affectedIds.has(String(psData[i][0]))) {
        psSheet.deleteRow(i + 1);
      }
    }
    for (const { patternId, selectedSubjectIds } of updates) {
      for (const subjectId of selectedSubjectIds) {
        psSheet.appendRow([patternId, subjectId]);
      }
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * サブ区分グループ追加: 全試験区分に対してパターンを作成（教科は空）
 * payload: { school_name, school_course, grade, sub_course }
 */
function addSubCourseGroup(cramId, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss           = _getTargetSS(cramId);
    const patSheet     = ss.getSheetByName('exam_patterns');
    const ttSheet      = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('term_tests_master');
    const patternRows  = getRowsData(patSheet);
    const termTestRows = getRowsData(ttSheet);

    const sn  = String(payload.school_name  || '').trim();
    const sc  = String(payload.school_course || '').trim();
    const gr  = String(payload.grade        || '').trim();
    const sub = String(payload.sub_course   || '').trim();

    const base = Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
    let idCounter = 0;
    let created = 0;
    for (const tt of termTestRows) {
      const ttId = String(tt.term_test_id || '').trim();
      const exists = patternRows.some(p =>
        String(p.school_name  || '').trim() === sn &&
        String(p.school_course || '').trim() === sc &&
        String(p.grade        || '').trim() === gr &&
        String(p.sub_course   || '').trim() === sub &&
        String(p.term_test_id || '').trim() === ttId
      );
      if (!exists) {
        patSheet.appendRow(['P' + base + (++idCounter), sn, sc, gr, sub, ttId]);
        created++;
      }
    }

    return { success: true, created };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * exam_schedule への複数行一括保存（upsert）
 * items: Array<{ exam_id, pattern_id, year, start_date, end_date }>
 */
function updateExamDataBatch(cramId, items) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss    = _getTargetSS(cramId);
    const sheet = ss.getSheetByName('exam_schedule');
    const data  = sheet.getDataRange().getValues();

    const byExamId      = {};
    const byPatternYear = {};
    for (let i = 1; i < data.length; i++) {
      const eid = String(data[i][0]);
      const pid = String(data[i][1]);
      const yr  = String(data[i][2]);
      if (eid) byExamId[eid] = i + 1;
      if (pid && yr) byPatternYear[`${pid}||${yr}`] = { rowIndex: i + 1, examId: eid };
    }

    const base = Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
    let autoIdCounter = 0;

    items.forEach(payload => {
      let rowIndex = -1;
      let examId   = payload.exam_id;

      if (examId && byExamId[examId]) {
        rowIndex = byExamId[examId];
      } else if (payload.pattern_id && payload.year) {
        const pk = `${payload.pattern_id}||${payload.year}`;
        if (byPatternYear[pk]) {
          rowIndex = byPatternYear[pk].rowIndex;
          examId   = byPatternYear[pk].examId;
        }
      }

      if (!examId) examId = 'EX' + base + (++autoIdCounter);

      const rowValues = [
        examId,
        payload.pattern_id  || '',
        payload.year        || '',
        payload.start_date  || '',
        payload.end_date    || ''
      ];

      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
        const newRow = data.length;
        data.push(rowValues);
        byExamId[examId] = newRow + 1;
        if (payload.pattern_id && payload.year) {
          byPatternYear[`${payload.pattern_id}||${payload.year}`] = { rowIndex: newRow + 1, examId };
        }
      }
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 教科パターン未登録の試験区分に対して全学年のパターンを自動作成し、試験日程を保存
 * payload: { school_name, school_course, sub_course, term_test_id, year, start_date, end_date }
 */
function upsertExamWithAutoPattern(cramId, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss          = _getTargetSS(cramId);
    const patSheet    = ss.getSheetByName('exam_patterns');
    const schedSheet  = ss.getSheetByName('exam_schedule');
    const patternRows = getRowsData(patSheet);

    const sn   = String(payload.school_name  || '').trim();
    const sc   = String(payload.school_course || '').trim();
    const sub  = String(payload.sub_course   || '').trim();
    const ttId = String(payload.term_test_id || '').trim();
    const grades = ['高1', '高2', '高3'];

    const base = Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
    const patternIds = [];

    for (let i = 0; i < grades.length; i++) {
      const grade    = grades[i];
      const existing = patternRows.find(p =>
        String(p.school_name  || '').trim() === sn &&
        String(p.school_course || '').trim() === sc &&
        String(p.grade        || '').trim() === grade &&
        String(p.sub_course   || '').trim() === sub &&
        String(p.term_test_id || '').trim() === ttId
      );

      let patternId;
      if (existing) {
        patternId = String(existing.pattern_id);
      } else {
        patternId = 'P' + base + (i + 1);
        patSheet.appendRow([patternId, sn, sc, grade, sub, ttId]);
        patternRows.push({ pattern_id: patternId, school_name: sn, school_course: sc, grade, sub_course: sub, term_test_id: ttId });
      }
      patternIds.push(patternId);
    }

    const schedData = schedSheet.getDataRange().getValues();
    const byPatYear = {};
    for (let i = 1; i < schedData.length; i++) {
      const pid = String(schedData[i][1]);
      const yr  = String(schedData[i][2]);
      if (pid && yr) byPatYear[`${pid}||${yr}`] = { rowIndex: i + 1, examId: String(schedData[i][0]) };
    }

    for (const patternId of [...new Set(patternIds)]) {
      const pk = `${patternId}||${payload.year}`;
      let rowIndex = -1;
      let examId   = '';

      if (byPatYear[pk]) {
        rowIndex = byPatYear[pk].rowIndex;
        examId   = byPatYear[pk].examId;
      }
      if (!examId) examId = generateUniqueId('EX');

      const row = [examId, patternId, payload.year, payload.start_date, payload.end_date];
      if (rowIndex > 0) {
        schedSheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
      } else {
        schedSheet.appendRow(row);
      }
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}
