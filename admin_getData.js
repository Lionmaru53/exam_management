/**
 * 管理画面用の初期データを一括取得
 */
function ensureSchoolSchoolCoursesSheet(ss) {
  let sheet = ss.getSheetByName('school_school_courses');
  if (!sheet) {
    sheet = ss.insertSheet('school_school_courses');
    sheet.appendRow(['school_name', 'school_course_id']);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(['school_name', 'school_course_id']);
  }

  // 初期導入時は既存パターンから学校×コースを補完して表示崩れを防ぐ
  if (sheet.getLastRow() <= 1) {
    const patternSheet = ss.getSheetByName('exam_patterns');
    const patterns = getRowsData(patternSheet);
    const uniqueMap = {};

    patterns.forEach((p) => {
      if (!p.school_name || !p.school_course_id) return;
      const key = `${p.school_name}||${p.school_course_id}`;
      if (!uniqueMap[key]) {
        uniqueMap[key] = [p.school_name, p.school_course_id];
      }
    });

    const rows = Object.values(uniqueMap);
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 2).setValues(rows);
    }
  }

  return sheet;
}

function getAdminInitialData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const results = {};
  ensureSchoolSchoolCoursesSheet(ss);
  const targetSheestNames = {
    students: "students_master",
    schools: "schools_master",
    schoolCourses: "school_courses_master",
    schoolSchoolCourses: "school_school_courses",
    studentCourses: "students_courses",
    patterns: "exam_patterns",
    termTests: "term_tests_master",
    exams: "exam_data",
    subjects: "subjects_master",
    patternSubjects: "pattern_subjects",
    genres: "genres_master",
  };

  try {
    for (let key in targetSheestNames) {
      const sheetName = targetSheestNames[key];
      const sheet = ss.getSheetByName(sheetName);

      if (!sheet) {
        throw new Error(`シート "${sheetName}" が見つかりませんでした。`);
      }

      results[key] = stringifyDates(getRowsData(sheet));
    }
    results.subjects = results.subjects.map(s => {
      const g = results.genres.find(g => g.genre_id === s.genre_id);
      return { ...s, genre_name: g ? g.genre_name : "未設定" };
    });
    return results;
  } catch (e) {
    console.error(e);
    return JSON.stringify({ error: e.message });
  }
}
