const LIFF_ACCESS_LOG_SHEET = 'liff_access_log';

function _writeLiffLog(parentSS, lineUserId, result, studentId, cramId, studentName) {
  try {
    let sheet = parentSS.getSheetByName(LIFF_ACCESS_LOG_SHEET);
    if (!sheet) {
      sheet = parentSS.insertSheet(LIFF_ACCESS_LOG_SHEET);
      sheet.getRange(1, 1, 1, 6).setValues([[
        'timestamp', 'line_user_id', 'result', 'student_id', 'cram_id', 'student_name'
      ]]);
    }
    sheet.appendRow([
      new Date(),
      String(lineUserId || ''),
      String(result || ''),
      String(studentId || ''),
      String(cramId || ''),
      String(studentName || '')
    ]);
  } catch (e) {
    console.warn('liff_access_log 書き込み失敗:', e.message);
  }
}

/**
 * LINE IDから生徒情報・試験情報・既存スコアをまとめて取得
 *
 * ルーティング:
 *   親 SS の student_index で line_user_id → cram_id を引き、
 *   getChildSS(cram_id) で子 SS を開く。
 *
 * 親 SS から読むもの: term_tests_master / genres_master / subjects_master
 * 子 SS から読むもの: students_master / exam_patterns / exam_schedule /
 *                     pattern_subjects / scores_data / school_course_master
 */
function getInitialData(lineUserId) {
  try {
    const parentSS = SpreadsheetApp.getActiveSpreadsheet();

    // 1. student_index で line_user_id → cram_id を解決
    const idxSheet = parentSS.getSheetByName('student_index');
    if (!idxSheet) {
      _writeLiffLog(parentSS, lineUserId, '生徒未登録_1');
      return { error: 'システムエラーが発生しました。管理者にお問い合わせください。', errorCode: 'SYSTEM_ERROR' };
    }

    const idxRows  = getRowsData(idxSheet);
    const idxEntry = idxRows.find(r =>
      String(r.line_user_id || '').trim() === String(lineUserId).trim()
    );
    if (!idxEntry) {
      _writeLiffLog(parentSS, lineUserId, '生徒未登録_2');
      return { error: 'このLINEアカウントは登録されていません。', errorCode: 'NOT_LINKED' };
    }

    const cramId = String(idxEntry.cram_id || '').trim();
    if (!cramId) {
      _writeLiffLog(parentSS, lineUserId, '生徒未登録_3');
      return { error: '校舎情報が設定されていません。管理者にお問い合わせください。', errorCode: 'NO_BRANCH' };
    }

    // 2. 子 SS を開く
    const ss = getChildSS(cramId);

    // 3. 生徒情報を取得（子 SS）
    // student_index から得た student_id で検索する（保護者 LINE ID でもアクセス可能にするため）
    const studentId  = String(idxEntry.student_id || '').trim();
    const students   = getRowsData(ss.getSheetByName('students_master'));
    const studentRaw = students.find(row =>
      String(row.student_id || '').trim() === studentId
    );
    if (!studentRaw) {
      _writeLiffLog(parentSS, lineUserId, '生徒未登録_4', '', cramId);
      return { error: '生徒情報が見つかりません。管理者にお問い合わせください。', errorCode: 'STUDENT_NOT_FOUND' };
    }

    const student = {
      ...studentRaw,
      school_course_name: studentRaw.school_course || studentRaw.school_course_name || '不明なコース',
      sub_course: studentRaw.sub_course || ''
    };

    // 4-5. term_tests_master（親 SS）+ 学校別試験区分設定
    const termTests = getRowsData(parentSS.getSheetByName('term_tests_master'));
    const sttSheet  = parentSS.getSheetByName('school_term_test_settings');
    let relevantTermTests = termTests;
    if (sttSheet) {
      const sttRows = getRowsData(sttSheet).filter(r =>
        String(r.school_name || '').trim() === String(student.school_name).trim()
      );
      if (sttRows.length > 0) {
        const activeMap = {};
        sttRows.forEach(r => {
          if (String(r.is_active || '').trim() === '1')
            activeMap[String(r.term_test_id).trim()] = String(r.display_name || '').trim();
        });
        relevantTermTests = termTests
          .filter(t => activeMap.hasOwnProperty(String(t.term_test_id).trim()))
          .map(t => ({
            ...t,
            test_name: activeMap[String(t.term_test_id).trim()] || t.test_name
          }));
      }
    }

    // 6. 生徒の年間パターンを1件取得（子 SS）
    const examPatterns   = getRowsData(ss.getSheetByName('exam_patterns'));
    const studentPattern = examPatterns.find(p =>
      String(p.school_name   || '').trim() === String(student.school_name).trim()   &&
      String(p.school_course || '').trim() === String(student.school_course).trim() &&
      String(p.grade         || '').trim() === String(student.grade || '').trim()   &&
      String(p.sub_course    || '').trim() === String(student.sub_course || '').trim()
    );
    const patternId = studentPattern ? String(studentPattern.pattern_id).trim() : null;

    // school_exam_periods から生徒の学校に一致する試験期間を優先度照合で取得
    const periodSheet  = ss.getSheetByName('school_exam_periods');
    const allPeriods   = periodSheet ? getRowsData(periodSheet) : [];
    const _sn  = String(student.school_name   || '').trim();
    const _sc  = String(student.school_course || '').trim();
    const _gr  = String(student.grade         || '').trim();
    const _sub = String(student.sub_course    || '').trim();

    function _findPeriod(termTestId, year) {
      const yr = String(year || '');
      const candidates = allPeriods.filter(function(p) {
        return String(p.school_name  || '').trim() === _sn
            && String(p.term_test_id || '').trim() === termTestId
            && String(p.year         || '')         === yr;
      });
      var ranked = candidates.map(function(p) {
        const c = String(p.school_course || '').trim();
        const g = String(p.grade         || '').trim();
        const s = String(p.sub_course    || '').trim();
        const r = (c === _sc ? 8 : c === '' ? 0 : -99)
                + (g === _gr  ? 4 : g === '' ? 0 : -99)
                + (s === _sub ? 2 : s === '' ? 0 : -99);
        return { p: p, r: r };
      }).filter(function(x) { return x.r >= 0; });
      ranked.sort(function(a, b) { return b.r - a.r; });
      return ranked.length > 0 ? ranked[0].p : null;
    }

    // 7. 教科情報（子 SS の pattern_subjects + 親 SS の subjects_master / genres_master / school_subject_aliases）
    const allPatternSubjects = getRowsData(ss.getSheetByName('pattern_subjects'));
    const allSubjects        = getRowsData(parentSS.getSheetByName('subjects_master'));
    const allGenres          = getRowsData(parentSS.getSheetByName('genres_master'));

    // 学校別表示名エイリアス: { "school_name||subject_id" → display_name }
    const aliasSheet = parentSS.getSheetByName('school_subject_aliases');
    const aliasMap   = {};
    if (aliasSheet) {
      getRowsData(aliasSheet).forEach(a => {
        const key = String(a.school_name || '').trim() + '||' + String(a.subject_id || '').trim();
        if (a.display_name) aliasMap[key] = String(a.display_name).trim();
      });
    }

    const subjectMap = allSubjects.reduce((map, s) => {
      const gen = allGenres.find(g => g.genre_id === s.genre_id);
      const aliasKey = String(student.school_name || '').trim() + '||' + String(s.subject_id || '').trim();
      map[s.subject_id] = {
        ...s,
        genre_id:     gen ? gen.genre_id   : null,
        genre_name:   gen ? gen.genre_name : 'その他',
        display_name: aliasMap[aliasKey] || s.subject_name,
      };
      return map;
    }, {});

    // 年間共通教科セット（1パターン分）
    const patternSubjectIds = patternId
      ? allPatternSubjects
          .filter(ps => String(ps.pattern_id || '').trim() === patternId)
          .map(ps => String(ps.subject_id || '').trim())
          .filter(Boolean)
      : [];

    // 8. 得点（子 SS）
    const allScores = getRowsData(ss.getSheetByName('scores_data'));

    // 9. 全試験区分に対してタブデータを構築
    const examTabs = relevantTermTests.map(termTest => {
      const ttId  = String(termTest.term_test_id).trim();
      // 学年暦（4月始まり）で年度を計算する（カレンダー年ではない）
      const _d    = new Date();
      const year  = String(_d.getMonth() >= 3 ? _d.getFullYear() : _d.getFullYear() - 1);
      const period = _findPeriod(ttId, year);

      const subjects = patternSubjectIds.map(sid => {
        const sub = subjectMap[sid];
        if (!sub) return null;
        return { ...sub, excluded: false };
      }).filter(Boolean);

      // scores_data は exam_id で結合しているが、school_exam_periods には exam_id がない。
      // 暫定: term_test_id × student_id でスコアを検索（将来的に exam_id を school_exam_periods に追加するか検討）
      const scores = allScores
        .filter(s => String(s.student_id || '').trim() === String(student.student_id).trim())
        .map(s => ({ ...s, not_taken: String(s.not_taken || '') === '1' }));

      return {
        term_test_id: ttId,
        year,
        test_name:    termTest.test_name,
        exam_id:      null,
        pattern_id:   patternId,
        start_date:   period ? period.start_date : null,
        end_date:     period ? period.end_date   : null,
        subjects,
        scores,
        hasPattern: !!studentPattern,
        hasExam:    !!period
      };
    });

    examTabs.sort((a, b) => {
      if (a.start_date && b.start_date) return new Date(b.start_date) - new Date(a.start_date);
      if (a.start_date) return -1;
      if (b.start_date) return 1;
      return 0;
    });

    // パターンがある（教科が表示できる）タブを優先して選択
    const currentExam = examTabs.find(t => t.hasPattern) || examTabs[0] || null;

    _writeLiffLog(parentSS, lineUserId, 'success', student.student_id, cramId, student.name);

    // 未設定項目のチェック（コース未設定が優先）
    const grade       = String(student.grade        || '').trim();
    const subCourse   = String(student.sub_course   || '').trim();
    const course      = String(student.school_course|| '').trim();
    const needsCourse = !course;
    const needsSub    = !needsCourse && (grade === '高2' || grade === '高3') && !subCourse;

    return stringifyDates({
      student,
      lineUserId,
      needsCourse,
      needsSubCourse: needsSub,
      currentExam,
      subjects: currentExam ? currentExam.subjects : [],
      scores:   currentExam ? currentExam.scores   : [],
      history:  examTabs.filter(t => t.exam_id),
      examTabs,
      genres: allGenres
    });

  } catch (e) {
    try {
      _writeLiffLog(SpreadsheetApp.getActiveSpreadsheet(), lineUserId, 'error: ' + e.message);
    } catch (_) {}
    return { error: 'GAS実行エラー: ' + e.toString() };
  }
}

/**
 * オブジェクト内のDate型をすべて文字列に変換する再帰関数
 */
function stringifyDates(obj) {
  if (obj instanceof Date) {
    return Utilities.formatDate(obj, "JST", "yyyy-MM-dd");
  }
  if (Array.isArray(obj)) {
    return obj.map(stringifyDates);
  }
  if (typeof obj === 'object' && obj !== null) {
    const newObj = {};
    for (const key in obj) {
      newObj[key] = stringifyDates(obj[key]);
    }
    return newObj;
  }
  return obj;
}

if (typeof module !== 'undefined') Object.assign(global, { stringifyDates, getInitialData });
