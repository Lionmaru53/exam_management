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
      line_user_id:       lineUserId,
      school_course_name: studentRaw.school_course || studentRaw.school_course_name || '不明なコース',
      sub_course:         studentRaw.sub_course || ''
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

    // 7. 教科情報（子 SS の pattern_subjects + 親 SS の subjects_master / genres_master）
    const allPatternSubjects = getRowsData(ss.getSheetByName('pattern_subjects'));
    const allSubjects        = getRowsData(parentSS.getSheetByName('subjects_master'));
    const allGenres          = getRowsData(parentSS.getSheetByName('genres_master'));

    const subjectMap = allSubjects.reduce((map, s) => {
      const gen = allGenres.find(g => g.genre_id === s.genre_id);
      map[s.subject_id] = {
        ...s,
        genre_id:     gen ? gen.genre_id   : null,
        genre_name:   gen ? gen.genre_name : 'その他',
        display_name: s.subject_name,
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

    // 9. アップロード履歴（子 SS）
    const histSheet     = ss.getSheetByName('upload_history');
    const uploadHistory = histSheet ? getRowsData(histSheet) : [];

    // 9. 全試験区分に対してタブデータを構築
    const examTabs = relevantTermTests.map(termTest => {
      const ttId  = String(termTest.term_test_id).trim();
      // 学年暦（4月始まり）で年度を計算する（カレンダー年ではない）
      const _d    = new Date();
      const year  = String(_d.getMonth() >= 3 ? _d.getFullYear() : _d.getFullYear() - 1);
      const period = _findPeriod(ttId, year);

      // パターン教科
      const patternSubjects = patternSubjectIds.map(sid => {
        const sub = subjectMap[sid];
        if (!sub) return null;
        return { ...sub, excluded: false };
      }).filter(Boolean);

      // スコア由来の追加教科（パターン外・生徒が自分で追加したもの）
      const scoreSubjectIds = allScores
        .filter(s => String(s.student_id  || '').trim() === String(student.student_id).trim()
                  && String(s.term_test_id || '').trim() === ttId
                  && String(s.subject_id  || '').trim() !== 'OTHER')
        .map(s => String(s.subject_id).trim())
        .filter(Boolean);
      const uniqueScoreSids = [...new Set(scoreSubjectIds)];
      const extraSubjects = uniqueScoreSids
        .filter(sid => !patternSubjectIds.includes(sid))
        .map(sid => {
          const sub = subjectMap[sid];
          return sub ? { ...sub, excluded: false, extra: true } : null;
        })
        .filter(Boolean);

      // OTHERスコア由来の仮教科（raw_subject_name を表示名として使用）
      const otherScores = allScores.filter(s =>
        String(s.student_id  || '').trim() === String(student.student_id).trim() &&
        String(s.term_test_id || '').trim() === ttId &&
        String(s.subject_id  || '').trim() === 'OTHER' &&
        String(s.raw_subject_name || '').trim()
      );
      const otherSubjects = otherScores.map(os => ({
        subject_id:       'OTHER',
        raw_subject_name: String(os.raw_subject_name).trim(),
        subject_name:     String(os.raw_subject_name).trim(),
        display_name:     String(os.raw_subject_name).trim(),
        genre_id:         null,
        genre_name:       String(os.genre_name || '').trim() || 'その他',
        excluded:         false,
        extra:            true
      }));

      const subjects = [...patternSubjects, ...extraSubjects, ...otherSubjects];

      const scores = allScores
        .filter(s => String(s.student_id  || '').trim() === String(student.student_id).trim()
                  && String(s.term_test_id || '').trim() === ttId)
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

    // アップロード済みファイル情報を各タブに付与
    examTabs.forEach(tab => {
      const matches = uploadHistory.filter(r =>
        String(r.student_id   || '').trim() === studentId &&
        String(r.term_test_id || '').trim() === String(tab.term_test_id || '').trim()
      );
      tab.uploadedFile = matches.length > 0 ? matches[matches.length - 1] : null;
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

    // コース未設定時: 同校のコース一覧を渡してラジオ選択に使用
    let availableCourses = [];
    if (needsCourse) {
      const scmSheet = ss.getSheetByName('school_course_master');
      if (scmSheet) {
        availableCourses = getRowsData(scmSheet)
          .filter(r => String(r.school_name || '').trim() === String(student.school_name).trim())
          .map(r => String(r.school_course || '').trim())
          .filter(Boolean);
      }
    }

    const availableSubjects = Object.values(subjectMap);

    // 10. お知らせ取得（親 SS の announcements シート）
    let announcements = [];
    const annSheet = parentSS.getSheetByName('announcements');
    if (annSheet) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      announcements = getRowsData(annSheet).filter(r => {
        if (String(r.is_active || '') !== '1') return false;
        const tc = String(r.target_cram_id || '').trim();
        if (tc && tc !== cramId) return false;
        if (r.published_at && new Date(r.published_at) > today) return false;
        if (r.expires_at) {
          const exp = new Date(r.expires_at);
          exp.setHours(23, 59, 59, 999);
          if (exp < today) return false;
        }
        return true;
      }).map(r => ({
        id:           String(r.announcement_id || ''),
        title:        String(r.title || ''),
        body:         String(r.body || ''),
        category:     String(r.category || 'info'),
        published_at: r.published_at
          ? Utilities.formatDate(new Date(r.published_at), 'JST', 'yyyy-MM-dd')
          : ''
      })).sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));
    }

    return stringifyDates({
      student,
      lineUserId,
      needsCourse,
      needsSubCourse: needsSub,
      availableCourses,
      availableSubjects,
      currentExam,
      subjects: currentExam ? currentExam.subjects : [],
      scores:   currentExam ? currentExam.scores   : [],
      history:  examTabs.filter(t => t.exam_id),
      examTabs,
      genres: allGenres,
      announcements,
      gasWebAppUrl: ScriptApp.getService().getUrl()
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

/**
 * 科目編集モード用の軽量データ取得。
 * getInitialData の全データ取得の代わりに、科目編集に必要な最小限のデータのみ返す:
 *   - availableSubjects: subjects_master + genres_master から構築した全教科リスト
 *   - patternSubjectIds: 指定 patternId の現在の教科 ID リスト
 */
function getSubjectsForEdit(studentId, patternId) {
  try {
    const parentSS = SpreadsheetApp.getActiveSpreadsheet();

    const idxSheet = parentSS.getSheetByName('student_index');
    if (!idxSheet) throw new Error('student_index シートが見つかりません');
    const idxEntry = getRowsData(idxSheet).find(r =>
      String(r.student_id || '').trim() === String(studentId || '').trim()
    );
    if (!idxEntry) throw new Error('生徒情報が見つかりません');

    const cramId = String(idxEntry.cram_id || '').trim();
    if (!cramId) throw new Error('校舎情報が未設定です');
    const ss = getChildSS(cramId);

    const allSubjects = getRowsData(parentSS.getSheetByName('subjects_master'));
    const allGenres   = getRowsData(parentSS.getSheetByName('genres_master'));

    const availableSubjects = allSubjects.map(s => {
      const gen = allGenres.find(g => g.genre_id === s.genre_id);
      return {
        ...s,
        genre_id:     gen ? gen.genre_id   : null,
        genre_name:   gen ? gen.genre_name : 'その他',
        display_name: s.subject_name,
      };
    });

    const psSheet = ss.getSheetByName('pattern_subjects');
    const patternSubjectIds = psSheet
      ? getRowsData(psSheet)
          .filter(ps => String(ps.pattern_id || '').trim() === String(patternId || '').trim())
          .map(ps => String(ps.subject_id || '').trim())
          .filter(Boolean)
      : [];

    return JSON.stringify({ availableSubjects, patternSubjectIds });
  } catch (e) {
    return JSON.stringify({ error: e.toString() });
  }
}

if (typeof module !== 'undefined') Object.assign(global, { stringifyDates, getInitialData, getSubjectsForEdit });
