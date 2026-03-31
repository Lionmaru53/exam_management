/**
 * 管理画面用の初期データを一括取得
 */
function getAdminInitialData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const results = {};
  const targetSheestNames = {
    students: "students_master",
    schools: "schools_master",
    schoolCourses: "school_courses",
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
