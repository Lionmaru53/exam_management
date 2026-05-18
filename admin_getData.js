/**
 * 管理画面用の初期データを一括取得
 *
 * @param {string} targetCramId
 *   master   : フロントから選択した校舎の cram_id
 *   branch_admin : 空でよい（adminContext.cram_id を自動使用）
 */
function getAdminInitialData(targetCramId) {
  try {
    const adminContext = getAdminContext();
    const parentSS     = SpreadsheetApp.getActiveSpreadsheet();

    // 操作対象の cram_id を確定
    const cramId = adminContext.role === 'branch_admin'
      ? adminContext.cram_id
      : (targetCramId || '');

    const results = { adminContext, selectedCramId: cramId };

    // ── 親SS：全校舎共通データ ──────────────────────────────
    const parentSheets = {
      termTests: 'term_tests_master',
      subjects:  'subjects_master',
      genres:    'genres_master'
    };
    for (const [key, name] of Object.entries(parentSheets)) {
      const sheet = parentSS.getSheetByName(name);
      if (!sheet) throw new Error(`シート "${name}" が見つかりませんでした。`);
      results[key] = stringifyDates(getRowsData(sheet));
    }
    results.subjects = results.subjects.map(s => {
      const g = results.genres.find(g => g.genre_id === s.genre_id);
      return { ...s, genre_name: g ? g.genre_name : '未設定' };
    });

    // master には校舎一覧も返す
    if (adminContext.role === 'master') {
      const branchSheet = parentSS.getSheetByName(BRANCHES_SHEET);
      results.branches = branchSheet ? stringifyDates(getRowsData(branchSheet)) : [];
    }

    // ── 子SS：校舎固有データ（cramId が確定している場合のみ）──
    if (cramId) {
      const childSS = getChildSS(cramId);

      const childSheets = {
        schedules:      'exam_schedule',
        patterns:       'exam_patterns',
        patternSubjects: 'pattern_subjects'
      };
      for (const [key, name] of Object.entries(childSheets)) {
        const sheet = childSS.getSheetByName(name);
        if (!sheet) throw new Error(`子SS のシート "${name}" が見つかりません。setupBranchSS() を実行してください。`);
        results[key] = stringifyDates(getRowsData(sheet));
      }

      // 【設定】学校・科
      const settingSheet = _ensureChildSettingsSheet(childSS);
      results.schoolSettings = getSchoolCoursesFromSettingsSheet(settingSheet);
    } else {
      // 校舎未選択時は空配列
      results.schedules       = [];
      results.patterns        = [];
      results.patternSubjects = [];
      results.schoolSettings  = [];
    }

    results.exams = results.schedules;
    return results;
  } catch (e) {
    console.error(e);
    return { error: e.message };
  }
}

// ---- 補助関数 ----

function getSchoolCoursesFromSettingsSheet(sheet) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  return values.slice(1).reduce((acc, row) => {
    const schoolName = String(row[0] || '').trim();
    if (!schoolName) return acc;
    const isTwoTerms = String(row[1] || '0').trim() === '1' ? 1 : 0;
    const courses = row.slice(2)
      .map(c => (c === undefined || c === null) ? '' : String(c).trim())
      .filter(Boolean);
    if (courses.length === 0) {
      acc.push({ school_name: schoolName, school_course: '', is_two_terms: isTwoTerms });
    } else {
      courses.forEach(course => acc.push({ school_name: schoolName, school_course: course, is_two_terms: isTwoTerms }));
    }
    return acc;
  }, []);
}

function _ensureChildSettingsSheet(ss) {
  let sheet = ss.getSheetByName('【設定】学校・科');
  if (!sheet) {
    sheet = ss.insertSheet('【設定】学校・科');
    sheet.getRange(1, 1, 1, 3).setValues([['学校名', '2学期制', '科・コース']]);
  }
  return sheet;
}
