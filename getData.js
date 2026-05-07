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

    // exam_patterns から生徒の学校・コースに合致するパターンを取得
    const examPatterns = getRowsData(ss.getSheetByName('exam_patterns'));
    const studentPatterns = examPatterns.filter(p =>
      String(p.school_name).trim() === String(student.school_name).trim() &&
      String(p.school_course).trim() === String(student.school_course).trim()
    );

    if (studentPatterns.length === 0) {
      return { error: '該当する試験パターンがありません。' };
    }

    const patternIds = studentPatterns.map(p => p.pattern_id);

    // exam_schedule からパターンに対応するスケジュールを取得し、パターン情報をマージ
    const examSchedule = getRowsData(ss.getSheetByName('exam_schedule'));
    const exams = examSchedule
      .filter(e => patternIds.includes(String(e.pattern_id).trim()))
      .map(e => {
        const pattern = studentPatterns.find(p => p.pattern_id === String(e.pattern_id).trim());
        return { ...pattern, ...e };
      });

    if (exams.length === 0) {
      return { error: '試験実施データ(exam_schedule)がありません。' };
    }

    const termTests = getRowsData(ss.getSheetByName('term_tests_master'));
    const termTestMap = termTests.reduce((map, t) => {
      map[t.term_test_id] = t.test_name;
      return map;
    }, {});

    const examsWithNames = exams.map(e => ({
      ...e,
      test_name: termTestMap[e.term_test_id] || '名称未設定のテスト'
    }));

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

    const examTabs = sortedExams.map(exam => {
      const patternSubjects = allPatternSubjects.filter(
        ps => String(ps.pattern_id).trim() === String(exam.pattern_id).trim()
      );
      const subjects = patternSubjects.map(ps => subjectMap[ps.subject_id] || null).filter(Boolean);
      const scores = allScores.filter(
        s => String(s.exam_id).trim() === String(exam.exam_id).trim() &&
             String(s.student_id).trim() === String(student.student_id).trim()
      );
      return { ...exam, subjects, scores };
    });

    return stringifyDates({
      student,
      currentExam,
      subjects: examTabs[0] ? examTabs[0].subjects : [],
      scores: examTabs[0] ? examTabs[0].scores : [],
      history: sortedExams,
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
