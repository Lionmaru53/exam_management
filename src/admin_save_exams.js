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
