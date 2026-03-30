/**
 * 生徒マスターの更新・追加
 */
function updateStudentMaster(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('students_master');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    let rowIndex = -1;
    let studentId = payload.student_id;

    // 1. 既存データの検索（更新の場合）
    if (studentId) {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(studentId)) {
          rowIndex = i + 1;
          break;
        }
      }
    } else {
      // 新規登録の場合：新しいIDを生成（例: ST + 連番）
      studentId = "ST" + Utilities.formatDate(new Date(), "JST", "yyyyMMddHHmmss");
    }

    // 2. 書き込む値の整理（見出しの並び順に依存させないためのマッピング）
    const rowValues = headers.map(h => {
      switch (h) {
        case 'student_id': return studentId;
        case 'name': return payload.name;
        case 'school_name': return payload.school_name;
        case 'school_course_id': return payload.school_course_id;
        case 'grade': return payload.grade;
        // line_user_id は更新対象から外す（別の紐付け機能で扱うため）
        default: return rowIndex > 0 ? data[rowIndex - 1][headers.indexOf(h)] : "";
      }
    });

    // 3. スプレッドシートへの反映
    if (rowIndex > 0) {
      // 既存行を更新
      sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      // 末尾に新規追加
      sheet.appendRow(rowValues);
    }

    return { success: true, student_id: studentId };

  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function updateExamData(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('exam_data');
  const data = sheet.getDataRange().getValues();
  
  let rowIndex = -1;
  let examId = payload.exam_id;

  // 既存の修正か、新規の作成かを判定
  if (examId && examId !== "") {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(examId)) {
        rowIndex = i + 1;
        break;
      }
    }
  } else {
    // 新しくexam_idを発行
    examId = "EX" + Utilities.formatDate(new Date(), "JST", "yyyyMMddHHmmss");
  }

  const rowValues = [examId, payload.pattern_id, payload.start_date, payload.end_date];

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, 4).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
  
  return { success: true };
}

/**
 * 新しい試験パターンの登録
 */
function addNewPattern(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('exam_patterns');
  const data = sheet.getDataRange().getValues();

  // 重複チェック (school_name, term_test_id, school_course_id)
  const exists = data.some(row => 
    row[1] === payload.school_name && 
    row[2] === payload.term_test_id && 
    row[3] === payload.school_course_id
  );
  
  if (exists) return { success: false, error: "既に登録済みのパターンです" };

  const newId = "P" + Utilities.formatDate(new Date(), "JST", "yyyyMMddHHmmss");
  // [pattern_id, school_name, term_test_id, school_course_id]
  sheet.appendRow([newId, payload.school_name, payload.term_test_id, payload.school_course_id]);
  
  return { success: true };
}

function updatePatternSubjects(patternId, selectedIds, newSubjectName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const psSheet = ss.getSheetByName('pattern_subjects');
  const subSheet = ss.getSheetByName('subjects_master');

  // 1. 新しい教科名がある場合、マスターに追加
  if (newSubjectName.trim() !== "") {
    const newSubId = "SUB" + Utilities.formatDate(new Date(), "JST", "yyyyMMddHHmmss");
    subSheet.appendRow([newSubId, newSubjectName, "G_OTHER", ""]); // ID, 名称, ジャンル, 学年
    selectedIds.push(newSubId);
  }

  // 2. 既存の紐付け（pattern_id一致分）を全削除
  const psData = psSheet.getDataRange().getValues();
  for (let i = psData.length - 1; i >= 1; i--) {
    if (psData[i][0] === patternId) psSheet.deleteRow(i + 1);
  }

  // 3. 新しい紐付けを一括登録
  selectedIds.forEach(subId => {
    psSheet.appendRow([patternId, subId]);
  });

  return { success: true };
}

