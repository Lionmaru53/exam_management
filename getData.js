/**
 * LINE IDから生徒情報・試験情報・既存スコアをまとめて取得
 * JSON形式の文字列で返すことでシリアライズエラーを回避
 */
function getInitialData(lineUserId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. 生徒情報の特定
    const students = getRowsData(ss.getSheetByName('students_master'));
    const studentRaw = students.find(row => String(row.line_user_id).trim() === String(lineUserId).trim());
    if (!studentRaw) return { error: '生徒未登録' };

    // 学校名とコース名の紐付け
    const school = getRowsData(ss.getSheetByName('schools_master'))
      .find(s => s.school_id === studentRaw.school_id);

    // 略称があれば採用、なければ正式名称を表示
    const schoolDisplayName = (school && school.abbreviation) ? school.abbreviation : (school ? school.school_name : "不明な学校");

    const sCourse = getRowsData(ss.getSheetByName('school_courses'))
      .find(c => c.school_course_id === studentRaw.school_course_id);

    const student = {
      ...studentRaw,
      school_name: schoolDisplayName,
      school_course_name: sCourse ? sCourse.course_name : "不明なコース"
    };

    // 2. 該当する試験パターン(exam_patterns)の取得
    const patterns = getRowsData(ss.getSheetByName('exam_patterns'))
      .filter(p => p.school_id === student.school_id && p.school_course_id === student.school_course_id);

    if (patterns.length === 0) return JSON.stringify({ error: '該当する試験パターンがありません。' });

    // 3. 全試験データ(exam_data)から、該当パターンのものを抽出
    const patternIds = patterns.map(p => p.pattern_id);
    const exams = getRowsData(ss.getSheetByName('exam_data'))
      .filter(e => patternIds.includes(e.pattern_id));
    if (exams.length === 0) return JSON.stringify({ error: '試験実施データ(exam_data)がありません。' });

    // 4. 試験名称(term_tests_master)を紐づけ
    const termTests = getRowsData(ss.getSheetByName('term_tests_master'));
    const examsWithNames = exams.map(e => {
      const p = patterns.find(pat => pat.pattern_id === e.pattern_id);
      const test = termTests.find(t => t.term_test_id === p.term_test_id);
      return {
        ...e,
        test_name: test ? test.test_name : "名称未設定のテスト"
      };
    });

    // 5. 日付順にソートして最新の1件(currentExam)をオブジェクトとして取得
    const sortedExams = examsWithNames.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
    const currentExam = sortedExams[0]; // 配列の先頭(最新)を取り出す

    if (!currentExam) return JSON.stringify({ error: '有効な試験が見つかりません' });

    // 6. 教科テンプレート(pattern_subjects)から教科リストを取得
    const patternSubjects = getRowsData(ss.getSheetByName('pattern_subjects'))
      .filter(ps => ps.pattern_id === currentExam.pattern_id);
    const allSubjects = getRowsData(ss.getSheetByName('subjects_master'));
    const allGenres = getRowsData(ss.getSheetByName('genres_master'));
    
    const subjects = patternSubjects.map(ps => {
      const sub = allSubjects.find(s => s.subject_id === ps.subject_id);
      if (!sub) return null;

      const gen = allGenres.find(g => g.genre_id === sub.genre_id);
      return {
        ...sub,
        genre_id: gen ? gen.genre_id : null,
        genre_name: gen ? gen.genre_name : "その他",
        color: gen ? gen.color : null
      };
      
    }).filter(s => s); // 存在する教科のみ抽出

    // 7. 既存の入力済みスコア(scores_data)を取得
    const scores = getRowsData(ss.getSheetByName('scores_data'))
      .filter(s => s.exam_id === currentExam.exam_id && s.student_id === student.student_id);

    // 全データをまとめてJSON文字列化して返却
    const response = {
      student: student,
      currentExam: currentExam,
      subjects: subjects,
      scores: scores,
      history: sortedExams,
      genres: allGenres
    };

    return stringifyDates(response);

  } catch (e) {
    // 実行時エラーが発生した場合はエラーメッセージを返す
    return JSON.stringify({ error: 'GAS実行エラー: ' + e.toString() });
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