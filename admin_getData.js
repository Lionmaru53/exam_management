/**
 * 管理画面用の初期データを一括取得
 */
function getSchoolCoursesFromSettingsSheet(sheet) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  return values.slice(1).reduce((acc, row) => {
    const schoolName = String(row[0] || '').trim();
    if (!schoolName) return acc;

    const isTwoTerms = String(row[1] || '0').trim() === '1' ? 1 : 0;
    const courses = row.slice(2)
      .map(cell => cell === undefined || cell === null ? '' : String(cell).trim())
      .filter(Boolean);

    if (courses.length === 0) {
      acc.push({
        school_name: schoolName,
        school_course: '',
        is_two_terms: isTwoTerms
      });
      return acc;
    }

    courses.forEach(course => {
      acc.push({
        school_name: schoolName,
        school_course: course,
        is_two_terms: isTwoTerms
      });
    });
    return acc;
  }, []);
}

function ensureSchoolSettingsSheet(ss) {
  let sheet = ss.getSheetByName('【設定】学校・科');
  if (!sheet) {
    sheet = ss.insertSheet('【設定】学校・科');
    sheet.getRange(1, 1, 1, 3).setValues([['学校名', '2学期制', '科・コース']]);
  }
  return sheet;
}

function getAdminInitialData(callerEmail) {
  try {
    // 認証チェック（Phase 0: クライアントから受け取ったメールで照合）
    const adminContext = getAdminContext(callerEmail || '');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('スプレッドシートにアクセスできません。スクリプトがスプレッドシートに紐付けられているか確認してください。');

    const results = { adminContext };
    const targetSheetNames = {
      termTests:      'term_tests_master',
      schedules:      'exam_schedule',
      patterns:       'exam_patterns',
      subjects:       'subjects_master',
      patternSubjects: 'pattern_subjects',
      genres:         'genres_master'
    };

    for (let key in targetSheetNames) {
      const sheetName = targetSheetNames[key];
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) throw new Error(`シート "${sheetName}" が見つかりませんでした。`);
      results[key] = stringifyDates(getRowsData(sheet));
    }

    const settingSheet = ensureSchoolSettingsSheet(ss);
    results.schoolSettings = getSchoolCoursesFromSettingsSheet(settingSheet);

    results.exams = results.schedules;

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
