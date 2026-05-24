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
    let cramId;
    if (adminContext.role === 'branch_admin') {
      const ids = adminContext.cram_ids || [];
      cramId = (targetCramId && ids.includes(String(targetCramId))) ? targetCramId : (ids[0] || '');
    } else {
      cramId = targetCramId || '';
    }

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

    // 学校別教科表示名エイリアス
    const aliasSheet = parentSS.getSheetByName('school_subject_aliases');
    results.schoolSubjectAliases = aliasSheet ? stringifyDates(getRowsData(aliasSheet)) : [];

    // 学校別試験区分設定
    const sttSheet = parentSS.getSheetByName('school_term_test_settings');
    results.schoolTermTestSettings = sttSheet ? stringifyDates(getRowsData(sttSheet)) : [];

    // 校舎一覧を返す（master は全件、branch_admin は担当校舎のみ）
    if (adminContext.role === 'master' || adminContext.role === 'branch_admin') {
      const branchSheet = parentSS.getSheetByName(BRANCHES_SHEET);
      const allBranches = branchSheet ? stringifyDates(getRowsData(branchSheet)) : [];
      results.branches  = adminContext.role === 'master'
        ? allBranches
        : allBranches.filter(b => (adminContext.cram_ids || []).includes(String(b.cram_id || '').trim()));
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

      // school_course_master
      const settingSheet = _ensureSchoolCourseMasterSheet(childSS);
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

/**
 * 校舎の生徒一覧を返す（students_master から取得）。
 * フロントエンドで学校名グループ化して表示する用途。
 *
 * @param {string} [targetCramId] - master のみ指定可。branch_admin は自動使用。
 * @returns {{ success: boolean, students?: object[], cramId?: string, error?: string }}
 */
function getStudentList(targetCramId) {
  try {
    const ctx    = getAdminContext();
    const ids    = ctx.cram_ids || [];
    const cramId = ctx.role === 'branch_admin'
      ? ((targetCramId && ids.includes(String(targetCramId))) ? targetCramId : (ids[0] || ''))
      : (targetCramId || '');
    if (!cramId) return { success: false, error: '校舎を選択してください' };

    const childSS     = getChildSS(cramId);
    const masterSheet = childSS.getSheetByName('students_master');
    if (!masterSheet) return { success: false, error: 'students_master シートが見つかりません。setupBranchSS() を実行してください。' };

    const students = getRowsData(masterSheet)
      .map(s => ({
        student_id:    String(s.student_id    || '').trim(),
        name:          String(s.name          || '').trim(),
        pronunciation: String(s.pronunciation || '').trim(),
        school_name:   String(s.school_name   || '').trim(),
        school_course: String(s.school_course || '').trim(),
        sub_course:    String(s.sub_course    || '').trim(),
        grade:         String(s.grade         || '').trim(),
        line_user_id:  String(s.line_user_id  || '').trim(),
        is_active:     s.is_active === true || String(s.is_active) === '1' || String(s.is_active) === 'true',
      }))
      .filter(s => s.student_id);

    return { success: true, students, cramId };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ---- 補助関数 ----

/**
 * school_course_master シートを読む。
 * 列: school_name / school_course
 * 戻り値: [{ school_name, school_course }]
 */
function getSchoolCoursesFromSettingsSheet(sheet) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers   = values[0].map(h => String(h).trim());
  const schoolCol = headers.indexOf('school_name');
  const courseCol = headers.indexOf('school_course');
  if (schoolCol < 0) return [];

  return values.slice(1).reduce((acc, row) => {
    const schoolName = String(row[schoolCol] || '').trim();
    if (!schoolName) return acc;
    const course = courseCol >= 0 ? String(row[courseCol] || '').trim() : '';
    acc.push({ school_name: schoolName, school_course: course });
    return acc;
  }, []);
}

/** school_course_master シートを確保する（なければ作成）。 */
function _ensureSchoolCourseMasterSheet(ss) {
  let sheet = ss.getSheetByName('school_course_master');
  if (!sheet) {
    sheet = ss.insertSheet('school_course_master');
    sheet.getRange(1, 1, 1, 2).setValues([['school_name', 'school_course']]);
  }
  return sheet;
}

/**
 * school_course_master に (school_name, school_course) の行を upsert する。
 * 同一の組み合わせが既にあればスキップ。
 * 新規追加の場合、school_term_test_settings に基づき exam_patterns を自動生成する。
 */
function upsertSchoolCourse(ss, schoolName, courseName) {
  const sn = String(schoolName || '').trim();
  const cn = String(courseName || '').trim();
  if (!sn) return;

  const sheet   = _ensureSchoolCourseMasterSheet(ss);
  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const sc      = headers.indexOf('school_name');
  const cc      = headers.indexOf('school_course');
  if (sc < 0 || cc < 0) return;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][sc] || '').trim() === sn &&
        String(data[i][cc] || '').trim() === cn) return;
  }
  const newRow = headers.map((_, i) => {
    if (i === sc) return sn;
    if (i === cc) return cn;
    return '';
  });
  sheet.appendRow(newRow);

  // 新規追加時: school_term_test_settings に基づき exam_patterns を自動生成
  const parentSS = SpreadsheetApp.getActiveSpreadsheet();
  const sttSheet = parentSS.getSheetByName('school_term_test_settings');
  if (sttSheet) {
    const activeTermTests = getRowsData(sttSheet)
      .filter(r => String(r.school_name || '').trim() === sn && String(r.is_active || '').trim() === '1')
      .map(r => String(r.term_test_id).trim())
      .filter(Boolean);
    if (activeTermTests.length > 0) {
      _autoCreateExamPatterns(ss, sn, cn, '', activeTermTests);
    }
  }
}

/**
 * exam_patterns に school/course/grade × termTest の行を自動生成する（既存行はスキップ）。
 */
function _autoCreateExamPatterns(childSS, schoolName, schoolCourse, subCourse, termTestIds) {
  const patSheet = childSS.getSheetByName('exam_patterns');
  if (!patSheet) return;
  const existing = getRowsData(patSheet);
  const grades   = ['高1', '高2', '高3'];
  const base     = Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
  let idx = 0;
  const newRows  = [];
  termTestIds.forEach(ttId => {
    grades.forEach(grade => {
      const dup = existing.find(p =>
        String(p.school_name   || '').trim() === schoolName   &&
        String(p.school_course || '').trim() === schoolCourse &&
        String(p.grade         || '').trim() === grade        &&
        String(p.sub_course    || '').trim() === subCourse    &&
        String(p.term_test_id  || '').trim() === ttId
      );
      if (!dup) newRows.push(['P' + base + String(++idx).padStart(2, '0'), schoolName, schoolCourse, grade, subCourse, ttId]);
    });
  });
  if (newRows.length > 0)
    patSheet.getRange(patSheet.getLastRow() + 1, 1, newRows.length, 6).setValues(newRows);
}

if (typeof module !== 'undefined') Object.assign(global, {
  getAdminInitialData, getStudentList,
  getSchoolCoursesFromSettingsSheet,
  _ensureSchoolCourseMasterSheet, upsertSchoolCourse, _autoCreateExamPatterns,
});
