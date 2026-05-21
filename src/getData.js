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
    if (!idxSheet) return { error: '生徒未登録_1' };

    const idxRows  = getRowsData(idxSheet);
    const idxEntry = idxRows.find(r =>
      String(r.line_user_id || '').trim() === String(lineUserId).trim()
    );
    if (!idxEntry) return { error: '生徒未登録_2' };

    const cramId = String(idxEntry.cram_id || '').trim();
    if (!cramId)  return { error: '生徒未登録_3' };

    // 2. 子 SS を開く
    const ss = getChildSS(cramId);

    // 3. 生徒情報を取得（子 SS）
    const students   = getRowsData(ss.getSheetByName('students_master'));
    const studentRaw = students.find(row =>
      String(row.line_user_id || '').trim() === String(lineUserId).trim()
    );
    if (!studentRaw) return { error: '生徒未登録_4' };

    const student = {
      ...studentRaw,
      school_course_name: studentRaw.school_course || studentRaw.school_course_name || '不明なコース',
      sub_course: studentRaw.sub_course || ''
    };

    // 4. 学期制（子 SS の school_course_master）
    let is_two_terms = false;
    const settingSheet = ss.getSheetByName('school_course_master');
    if (settingSheet) {
      const settingRows = settingSheet.getDataRange().getValues();
      const hdrs        = settingRows[0].map(h => String(h).trim());
      const snCol       = hdrs.indexOf('school_name');
      const ttCol       = hdrs.indexOf('is_two_terms');
      if (snCol >= 0) {
        for (let i = 1; i < settingRows.length; i++) {
          if (String(settingRows[i][snCol]).trim() === String(student.school_name).trim()) {
            is_two_terms = ttCol >= 0 && String(settingRows[i][ttCol]).trim() === '1';
            break;
          }
        }
      }
    }

    // 5. term_tests_master（親 SS）
    const termTests = getRowsData(parentSS.getSheetByName('term_tests_master'));
    const relevantTermTests = termTests.filter(t =>
      (String(t.is_two_terms).trim() === '1') === is_two_terms
    );

    // 6. 生徒のパターンに対応する試験一覧（子 SS）
    const examPatterns  = getRowsData(ss.getSheetByName('exam_patterns'));
    const studentPatterns = examPatterns.filter(p =>
      String(p.school_name).trim()      === String(student.school_name).trim() &&
      String(p.school_course).trim()    === String(student.school_course).trim() &&
      String(p.grade || '').trim()      === String(student.grade || '').trim() &&
      String(p.sub_course || '').trim() === String(student.sub_course || '').trim()
    );
    const patternIds = studentPatterns.map(p => String(p.pattern_id));

    const examSchedule  = getRowsData(ss.getSheetByName('exam_schedule'));
    const relevantExams = examSchedule.filter(e =>
      patternIds.includes(String(e.pattern_id).trim())
    );

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

    // 8. 得点（子 SS）
    const allScores = getRowsData(ss.getSheetByName('scores_data'));

    // 9. 全試験区分に対してタブデータを構築
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

    examTabs.sort((a, b) => {
      if (a.start_date && b.start_date) return new Date(b.start_date) - new Date(a.start_date);
      if (a.start_date) return -1;
      if (b.start_date) return 1;
      return 0;
    });

    // パターンがある（教科が表示できる）タブを優先して選択
    const currentExam = examTabs.find(t => t.hasPattern) || examTabs[0] || null;

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

if (typeof module !== 'undefined') Object.assign(global, { stringifyDates, getInitialData });
