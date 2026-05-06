/**
 * 管理画面用の初期データを一括取得
 */
function getAdminInitialData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const results = {};
  const targetSheetNames = {
    patterns: 'exam_patterns',
    termTests: 'term_tests_master',
    exams: 'exam_data',
    subjects: 'subjects_master',
    patternSubjects: 'pattern_subjects',
    genres: 'genres_master'
  };

  try {
    for (let key in targetSheetNames) {
      const sheetName = targetSheetNames[key];
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        throw new Error(`シート "${sheetName}" が見つかりませんでした。`);
      }
      results[key] = stringifyDates(getRowsData(sheet));
    }

    results.subjects = results.subjects.map(s => {
      const g = results.genres.find(g => g.genre_id === s.genre_id);
      return { ...s, genre_name: g ? g.genre_name : '未設定' };
    });

    return results;
  } catch (e) {
    console.error(e);
    return { error: e.message };
  }
}
