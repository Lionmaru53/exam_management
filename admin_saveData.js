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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('exam_data');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  let rowIndex = -1;
  let examID = payload.exam_id;

  if (examID) {
    for ( let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(examID)) {
        rowIndex = i + 1;
        break;
      }
    }
  } else {
    examID = "EX" + Utilities.formatDate(new Date(), "JST", "yyyyMMddHHmmss");
  }

  const rowValues = headers.map(h => {
    switch (h) {
      case 'exam_id': return examID;
      case 'pattern_id': return payload.pattern_id;
      case 'start_date': return payload.start_date;
      case 'end_date': return payload.end_date;
    }
    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }
  });
  return { success: true };
}

