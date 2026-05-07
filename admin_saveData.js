function generateUniqueId(prefix) {
  return prefix + Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
}

/**
 * exam_schedule への日程保存（upsert）
 * payload: { exam_id, pattern_id, year, start_date, end_date }
 */
function updateExamData(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('exam_schedule');
    const data = sheet.getDataRange().getValues();

    let rowIndex = -1;
    let examId = payload.exam_id;

    if (examId && examId !== '') {
      // exam_id で既存行を検索
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(examId)) {
          rowIndex = i + 1;
          break;
        }
      }
    }

    if (rowIndex < 0 && payload.pattern_id && payload.year) {
      // pattern_id + year で既存行を検索
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
function addNewPattern(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
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
function addNewSubject(patternId, newSubjectName, genreName) {
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
    subjectsSheet.appendRow([newSubjectId, newSubjectName, genreId, '']);

    return { success: true, subject_id: newSubjectId };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

globalThis.addNewSubject = addNewSubject;

/**
 * exam_schedule への複数行一括保存（upsert）
 * items: Array<{ exam_id, pattern_id, year, start_date, end_date }>
 */
function updateExamDataBatch(items) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('exam_schedule');
    const data  = sheet.getDataRange().getValues();

    // 既存行のインデックスを構築（1回だけ読む）
    const byExamId      = {};  // examId → rowIndex (1-based)
    const byPatternYear = {};  // `patternId||year` → { rowIndex, examId }
    for (let i = 1; i < data.length; i++) {
      const eid = String(data[i][0]);
      const pid = String(data[i][1]);
      const yr  = String(data[i][2]);
      if (eid) byExamId[eid] = i + 1;
      if (pid && yr) byPatternYear[`${pid}||${yr}`] = { rowIndex: i + 1, examId: eid };
    }

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

      if (!examId) examId = generateUniqueId('EX');

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
        // 追加した行を byExamId / byPatternYear に反映し、以降の重複追加を防ぐ
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
