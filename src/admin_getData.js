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
      const g = results.genres.find(g => String(g.genre_id).trim() === String(s.genre_id).trim());
      return { ...s, genre_name: g ? g.genre_name : '未設定' };
    });

    // school_subject_aliases は廃止（フロント後方互換のため空配列を返す）
    results.schoolSubjectAliases = [];

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
    results.gasWebAppUrl = ScriptApp.getService().getUrl();
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

/**
 * 仮教科（OTHER_NNN）および旧 subject_id='OTHER' のスコアを集計して返す。
 * @returns {{ success: boolean, items?: object[], error?: string }}
 *   items: [{
 *     temp_subject_id: string|null,   // 新方式: OTHER_NNN / 旧方式: null
 *     raw_subject_name: string|null,  // 旧方式: 生徒入力名 / 新方式: null
 *     display_name: string,           // 表示用（どちらの方式でも同じ）
 *     count: number,
 *     grades: string[],
 *     genre_name: string,
 *     students: [{name, school_name, grade, school_course}]
 *   }]
 */
function getUnresolvedOtherSubjects(cramId) {
  try {
    if (!cramId) return { success: false, error: '校舎を選択してください' };

    const parentSS = SpreadsheetApp.getActiveSpreadsheet();
    const ss    = getChildSS(cramId);
    const sheet = ss.getSheetByName('scores_data');
    if (!sheet) return { success: true, items: [] };

    const data    = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    const subjCol  = headers.indexOf('subject_id');
    const rawCol   = headers.indexOf('raw_subject_name');
    const sidCol   = headers.indexOf('student_id');
    const gradeCol = headers.indexOf('grade');
    const genreCol = headers.indexOf('genre_name');
    if (subjCol < 0) return { success: true, items: [] };

    // subjects_master から is_temp='1' の仮教科を解決（命名形式に依存しない）
    const tempSubjectMap = {};
    const genreNameMap   = {};  // genre_id → genre_name
    const genreSheet = parentSS.getSheetByName('genres_master');
    if (genreSheet) {
      const gd = genreSheet.getDataRange().getValues();
      const gh = gd[0].map(h => String(h).trim());
      const giCol = gh.indexOf('genre_id');
      const gnCol = gh.indexOf('genre_name');
      for (let i = 1; i < gd.length; i++) {
        const gid = String(gd[i][giCol] || '').trim();
        if (gid) genreNameMap[gid] = String(gd[i][gnCol] || '').trim();
      }
    }
    const subSheet = parentSS.getSheetByName('subjects_master');
    if (subSheet) {
      const sd = subSheet.getDataRange().getValues();
      const sh = sd[0].map(h => String(h).trim());
      const sIdCol    = sh.indexOf('subject_id');
      const sNmCol    = sh.indexOf('subject_name');
      const sGiCol    = sh.indexOf('genre_id');
      const sIsTmpCol = sh.indexOf('is_temp');
      if (sIdCol >= 0 && sIsTmpCol >= 0) {
        for (let i = 1; i < sd.length; i++) {
          // is_temp='1' のエントリのみ仮教科として登録
          if (String(sd[i][sIsTmpCol] || '').trim() !== '1') continue;
          const sid = String(sd[i][sIdCol] || '').trim();
          if (!sid) continue;
          const gid = String(sd[i][sGiCol] || '').trim();
          tempSubjectMap[sid] = {
            subject_name: String(sd[i][sNmCol] || '').trim(),
            genre_name:   gid ? (genreNameMap[gid] || '') : ''
          };
        }
      }
    }

    // 生徒情報マップ
    const stuSheet = ss.getSheetByName('students_master');
    const stuMap   = {};
    if (stuSheet) {
      getRowsData(stuSheet).forEach(s => {
        if (s.student_id) stuMap[String(s.student_id).trim()] = {
          name:          String(s.name          || '').trim(),
          school_name:   String(s.school_name   || '').trim(),
          grade:         String(s.grade         || '').trim(),
          school_course: String(s.school_course || '').trim(),
        };
      });
    }

    // mapKey → 集計オブジェクト
    const map = {};

    for (let i = 1; i < data.length; i++) {
      const subjectId = String(data[i][subjCol] || '').trim();
      let mapKey, displayName, tempId, rawSubjName, gnVal;

      if (tempSubjectMap[subjectId]) {
        // 新方式：is_temp='1' の仮教科
        mapKey      = subjectId;
        tempId      = subjectId;
        rawSubjName = null;
        const info  = tempSubjectMap[subjectId];
        displayName = info.subject_name || subjectId;
        gnVal       = info.genre_name   || '';
      } else if (subjectId === 'OTHER' && rawCol >= 0) {
        // 旧方式
        const raw = String(data[i][rawCol] || '').trim();
        if (!raw) continue;
        mapKey      = 'LEGACY:' + raw;
        tempId      = null;
        rawSubjName = raw;
        displayName = raw;
        gnVal       = genreCol >= 0 ? String(data[i][genreCol] || '').trim() : '';
      } else {
        continue;
      }

      if (!map[mapKey]) map[mapKey] = {
        temp_subject_id:  tempId,
        raw_subject_name: rawSubjName,
        display_name:     displayName,
        count:       0,
        student_ids: new Set(),
        grades:      new Set(),
        genre_name:  gnVal
      };
      map[mapKey].count++;
      if (sidCol   >= 0) map[mapKey].student_ids.add(String(data[i][sidCol]   || '').trim());
      if (gradeCol >= 0) map[mapKey].grades.add(     String(data[i][gradeCol] || '').trim());
      if (!map[mapKey].genre_name && gnVal) map[mapKey].genre_name = gnVal;
    }

    const items = Object.values(map).map(item => {
      const students = [...item.student_ids].map(id => stuMap[id] || { name: id, school_name: '', grade: '', school_course: '' });
      return {
        temp_subject_id:  item.temp_subject_id,
        raw_subject_name: item.raw_subject_name,
        display_name:     item.display_name,
        count:            item.count,
        grades:           [...item.grades].filter(Boolean),
        genre_name:       item.genre_name,
        students,
      };
    });
    items.sort((a, b) => b.count - a.count);

    return { success: true, items };
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
 * コース名末尾の「コース」「科」を除去して正規化する。
 * 例: "普通科" → "普通", "特進コース" → "特進", "普通科コース" → "普通科"
 */
function _normalizeCourseName(name) {
  let s = String(name || '').trim();
  if (s.endsWith('コース')) s = s.slice(0, -3);
  else if (s.endsWith('科'))  s = s.slice(0, -1);
  return s;
}

/**
 * school_course_master に (school_name, school_course) の行を upsert する。
 * 同一の組み合わせが既にあればスキップ。
 * 新規追加の場合、exam_patterns を5組み合わせ（高1/''/高2-3/文系・理系）で自動生成する。
 */
function upsertSchoolCourse(ss, schoolName, courseName) {
  const sn = String(schoolName || '').trim();
  const cn = _normalizeCourseName(courseName);
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
    const patternInfos = newRows.map(r => ({ pattern_id: r[0], grade: r[3] }));
    _addTotalGenreSubjects(childSS, patternInfos);
  }
}

/**
 * exam_patterns に school/course/sub_course × grade の行を自動生成する（既存行はスキップ）。
 * grades を省略した場合は ['高1', '高2', '高3'] を使用。
 * sub_course がある場合、同 school/course/grade の sub_course なしパターンから教科をコピーする。
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
  if (newRows.length === 0) return;

  patSheet.getRange(patSheet.getLastRow() + 1, 1, newRows.length, 5).setValues(newRows);
  _addTotalGenreSubjects(childSS, newRows.map(r => ({ pattern_id: r[0], grade: r[3] })));

  // sub_course がある新規パターンは、sub_course なしの既存パターンから教科をコピーしてマージ
  if (subCourse) {
    const psSheet   = childSS.getSheetByName('pattern_subjects');
    const existingPs = psSheet ? getRowsData(psSheet) : [];
    const newPsRows  = [];

    newRows.forEach(r => {
      const newPatternId = r[0];
      const grade        = r[3];
      const basePattern  = existing.find(p =>
        String(p.school_name   || '').trim() === schoolName   &&
        String(p.school_course || '').trim() === schoolCourse &&
        String(p.grade         || '').trim() === grade        &&
        String(p.sub_course    || '').trim() === ''
      );
      if (basePattern) {
        existingPs
          .filter(ps => String(ps.pattern_id).trim() === String(basePattern.pattern_id).trim())
          .map(ps => String(ps.subject_id).trim())
          .filter(Boolean)
          .forEach(sid => newPsRows.push([newPatternId, sid]));
      }
    });

    if (newPsRows.length > 0 && psSheet) {
      psSheet.getRange(psSheet.getLastRow() + 1, 1, newPsRows.length, 2).setValues(newPsRows);
    }
  }
}

/**
 * genre_id='to'（合計）に属する全科目を指定パターンの pattern_subjects に自動登録する。
 * 重複はスキップ。subjects_master.grade が空 or パターンの grade と一致する科目のみ対象。
 */
function _addTotalGenreSubjects(childSS, patternInfos) {
  if (!patternInfos || patternInfos.length === 0) return;
  const psSheet = childSS.getSheetByName('pattern_subjects');
  if (!psSheet) return;

  const parentSS = SpreadsheetApp.getActiveSpreadsheet();
  const subSheet  = parentSS.getSheetByName('subjects_master');
  if (!subSheet) return;

  const totalSubjects = getRowsData(subSheet).filter(s =>
    String(s.genre_id || '').trim() === 'to'
  );
  if (totalSubjects.length === 0) return;

  const existingSet = new Set(
    getRowsData(psSheet).map(r => String(r.pattern_id) + '||' + String(r.subject_id))
  );

  const newPsRows = [];
  patternInfos.forEach(({ pattern_id, grade }) => {
    totalSubjects
      .filter(s => { const sg = String(s.grade || '').trim(); return !sg || sg === grade; })
      .forEach(s => {
        const sid = String(s.subject_id || '').trim();
        if (!sid) return;
        const key = pattern_id + '||' + sid;
        if (!existingSet.has(key)) { newPsRows.push([pattern_id, sid]); existingSet.add(key); }
      });
  });

  if (newPsRows.length > 0)
    psSheet.getRange(psSheet.getLastRow() + 1, 1, newPsRows.length, 2).setValues(newPsRows);
}

/**
 * ダッシュボード用データを取得する（master のみ呼び出し）。
 * liff_access_log の最新20件をタイムスタンプ時刻付きで返す。
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

    const formatted = rows.slice(0, 20).map(function(row) {
      const copy = {};
      Object.keys(row).forEach(function(k) {
        const v = row[k];
        if (k === 'timestamp') {
          copy[k] = (v instanceof Date)
            ? Utilities.formatDate(v, 'JST', 'yyyy/MM/dd HH:mm')
            : String(v || '');
        } else {
          copy[k] = (v instanceof Date)
            ? Utilities.formatDate(v, 'JST', 'yyyy-MM-dd')
            : v;
        }
      });
      return copy;
    });

    const bugSheet = ss.getSheetByName('bug_reports');
    const bugCount = bugSheet && bugSheet.getLastRow() > 1 ? bugSheet.getLastRow() - 1 : 0;

    return { success: true, recentAccesses: formatted, bugCount: bugCount };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 不具合報告一覧を返す（master のみ）。
 * @returns {{ success: boolean, reports?: object[], error?: string }}
 */
function getBugReports() {
  try {
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: 'アクセス権限がありません' };
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('bug_reports');
    if (!sheet || sheet.getLastRow() <= 1) return { success: true, reports: [] };
    const rows = stringifyDates(getRowsData(sheet));
    rows.reverse(); // 最新順
    return { success: true, reports: rows };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 不具合報告の解決済みフラグを切り替える（master のみ）。
 * @param {string} reportId  - 対象の report_id
 * @param {boolean} resolved - true = 解決済み、false = 未解決
 */
function resolveBugReport(reportId, resolved) {
  try {
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: 'アクセス権限がありません' };
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('bug_reports');
    if (!sheet) return { success: false, error: 'bug_reports シートが見つかりません' };
    const rows = getRowsData(sheet);
    const idx  = rows.findIndex(r => String(r.report_id || '').trim() === String(reportId || '').trim());
    if (idx < 0) return { success: false, error: '対象の報告が見つかりません' };
    const rowNum = idx + 2; // 1-indexed + header
    // is_resolved は 9列目
    sheet.getRange(rowNum, 9).setValue(resolved ? '1' : '');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * subjects_master に教科を追加する（master のみ）。
 * @param {{ subject_id, subject_name, genre_id, grade }} payload
 */
function addSubject(payload) {
  try {
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: 'アクセス権限がありません' };
    const parentSS = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = parentSS.getSheetByName('subjects_master');
    if (!sheet) throw new Error('subjects_master シートが見つかりません');
    const rows = getRowsData(sheet);
    if (rows.some(r => String(r.subject_id || '').trim() === String(payload.subject_id || '').trim())) {
      return { success: false, error: '教科ID "' + payload.subject_id + '" は既に使用されています' };
    }
    if (!payload.subject_id || !payload.subject_name || !payload.genre_id) {
      return { success: false, error: '教科ID・教科名・ジャンルは必須です' };
    }
    sheet.appendRow([payload.subject_id, payload.subject_name, payload.genre_id, payload.grade || '', '']);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * subjects_master の既存行を更新する（master のみ）。
 * subject_id は変更不可（PK）。
 * @param {{ subject_id, subject_name, genre_id, grade }} payload
 */
function updateSubject(payload) {
  try {
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: 'アクセス権限がありません' };
    const parentSS = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = parentSS.getSheetByName('subjects_master');
    if (!sheet) throw new Error('subjects_master シートが見つかりません');
    const rows = getRowsData(sheet);
    const idx = rows.findIndex(r => String(r.subject_id || '').trim() === String(payload.subject_id || '').trim());
    if (idx < 0) return { success: false, error: '対象の教科が見つかりません' };
    const rowNum = idx + 2; // 1-indexed + header
    sheet.getRange(rowNum, 2).setValue(payload.subject_name);
    sheet.getRange(rowNum, 3).setValue(payload.genre_id);
    sheet.getRange(rowNum, 4).setValue(payload.grade || '');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * subjects_master から教科を削除する（master のみ）。
 * @param {string} subjectId
 */
function deleteSubject(subjectId) {
  try {
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: 'アクセス権限がありません' };
    const parentSS = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = parentSS.getSheetByName('subjects_master');
    if (!sheet) throw new Error('subjects_master シートが見つかりません');
    const rows = getRowsData(sheet);
    const idx = rows.findIndex(r => String(r.subject_id || '').trim() === String(subjectId || '').trim());
    if (idx < 0) return { success: false, error: '対象の教科が見つかりません' };
    sheet.deleteRow(idx + 2);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 管理者向け：指定試験区分・年度の scores_data・students を一括取得する。
 *
 * @param {string} targetCramId
 * @param {string} termTestId
 * @param {string} [year] - 学年暦年度（例: "2025"）。省略時は全年度を返す
 * @returns {{ success: boolean, scores?: object[], students?: object[], error?: string }}
 */
function getAdminScores(targetCramId, termTestId, year) {
  try {
    const ctx  = getAdminContext();
    const ids  = ctx.cram_ids || [];
    const cramId = ctx.role === 'branch_admin'
      ? ((targetCramId && ids.includes(String(targetCramId))) ? targetCramId : (ids[0] || ''))
      : (targetCramId || '');
    if (!cramId)     return { success: false, error: '校舎を選択してください' };
    if (!termTestId) return { success: false, error: '試験区分を選択してください' };

    const yearFilter = year ? String(year).trim() : '';
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

    // scores_data を生徒ID × term_test_id × year で絞り込んで取得
    const scoresSheet = childSS.getSheetByName('scores_data');
    if (!scoresSheet) return { success: false, error: 'scores_data シートが見つかりません' };
    const scores = getRowsData(scoresSheet)
      .filter(s => studentIdSet.has(String(s.student_id || '').trim())
                && String(s.term_test_id || '').trim() === termTestId
                && (!yearFilter || String(s.year || '').trim() === yearFilter))
      .map(s => ({
        score_id:     String(s.score_id     || '').trim(),
        student_id:   String(s.student_id   || '').trim(),
        subject_id:   String(s.subject_id   || '').trim(),
        term_test_id: String(s.term_test_id || '').trim(),
        year:         String(s.year         || '').trim(),
        grade:        String(s.grade        || '').trim(),
        score:      (s.score      !== '' && s.score      != null) ? String(s.score)      : null,
        grade_rank: (s.grade_rank !== '' && s.grade_rank != null) ? String(s.grade_rank) : null,
        class_rank: (s.class_rank !== '' && s.class_rank != null) ? String(s.class_rank) : null,
        not_taken:  s.not_taken === true || String(s.not_taken || '') === '1',
        update_at:  String(s.update_at || ''),
      }));

    // upload_history シートから当該 term_test_id の提出履歴を取得
    var uploads = [];
    try {
      const uploadSheet = childSS.getSheetByName('upload_history');
      if (uploadSheet && uploadSheet.getLastRow() > 1) {
        uploads = getRowsData(uploadSheet)
          .filter(function(r) { return String(r.term_test_id || '').trim() === termTestId; })
          .map(function(r) {
            return {
              student_id:    String(r.student_id    || '').trim(),
              term_test_id:  String(r.term_test_id  || '').trim(),
              thumbnail_b64: String(r.thumbnail_b64 || ''),
              file_url:      String(r.file_url       || '')
            };
          });
      }
    } catch (_uploadErr) {
      // upload_history シートがない場合は無視
    }

    // school_averages シートから当該 term_test_id の学校平均を取得
    var schoolAverages = [];
    try {
      const avgSheet = childSS.getSheetByName('school_averages');
      if (avgSheet && avgSheet.getLastRow() > 1) {
        schoolAverages = getRowsData(avgSheet)
          .filter(function(r) {
            return String(r.term_test_id || '').trim() === termTestId
              && (!yearFilter || String(r.year || '').trim() === yearFilter);
          })
          .map(function(r) {
            return {
              school_name:   String(r.school_name   || '').trim(),
              school_course: String(r.school_course || '').trim(),
              grade:         String(r.grade         || '').trim(),
              sub_course:    String(r.sub_course    || '').trim(),
              term_test_id:  String(r.term_test_id  || '').trim(),
              year:          String(r.year          || '').trim(),
              subject_id:    String(r.subject_id    || '').trim(),
              grade_avg:     r.grade_avg != null && r.grade_avg !== '' ? Number(r.grade_avg) : null,
              updated_at:    String(r.updated_at || ''),
            };
          });
      }
    } catch (_avgErr) {
      // school_averages シートがない場合は無視
    }

    return {
      success: true,
      scores,
      students,
      uploads,
      schoolAverages,
      termTestId,
      year: yearFilter,
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
 * 管理者向け：scores_data に新規スコアを1件追加
 * （admin UI の空欄セルをクリックして登録する場合）
 *
 * @param {{ cramId, studentId, subjectId, termTestId, year, grade, score, gradeRank, classRank, notTaken }} payload
 */
function createAdminScore(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    const ctx    = getAdminContext();
    const cramId = String(payload.cramId || '').trim();
    const ids    = ctx.cram_ids || [];
    if (ctx.role !== 'master' && !ids.includes(cramId))
      return { success: false, error: '権限がありません' };
    if (!cramId) return { success: false, error: '校舎が指定されていません' };

    const studentId  = String(payload.studentId  || '').trim();
    const subjectId  = String(payload.subjectId  || '').trim();
    const termTestId = String(payload.termTestId || '').trim();
    if (!studentId || !subjectId || !termTestId)
      return { success: false, error: '必須パラメータが不足しています' };

    const childSS = getChildSS(cramId);
    const sheet   = childSS.getSheetByName('scores_data');
    if (!sheet) return { success: false, error: 'scores_data シートが見つかりません' };

    const data    = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    const sidCol  = headers.indexOf('student_id');
    const subCol  = headers.indexOf('subject_id');
    const ttCol   = headers.indexOf('term_test_id');

    // 重複チェック
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][sidCol] || '').trim() === studentId &&
          String(data[i][subCol] || '').trim() === subjectId &&
          String(data[i][ttCol]  || '').trim() === termTestId) {
        return { success: false, error: '既存レコードが存在します' };
      }
    }

    const scoreId   = 'SC' + Utilities.getUuid().replace(/-/g, '');
    const scoreVal  = payload.score     !== '' && payload.score     != null ? Number(payload.score)     : '';
    const gradeRkVal= payload.gradeRank !== '' && payload.gradeRank != null ? Number(payload.gradeRank) : '';
    const classRkVal= payload.classRank !== '' && payload.classRank != null ? Number(payload.classRank) : '';
    const now = new Date();

    const row = headers.map(h => {
      switch (h) {
        case 'score_id':    return scoreId;
        case 'exam_id':     return '';
        case 'student_id':  return studentId;
        case 'subject_id':  return subjectId;
        case 'score':       return scoreVal;
        case 'grade_rank':  return gradeRkVal;
        case 'class_rank':  return classRkVal;
        case 'update_at':   return now;
        case 'not_taken':   return payload.notTaken ? '1' : '';
        case 'term_test_id': return termTestId;
        case 'grade':       return String(payload.grade || '').trim();
        case 'year':        return String(payload.year  || '').trim();
        default:            return '';
      }
    });

    sheet.appendRow(row);
    writeAuditLog(ctx, 'create_admin_score', { cramId, scoreId, studentId, subjectId, termTestId }, 'success');
    return { success: true, score_id: scoreId };
  } catch (e) {
    console.error('createAdminScore error:', e);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * お知らせ一覧取得（master のみ）
 */
function getAdminAnnouncements() {
  try {
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: 'アクセス権限がありません' };
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('announcements');
    if (!sheet || sheet.getLastRow() <= 1) return { success: true, announcements: [] };
    const rows = getRowsData(sheet).map(function(r) {
      const obj = {};
      for (const k in r) {
        const v = r[k];
        obj[k] = v instanceof Date
          ? Utilities.formatDate(v, 'JST', "yyyy-MM-dd'T'HH:mm")
          : v;
      }
      return obj;
    });
    rows.sort(function(a, b) {
      return (b.published_at || '').localeCompare(a.published_at || '');
    });
    return { success: true, announcements: rows };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * お知らせ追加（master のみ）
 */
function addAnnouncement(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: 'アクセス権限がありません' };
    if (!payload || !String(payload.title || '').trim()) {
      return { success: false, error: 'タイトルは必須です' };
    }
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('announcements');
    if (!sheet) return { success: false, error: 'announcements シートが見つかりません' };
    const annId = 'ANN' + Utilities.getUuid().replace(/-/g, '').substring(0, 10).toUpperCase();
    sheet.appendRow([
      annId,
      String(payload.title        || '').trim(),
      String(payload.body         || ''),
      String(payload.category     || 'info'),
      String(payload.target_cram_id || ''),
      payload.published_at ? new Date(payload.published_at) : '',
      payload.expires_at   ? new Date(payload.expires_at)   : '',
      payload.is_active === false || payload.is_active === '0' ? '' : '1'
    ]);
    writeAuditLog(ctx, 'add_announcement', { announcement_id: annId, title: payload.title }, 'success');
    return { success: true, announcement_id: annId };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * お知らせ更新（master のみ）
 */
function updateAnnouncement(announcementId, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: 'アクセス権限がありません' };
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('announcements');
    if (!sheet) return { success: false, error: 'announcements シートが見つかりません' };
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const idCol   = headers.indexOf('announcement_id');
    if (idCol < 0) return { success: false, error: 'announcement_id 列が見つかりません' };
    const colMap = {};
    headers.forEach(function(h, i) { colMap[h] = i + 1; });
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol] || '').trim() !== String(announcementId || '').trim()) continue;
      const rowNum = i + 1;
      const set = function(col, val) {
        if (colMap[col]) sheet.getRange(rowNum, colMap[col]).setValue(val);
      };
      if (payload.title         !== undefined) set('title',         String(payload.title || '').trim());
      if (payload.body          !== undefined) set('body',          String(payload.body || ''));
      if (payload.category      !== undefined) set('category',      String(payload.category || 'info'));
      if (payload.target_cram_id !== undefined) set('target_cram_id', String(payload.target_cram_id || ''));
      if (payload.published_at  !== undefined) set('published_at',  payload.published_at ? new Date(payload.published_at) : '');
      if (payload.expires_at    !== undefined) set('expires_at',    payload.expires_at   ? new Date(payload.expires_at)   : '');
      if (payload.is_active     !== undefined) set('is_active',     payload.is_active === false || payload.is_active === '0' ? '' : '1');
      writeAuditLog(ctx, 'update_announcement', { announcement_id: announcementId }, 'success');
      return { success: true };
    }
    return { success: false, error: '対象のお知らせが見つかりません' };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * お知らせ削除（master のみ）
 */
function deleteAnnouncement(announcementId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ctx = getAdminContext();
    if (ctx.role !== 'master') return { success: false, error: 'アクセス権限がありません' };
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('announcements');
    if (!sheet) return { success: false, error: 'announcements シートが見つかりません' };
    const data  = sheet.getDataRange().getValues();
    const idCol = data[0].indexOf('announcement_id');
    if (idCol < 0) return { success: false, error: 'announcement_id 列が見つかりません' };
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol] || '').trim() !== String(announcementId || '').trim()) continue;
      sheet.deleteRow(i + 1);
      writeAuditLog(ctx, 'delete_announcement', { announcement_id: announcementId }, 'success');
      return { success: true };
    }
    return { success: false, error: '対象のお知らせが見つかりません' };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * スコアの科目IDを変更する（管理者向け）。
 * scores_data の subject_id 列を直接更新する。
 *
 * @param {{ cramId: string, scoreId: string, newSubjectId: string }} payload
 * @returns {{ success: boolean, error?: string }}
 */
function changeScoreSubject(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ctx    = getAdminContext();
    const cramId = String(payload.cramId || '').trim();
    if (!cramId) return { success: false, error: '校舎IDが指定されていません' };

    const childSS = getChildSS(cramId);
    const sheet   = childSS.getSheetByName('scores_data');
    if (!sheet) return { success: false, error: 'scores_data シートが見つかりません' };

    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const scoreIdCol   = headers.indexOf('score_id');
    const subjectIdCol = headers.indexOf('subject_id');
    if (scoreIdCol < 0 || subjectIdCol < 0) {
      return { success: false, error: 'score_id または subject_id 列が見つかりません' };
    }

    const targetScoreId   = String(payload.scoreId     || '').trim();
    const newSubjectId    = String(payload.newSubjectId || '').trim();
    if (!targetScoreId || !newSubjectId) {
      return { success: false, error: 'scoreId と newSubjectId は必須です' };
    }

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][scoreIdCol] || '').trim() !== targetScoreId) continue;
      sheet.getRange(i + 1, subjectIdCol + 1).setValue(newSubjectId);
      writeAuditLog(ctx, 'change_score_subject',
        { score_id: targetScoreId, new_subject_id: newSubjectId }, 'success');
      return { success: true };
    }

    return { success: false, error: '対象のスコアが見つかりません' };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

if (typeof module !== 'undefined') Object.assign(global, {
  getAdminInitialData, getStudentList, getDashboardData,
  getBugReports,
  addSubject, updateSubject, deleteSubject,
  getAdminScores, updateAdminScore, createAdminScore, changeScoreSubject,
  getAdminAnnouncements, addAnnouncement, updateAnnouncement, deleteAnnouncement,
  getSchoolCoursesFromSettingsSheet,
  _normalizeCourseName,
  _ensureSchoolCourseMasterSheet, upsertSchoolCourse, _autoCreateExamPatterns, _autoCreateAllPatterns,
});
