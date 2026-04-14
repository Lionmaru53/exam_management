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

/**
 * 新しい学校コースを追加し、試験パターンを作成
 */
function addNewSchoolCourse(schoolName, courseName, testTermId, grade) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const schoolCourseMapSheet = ensureSchoolSchoolCoursesSheet(ss);
    
    // 1. 新しいコースIDを生成
    const newCourseId = "SC" + Utilities.formatDate(new Date(), "JST", "yyyyMMddHHmmss");
    
    // 2. school_coursesシートに新規コースを追加
    const courseSheet = ss.getSheetByName('school_courses');
    courseSheet.appendRow([newCourseId, courseName]);

    // 2.5 学校とコースの中間テーブルに紐付けを追加
    schoolCourseMapSheet.appendRow([schoolName, newCourseId]);
    
    // 3. exam_patternsシートに新規パターンを追加
    const patternSheet = ss.getSheetByName('exam_patterns');
    const newPatternId = "P" + Utilities.formatDate(new Date(), "JST", "yyyyMMddHHmmss");
    patternSheet.appendRow([newPatternId, schoolName, testTermId, newCourseId, grade]);
    
    // 4. 更新されたマスターデータを取得して返す
    const ss2 = SpreadsheetApp.getActiveSpreadsheet();
    const results = {};
    const targetSheestNames = {
      schoolCourses: "school_courses_master",
      schoolSchoolCourses: "school_school_courses",
      patterns: "exam_patterns",
    };

    for (let key in targetSheestNames) {
      const sheetName = targetSheestNames[key];
      const sheet = ss2.getSheetByName(sheetName);
      results[key] = stringifyDates(getRowsData(sheet));
    }

    return { 
      success: true, 
      schoolCourses: results.schoolCourses,
      schoolSchoolCourses: results.schoolSchoolCourses,
      patterns: results.patterns,
      message: `新規コース「${courseName}」を追加しました`
    };

  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 既存コースをパターンに追加
 */
function addExistingCourseToPattern(schoolName, schoolCourseId, testTermId, grade) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const schoolCourseMapSheet = ensureSchoolSchoolCoursesSheet(ss);
    
    // 1. 重複チェック (school_name, term_test_id, school_course_id, grade)
    const patternSheet = ss.getSheetByName('exam_patterns');
    const patterns = getRowsData(patternSheet);
    
    const exists = patterns.some(p => 
      p.school_name === schoolName && 
      p.term_test_id === testTermId && 
      p.school_course_id === schoolCourseId &&
      p.grade === grade
    );
    
    if (exists) {
      return { success: false, error: "このコースとテスト区分、学年の組み合わせは既に登録済みです" };
    }
    
    // 2. 新しいパターンを追加
    const newPatternId = "P" + Utilities.formatDate(new Date(), "JST", "yyyyMMddHHmmss");
    patternSheet.appendRow([newPatternId, schoolName, testTermId, schoolCourseId, grade]);

    // 2.5 中間テーブルに学校とコースの紐付けがなければ追加
    const schoolCourseMaps = getRowsData(schoolCourseMapSheet);
    const hasSchoolCourseMap = schoolCourseMaps.some(m =>
      m.school_name === schoolName &&
      String(m.school_course_id) === String(schoolCourseId)
    );

    if (!hasSchoolCourseMap) {
      schoolCourseMapSheet.appendRow([schoolName, schoolCourseId]);
    }
    
    // 3. 更新されたパターンデータを返す
    const updatedPatterns = getRowsData(patternSheet);
    
    return { 
      success: true, 
      patterns: stringifyDates(updatedPatterns),
      schoolSchoolCourses: stringifyDates(getRowsData(schoolCourseMapSheet)),
      message: "コースをパターンに追加しました"
    };

  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 学校とコースの紐付けを中間テーブルに追加
 */
function addSchoolCourseMapping(schoolName, schoolCourseId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const mapSheet = ensureSchoolSchoolCoursesSheet(ss);
    const maps = getRowsData(mapSheet);

    const exists = maps.some((m) =>
      m.school_name === schoolName &&
      String(m.school_course_id) === String(schoolCourseId)
    );

    if (exists) {
      return { success: false, error: "この学校とコースの組み合わせは既に登録済みです" };
    }

    mapSheet.appendRow([schoolName, schoolCourseId]);

    return {
      success: true,
      schoolSchoolCourses: stringifyDates(getRowsData(mapSheet)),
      message: "学校とコースの紐付けを追加しました",
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 学校とコースの紐付けを中間テーブルから削除
 */
function removeSchoolCourseMapping(schoolName, schoolCourseId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const mapSheet = ensureSchoolSchoolCoursesSheet(ss);
    const patternSheet = ss.getSheetByName('exam_patterns');
    const patterns = getRowsData(patternSheet);

    const hasPattern = patterns.some((p) =>
      p.school_name === schoolName &&
      String(p.school_course_id) === String(schoolCourseId)
    );

    if (hasPattern) {
      return {
        success: false,
        error: "この組み合わせは試験パターンで使用中のため削除できません",
      };
    }

    const data = mapSheet.getDataRange().getValues();
    if (data.length <= 1) {
      return { success: false, error: "削除対象が見つかりません" };
    }

    const headers = data[0].map((h) => String(h).trim());
    const schoolCol = headers.indexOf('school_name');
    const courseCol = headers.indexOf('school_course_id');

    if (schoolCol === -1 || courseCol === -1) {
      return { success: false, error: "school_school_courses のヘッダーが不正です" };
    }

    let deleted = false;
    for (let i = data.length - 1; i >= 1; i--) {
      if (
        data[i][schoolCol] === schoolName &&
        String(data[i][courseCol]) === String(schoolCourseId)
      ) {
        mapSheet.deleteRow(i + 1);
        deleted = true;
      }
    }

    if (!deleted) {
      return { success: false, error: "削除対象が見つかりません" };
    }

    return {
      success: true,
      schoolSchoolCourses: stringifyDates(getRowsData(mapSheet)),
      message: "学校とコースの紐付けを削除しました",
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

