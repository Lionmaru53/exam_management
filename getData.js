/**
 * LINE IDから生徒情報・試験情報・既存スコアをまとめて取得
 * - 学校の学期制に存在する全試験区分をタブ表示
 * - パターン未登録・日程未登録の試験区分も空テーブルで表示
 */
function getInitialData(lineUserId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 生徒情報を取得
    const students = getRowsData(ss.getSheetByName('students_master'));
    const studentRaw = students.find(row => String(row.line_user_id).trim() === String(lineUserId).trim());
    if (!studentRaw) return { error: '生徒未登録' };

    const student = {
      ...studentRaw,
      school_course_name: studentRaw.school_course || studentRaw.school_course_name || '不明なコース',
      sub_course: studentRaw.sub_course || ''
    };

    // 学校の学期制（is_two_terms）を【設定】学校・科シートから取得
    let is_two_terms = false;
    const settingSheet = ss.getSheetByName('【設定】学校・科');
    if (settingSheet) {
      const settingRows = settingSheet.getDataRange().getValues();
      for (let i = 1; i < settingRows.length; i++) {
        if (String(settingRows[i][0]).trim() === String(student.school_name).trim()) {
          is_two_terms = String(settingRows[i][1]).trim() === '1';
          break;
        }
      }
    }

    // term_tests_master から学期制に対応する試験区分を取得
    const termTests = getRowsData(ss.getSheetByName('term_tests_master'));
    const relevantTermTests = termTests.filter(t =>
      (String(t.is_two_terms).trim() === '1') === is_two_terms
    );

    // 学期制が設定シートから特定できなかった場合、パターンから推定（フォールバック）
    if (!settingSheet && relevantTermTests.length === 0) {
      const examPatternsFb = getRowsData(ss.getSheetByName('exam_patterns'));
      const fbPattern = examPatternsFb.find(p =>
        String(p.school_name).trim() === String(student.school_name).trim()
      );
      if (fbPattern) {
        const fbTT = termTests.find(t => t.term_test_id === fbPattern.term_test_id);
        if (fbTT) {
          is_two_terms = String(fbTT.is_two_terms).trim() === '1';
        }
      }
    }

    // 生徒の学校・コース・学年・サブ区分に合致するパターンを取得
    const examPatterns = getRowsData(ss.getSheetByName('exam_patterns'));
    const studentPatterns = examPatterns.filter(p =>
      String(p.school_name).trim()    === String(student.school_name).trim() &&
      String(p.school_course).trim()  === String(student.school_course).trim() &&
      String(p.grade || '').trim()    === String(student.grade || '').trim() &&
      String(p.sub_course || '').trim() === String(student.sub_course || '').trim()
    );

    const patternIds = studentPatterns.map(p => String(p.pattern_id));

    // exam_schedule からパターンに対応するスケジュールを取得
    const examSchedule = getRowsData(ss.getSheetByName('exam_schedule'));
    const relevantExams = examSchedule.filter(e => patternIds.includes(String(e.pattern_id).trim()));

    // subjects_master と genres_master を結合してマップを作成
    const allPatternSubjects = getRowsData(ss.getSheetByName('pattern_subjects'));
    const allSubjects        = getRowsData(ss.getSheetByName('subjects_master'));
    const allGenres          = getRowsData(ss.getSheetByName('genres_master'));
    const subjectMap = allSubjects.reduce((map, s) => {
      const gen = allGenres.find(g => g.genre_id === s.genre_id);
      map[s.subject_id] = {
        ...s,
        genre_id:   gen ? gen.genre_id   : null,
        genre_name: gen ? gen.genre_name : 'その他'
      };
      return map;
    }, {});

    const allScores = getRowsData(ss.getSheetByName('scores_data'));

    // 全試験区分に対してタブデータを構築（パターン・日程なしも含む）
    const examTabs = relevantTermTests.map(termTest => {
      const pattern = studentPatterns.find(p =>
        String(p.term_test_id).trim() === String(termTest.term_test_id).trim()
      );
      const exam = pattern
        ? relevantExams.find(e => String(e.pattern_id).trim() === String(pattern.pattern_id).trim())
        : null;

      const subjects = pattern
        ? allPatternSubjects
            .filter(ps => String(ps.pattern_id).trim() === String(pattern.pattern_id).trim())
            .map(ps => subjectMap[ps.subject_id] || null)
            .filter(Boolean)
        : [];

      const scores = exam
        ? allScores.filter(s =>
            String(s.exam_id).trim()    === String(exam.exam_id).trim() &&
            String(s.student_id).trim() === String(student.student_id).trim()
          )
        : [];

      return {
        term_test_id: termTest.term_test_id,
        test_name:    termTest.test_name,
        exam_id:      exam    ? exam.exam_id      : null,
        pattern_id:   pattern ? pattern.pattern_id : null,
        start_date:   exam    ? exam.start_date    : null,
        end_date:     exam    ? exam.end_date      : null,
        subjects,
        scores,
        hasPattern: !!pattern,
        hasExam:    !!exam
      };
    });

    // 日程あり→最新順、日程なし→term_tests_master 順
    examTabs.sort((a, b) => {
      if (a.start_date && b.start_date) return new Date(b.start_date) - new Date(a.start_date);
      if (a.start_date) return -1;
      if (b.start_date) return 1;
      return 0;
    });

    const currentExam = examTabs.find(t => t.exam_id) || examTabs[0] || null;

    return stringifyDates({
      student,
      currentExam,
      subjects: currentExam ? currentExam.subjects : [],
      scores:   currentExam ? currentExam.scores   : [],
      history:  examTabs.filter(t => t.exam_id),
      examTabs,
      genres: allGenres
    });

  } catch (e) {
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
