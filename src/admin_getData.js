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
        patterns:        'exam_patterns',
        patternSubjects: 'pattern_subjects',
      };
      for (const [key, name] of Object.entries(childSheets)) {
        const sheet = childSS.getSheetByName(name);
        if (!sheet) throw new Error(`子SS のシート "${name}" が見つかりません。setupBranchSS() を実行してください。`);
        results[key] = stringifyDates(getRowsData(sheet));
      }

      // school_exam_periods（新スキーマ）
      const periodSheet = childSS.getSheetByName('school_exam_periods');
      results.examPeriods = periodSheet ? stringifyDates(getRowsData(periodSheet)) : [];

      // school_course_master
      const settingSheet = _ensureSchoolCourseMasterSheet(childSS);
      results.schoolSettings = getSchoolCoursesFromSettingsSheet(settingSheet);
    } else {
      // 校舎未選択時は空配列
      results.patterns               = [];
      results.patternSubjects        = [];
      results.examPeriods            = [];
      results.schoolSettings         = [];
    }
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
 * 新規追加の場合、exam_patterns を5組み合わせ（高1/''/高2-3/文系・理系）で自動生成する。
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

  // 新規追加時: exam_patterns を自動生成（5組み合わせ）
  _autoCreateAllPatterns(ss, sn, cn);
}

/**
 * 高1/''/高2-3/文系・理系 の5組み合わせで exam_patterns を一括生成する（既存行はスキップ）。
 */
function _autoCreateAllPatterns(childSS, schoolName, schoolCourse) {
  const patSheet = childSS.getSheetByName('exam_patterns');
  if (!patSheet) return;
  const existing = getRowsData(patSheet);
  const combos   = [
    { grade: '高1', sub: '' },
    { grade: '高2', sub: '文系' },
    { grade: '高2', sub: '理系' },
    { grade: '高3', sub: '文系' },
    { grade: '高3', sub: '理系' }
  ];
  const base = Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
  let idx = 0;
  const newRows = [];
  combos.forEach(({ grade, sub }) => {
    const dup = existing.find(p =>
      String(p.school_name   || '').trim() === schoolName   &&
      String(p.school_course || '').trim() === schoolCourse &&
      String(p.grade         || '').trim() === grade        &&
      String(p.sub_course    || '').trim() === sub
    );
    if (!dup) newRows.push(['P' + base + String(++idx).padStart(3, '0'), schoolName, schoolCourse, grade, sub]);
  });
  if (newRows.length > 0) {
    patSheet.getRange(patSheet.getLastRow() + 1, 1, newRows.length, 5).setValues(newRows);
    _setDefaultSubjectsForPatterns(childSS, newRows.map(r => ({ pattern_id: r[0], grade: r[3] })));
  }
}

/**
 * exam_patterns に school/course/sub_course × grade の行を自動生成する（既存行はスキップ）。
 * grades を省略した場合は ['高1', '高2', '高3'] を使用。
 */
function _autoCreateExamPatterns(childSS, schoolName, schoolCourse, subCourse, grades) {
  const patSheet = childSS.getSheetByName('exam_patterns');
  if (!patSheet) return;
  const existing  = getRowsData(patSheet);
  const gradeList = grades || ['高1', '高2', '高3'];
  const base      = Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
  let idx = 0;
  const newRows   = [];
  gradeList.forEach(grade => {
    const dup = existing.find(p =>
      String(p.school_name   || '').trim() === schoolName   &&
      String(p.school_course || '').trim() === schoolCourse &&
      String(p.grade         || '').trim() === grade        &&
      String(p.sub_course    || '').trim() === subCourse
    );
    if (!dup) newRows.push(['P' + base + String(++idx).padStart(2, '0'), schoolName, schoolCourse, grade, subCourse]);
  });
  if (newRows.length > 0) {
    patSheet.getRange(patSheet.getLastRow() + 1, 1, newRows.length, 5).setValues(newRows);
    _setDefaultSubjectsForPatterns(childSS, newRows.map(r => ({ pattern_id: r[0], grade: r[3] })));
  }
}

/**
 * 新規生成した exam_patterns に subjects_master.default = true の教科を設定する。
 * patternInfos: [{ pattern_id, grade }]
 */
function _setDefaultSubjectsForPatterns(childSS, patternInfos) {
  if (!patternInfos || patternInfos.length === 0) return;
  const psSheet = childSS.getSheetByName('pattern_subjects');
  if (!psSheet) return;

  const parentSS = SpreadsheetApp.getActiveSpreadsheet();
  const subSheet = parentSS.getSheetByName('subjects_master');
  if (!subSheet) return;

  // grade → [subject_id, ...] （subjects_master.default が true の教科のみ）
  const gradeSubjectMap = {};
  getRowsData(subSheet).forEach(s => {
    const sid = String(s.subject_id || '').trim();
    const sgr = String(s.grade      || '').trim();
    if (!sid) return;
    const def = s['default'];
    const isDefault = def === true || String(def).trim().toLowerCase() === 'true' || String(def).trim() === '1';
    if (!isDefault) return;
    if (!gradeSubjectMap[sgr]) gradeSubjectMap[sgr] = [];
    gradeSubjectMap[sgr].push(sid);
  });

  // 既存 pattern_subjects で重複チェック
  const existingPs  = getRowsData(psSheet);
  const existingSet = new Set(existingPs.map(r => String(r.pattern_id) + '||' + String(r.subject_id)));

  const newPsRows = [];
  patternInfos.forEach(({ pattern_id, grade }) => {
    const ids = gradeSubjectMap[grade] || [];
    ids.forEach(sid => {
      const key = pattern_id + '||' + sid;
      if (!existingSet.has(key)) {
        newPsRows.push([pattern_id, sid]);
        existingSet.add(key);
      }
    });
  });

  if (newPsRows.length > 0)
    psSheet.getRange(psSheet.getLastRow() + 1, 1, newPsRows.length, 2).setValues(newPsRows);
}

/**
 * ダッシュボード用データを取得する。
 * liff_access_log の最新5件を返す。将来的に他のカード向けデータもここに追加していく。
 * @returns {{ success: boolean, recentAccesses?: object[], error?: string }}
 */
function getDashboardData() {
  try {
    const ctx = getAdminContext();
    if (!ctx.email) return { success: false, error: ctx.error || 'アクセス権限がありません' };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName('liff_access_log');
    if (!logSheet) return { success: true, recentAccesses: [] };

    const rows = getRowsData(logSheet);
    rows.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
    return { success: true, recentAccesses: stringifyDates(rows.slice(0, 5)) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 管理者向け：指定試験区分の exam_schedule・scores_data・students を一括取得する。
 *
 * @param {string} targetCramId
 * @param {string} termTestId
 * @returns {{ success: boolean, exams?: object[], scores?: object[], students?: object[], error?: string }}
 */
function getAdminScores(targetCramId, termTestId) {
  try {
    const ctx  = getAdminContext();
    const ids  = ctx.cram_ids || [];
    const cramId = ctx.role === 'branch_admin'
      ? ((targetCramId && ids.includes(String(targetCramId))) ? targetCramId : (ids[0] || ''))
      : (targetCramId || '');
    if (!cramId)     return { success: false, error: '校舎を選択してください' };
    if (!termTestId) return { success: false, error: '試験区分を選択してください' };

    const childSS = getChildSS(cramId);

    // students_master からアクティブ生徒を取得
    const studentsSheet = childSS.getSheetByName('students_master');
    if (!studentsSheet) return { success: false, error: 'students_master シートが見つかりません' };
    const students = getRowsData(studentsSheet)
      .filter(s => s.student_id && (s.is_active === true || String(s.is_active) === '1' || String(s.is_active) === 'true'))
      .map(s => ({
        student_id:    String(s.student_id    || '').trim(),
        name:          String(s.name          || '').trim(),
        pronunciation: String(s.pronunciation || '').trim(),
        school_name:   String(s.school_name   || '').trim(),
        school_course: String(s.school_course || '').trim(),
        sub_course:    String(s.sub_course    || '').trim(),
        grade:         String(s.grade         || '').trim(),
      }));
    const studentIdSet = new Set(students.map(s => s.student_id));

    // scores_data を生徒ID × term_test_id で絞り込んで取得
    const scoresSheet = childSS.getSheetByName('scores_data');
    if (!scoresSheet) return { success: false, error: 'scores_data シートが見つかりません' };
    const scores = getRowsData(scoresSheet)
      .filter(s => studentIdSet.has(String(s.student_id || '').trim())
                && String(s.term_test_id || '').trim() === termTestId)
      .map(s => ({
        score_id:     String(s.score_id     || '').trim(),
        student_id:   String(s.student_id   || '').trim(),
        subject_id:   String(s.subject_id   || '').trim(),
        term_test_id: String(s.term_test_id || '').trim(),
        score:      (s.score      !== '' && s.score      != null) ? String(s.score)      : null,
        grade_rank: (s.grade_rank !== '' && s.grade_rank != null) ? String(s.grade_rank) : null,
        class_rank: (s.class_rank !== '' && s.class_rank != null) ? String(s.class_rank) : null,
        not_taken:  s.not_taken === true || String(s.not_taken || '') === '1',
        update_at:  String(s.update_at || ''),
      }));

    return {
      success: true,
      scores,
      students,
      termTestId,
    };
  } catch (e) {
    console.error('getAdminScores error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * 管理者向け：score_id を指定してスコアを直接更新する。
 *
 * @param {{ cramId: string, scoreId: string, score: string|number, gradeRank: string|number, classRank: string|number, notTaken: boolean }} payload
 * @returns {{ success: boolean, error?: string }}
 */
function updateAdminScore(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    const ctx    = getAdminContext();
    const cramId = String(payload.cramId || '').trim();
    const ids    = ctx.cram_ids || [];
    if (ctx.role !== 'master' && !ids.includes(cramId)) {
      return { success: false, error: '権限がありません' };
    }
    if (!cramId) return { success: false, error: '校舎が指定されていません' };

    const scoreId = String(payload.scoreId || '').trim();
    if (!scoreId) return { success: false, error: 'scoreId が指定されていません' };

    const childSS = getChildSS(cramId);
    const sheet   = childSS.getSheetByName('scores_data');
    if (!sheet) return { success: false, error: 'scores_data シートが見つかりません' };

    const data    = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());

    const col = name => headers.indexOf(name);
    const scoreIdCol   = col('score_id');
    const scoreCol     = col('score');
    const gradeRkCol   = col('grade_rank');
    const classRkCol   = col('class_rank');
    const notTakenCol  = col('not_taken');
    const updateAtCol  = col('update_at');

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][scoreIdCol] || '').trim() !== scoreId) continue;

      const row = i + 1;
      if (scoreCol >= 0 && payload.score !== undefined) {
        const v = String(payload.score).trim();
        sheet.getRange(row, scoreCol + 1).setValue(v === '' ? '' : Number(v));
      }
      if (gradeRkCol >= 0 && payload.gradeRank !== undefined) {
        const v = String(payload.gradeRank === null ? '' : payload.gradeRank).trim();
        sheet.getRange(row, gradeRkCol + 1).setValue(v === '' ? '' : Number(v));
      }
      if (classRkCol >= 0 && payload.classRank !== undefined) {
        const v = String(payload.classRank === null ? '' : payload.classRank).trim();
        sheet.getRange(row, classRkCol + 1).setValue(v === '' ? '' : Number(v));
      }
      if (notTakenCol >= 0 && payload.notTaken !== undefined) {
        sheet.getRange(row, notTakenCol + 1).setValue(payload.notTaken ? '1' : '');
      }
      if (updateAtCol >= 0) {
        sheet.getRange(row, updateAtCol + 1).setValue(new Date());
      }

      writeAuditLog(ctx, 'update_admin_score', { cramId, scoreId, score: payload.score }, 'success');
      return { success: true };
    }

    return { success: false, error: '指定のスコアが見つかりません (scoreId: ' + scoreId + ')' };
  } catch (e) {
    console.error('updateAdminScore error:', e);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 【使い捨てマイグレーション関数】
 * 本番の全校舎の scores_data に term_test_id 列を追加し、
 * exam_schedule との結合で値を埋める。
 * 実行後に確認が取れたら、この関数ごと削除する。
 */
function migrateScoresAddTermTestId() {
  const parentSS = SpreadsheetApp.getActiveSpreadsheet();
  const branchSheet = parentSS.getSheetByName('branches_master');
  if (!branchSheet) throw new Error('branches_master が見つかりません');

  const branches = getRowsData(branchSheet).filter(b =>
    b.is_active === true || String(b.is_active) === '1'
  );
  const results = [];

  branches.forEach(function (branch) {
    const cramId = String(branch.cram_id || '').trim();
    if (!cramId) return;
    try {
      const ss          = getChildSS(cramId);
      const scoresSheet = ss.getSheetByName('scores_data');
      const schedSheet  = ss.getSheetByName('exam_schedule');
      if (!scoresSheet) { results.push(cramId + ': scores_data なし'); return; }

      const data    = scoresSheet.getDataRange().getValues();
      const headers = data[0].map(function (h) { return String(h).trim(); });

      // term_test_id 列がなければ末尾に追加
      let ttCol = headers.indexOf('term_test_id');
      if (ttCol < 0) {
        scoresSheet.getRange(1, headers.length + 1).setValue('term_test_id');
        ttCol = headers.length;
        headers.push('term_test_id');
      }

      // exam_schedule から examId → termTestId マップを構築
      const examToTermTest = {};
      if (schedSheet) {
        getRowsData(schedSheet).forEach(function (r) {
          const eid  = String(r.exam_id      || '').trim();
          const ttid = String(r.term_test_id || '').trim();
          if (eid && ttid) examToTermTest[eid] = ttid;
        });
      }

      const examIdCol = headers.indexOf('exam_id');
      let updated = 0;
      for (let i = 1; i < data.length; i++) {
        const existing = String(data[i][ttCol] || '').trim();
        if (existing) continue; // すでに入力済みはスキップ
        const eid  = examIdCol >= 0 ? String(data[i][examIdCol] || '').trim() : '';
        const ttid = examToTermTest[eid];
        if (ttid) {
          scoresSheet.getRange(i + 1, ttCol + 1).setValue(ttid);
          updated++;
        }
      }
      results.push(cramId + ': ' + updated + '行更新');
    } catch (e) {
      results.push(cramId + ': ERROR ' + e.message);
    }
  });

  Logger.log(results.join('\n'));
  return results;
}

if (typeof module !== 'undefined') Object.assign(global, {
  getAdminInitialData, getStudentList, getDashboardData,
  getAdminScores, updateAdminScore,
  migrateScoresAddTermTestId,
  getSchoolCoursesFromSettingsSheet,
  _ensureSchoolCourseMasterSheet, upsertSchoolCourse, _autoCreateExamPatterns, _autoCreateAllPatterns,
  _setDefaultSubjectsForPatterns,
});
