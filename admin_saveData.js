function generateUniqueId(prefix) {
  return prefix + Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
}

function updateExamData(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('exam_data');
    const data = sheet.getDataRange().getValues();
    const patterns = getRowsData(ss.getSheetByName('exam_patterns'));

    let rowIndex = -1;
    let examId = payload.exam_id;

    if (examId && examId !== '') {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(examId)) {
          rowIndex = i + 1;
          break;
        }
      }
    } else {
      examId = generateUniqueId('EX');
    }

    const pattern = patterns.find(p => p.pattern_id === payload.pattern_id) || {};
    const termTestId = payload.term_test_id || pattern.term_test_id || '';
    const rowValues = [examId, termTestId, payload.start_date, payload.end_date, payload.pattern_id];

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

function addNewPattern(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('exam_patterns');
    const patterns = sheet.getDataRange().getValues();

    const exists = patterns.some((row, index) => {
      if (index === 0) return false;
      return row[1] === payload.school_name && row[2] === payload.school_course && row[3] === payload.term_test_id && row[4] === payload.grade;
    });

    if (exists) {
      return { success: false, error: '既に登録済みのパターンです' };
    }

    const newPatternId = generateUniqueId('P');
    sheet.appendRow([newPatternId, payload.school_name, payload.school_course, payload.term_test_id, payload.grade]);

    return { success: true, pattern_id: newPatternId };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function updatePatternSubjects(patternId, selectedIds, newSubjectName) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const psSheet = ss.getSheetByName('pattern_subjects');
    const subSheet = ss.getSheetByName('subjects_master');

    const currentSelectedIds = Array.isArray(selectedIds) ? selectedIds.slice() : [];

    if (newSubjectName && newSubjectName.trim() !== '') {
      const newSubId = generateUniqueId('SUB');
      subSheet.appendRow([newSubId, newSubjectName.trim(), '', '']);
      currentSelectedIds.push(newSubId);
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
