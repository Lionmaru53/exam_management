/**
 * LINE IDから生徒情報・試験情報・既存スコアをまとめて取得
 */
function getInitialData(lineUserId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const students = getRowsData(ss.getSheetByName('students_master'));
    const studentRaw = students.find(row => String(row.line_user_id).trim() === String(lineUserId).trim());
    if (!studentRaw) return { error: '生徒未登録' };

    const student = {
      ...studentRaw,
      school_course_name: studentRaw.school_course || studentRaw.school_course_name || '不明なコース'
    };

    const patterns = getRowsData(ss.getSheetByName('exam_patterns'))
      .filter(p => p.school_name === student.school_name && p.school_course === student.school_course);

    if (patterns.length === 0) {
      return { error: '該当する試験パターンがありません。' };
    }

    const patternIds = patterns.map(p => p.pattern_id);
    const exams = getRowsData(ss.getSheetByName('exam_data'))
      .filter(e => patternIds.includes(e.pattern_id));

    if (exams.length === 0) {
      return { error: '試験実施データ(exam_data)がありません。' };
    }

    const termTests = getRowsData(ss.getSheetByName('term_tests_master'));
    const termTestMap = termTests.reduce((map, t) => {
      map[t.term_test_id] = t.test_name;
      return map;
    }, {});

    const examsWithNames = exams.map(e => {
      const testName = termTestMap[e.term_test_id] || '名称未設定のテスト';
      return {
        ...e,
        test_name: testName
      };
    });

    const sortedExams = examsWithNames.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
    const currentExam = sortedExams[0];
    if (!currentExam) {
      return { error: '有効な試験が見つかりません' };
    }

    const allPatternSubjects = getRowsData(ss.getSheetByName('pattern_subjects'));
    const allSubjects = getRowsData(ss.getSheetByName('subjects_master'));
    const allGenres = getRowsData(ss.getSheetByName('genres_master'));
    const subjectMap = allSubjects.reduce((map, s) => {
      const gen = allGenres.find(g => g.genre_id === s.genre_id);
      map[s.subject_id] = {
        ...s,
        genre_id: gen ? gen.genre_id : null,
        genre_name: gen ? gen.genre_name : 'その他'
      };
      return map;
    }, {});

    const allScores = getRowsData(ss.getSheetByName('scores_data'));
    const patternById = patterns.reduce((map, p) => {
      map[p.pattern_id] = p;
      return map;
    }, {});

    const makeSubjectsForPattern = patternSubjects => patternSubjects.map(ps => {
      return subjectMap[ps.subject_id] || null;
    }).filter(s => s);

    const examTabs = sortedExams.map(exam => {
      let patternSubjects = allPatternSubjects.filter(ps => String(ps.pattern_id).trim() === String(exam.pattern_id).trim());
      if (patternSubjects.length === 0) {
        const fallbackPattern = patterns.find(p =>
          String(p.term_test_id).trim() === String(exam.term_test_id).trim() &&
          String(p.school_name).trim() === String(student.school_name).trim() &&
          String(p.school_course).trim() === String(student.school_course).trim()
        );
        if (fallbackPattern) {
          exam.pattern_id = fallbackPattern.pattern_id;
          patternSubjects = allPatternSubjects.filter(ps => String(ps.pattern_id).trim() === String(fallbackPattern.pattern_id).trim());
        }
      }
      const subjects = makeSubjectsForPattern(patternSubjects);
      const scores = allScores.filter(s => String(s.exam_id).trim() === String(exam.exam_id).trim() && String(s.student_id).trim() === String(student.student_id).trim());
      return {
        ...exam,
        subjects: subjects,
        scores: scores
      };
    });

    const response = {
      student: student,
      currentExam: currentExam,
      subjects: examTabs[0] ? examTabs[0].subjects : [],
      scores: examTabs[0] ? examTabs[0].scores : [],
      history: sortedExams,
      examTabs: examTabs,
      genres: allGenres
    };

    return stringifyDates(response);

  } catch (e) {
    return { error: 'GAS実行エラー: ' + e.toString() };
  }
}

/**
 * オブジェクト内のDate型をすべて文字列に変換する再帰関数
 */
function stringifyDates(obj) {
  if (obj instanceof Date) {
    // 日付型なら文字列に変換（日本時間の日付のみを抽出するなど調整可）
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