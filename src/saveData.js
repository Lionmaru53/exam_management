/**
 * 生徒の得点を子 SS の scores_data に保存（upsert）
 *
 * ルーティング: 親 SS の student_index で student_id → cram_id を引き、
 *               getChildSS(cram_id) で子 SS を開く。
 */
function saveAllScores(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    // student_index で student_id → cram_id を解決
    const parentSS = SpreadsheetApp.getActiveSpreadsheet();
    const idxSheet = parentSS.getSheetByName('student_index');
    if (!idxSheet) throw new Error('student_index シートが見つかりません');

    const idxRows  = getRowsData(idxSheet);
    const idxEntry = idxRows.find(r =>
      String(r.student_id || '').trim() === String(payload.student_id).trim()
    );
    if (!idxEntry) throw new Error('生徒情報が見つかりません（student_id: ' + payload.student_id + '）');

    const cramId = String(idxEntry.cram_id || '').trim();
    if (!cramId) throw new Error('校舎情報が未設定です');

    // 子 SS を開く
    const ss = getChildSS(cramId);

    // term_test_id / year を payload から直接取得
    const termTestId = String(payload.term_test_id || '').trim();
    if (!termTestId) throw new Error('term_test_id が指定されていません');
    const yearAtSave = String(payload.year || '').trim();

    // 保存時点の学年を students_master から取得（年度別集計で必要）
    let gradeAtSave = '';
    const stuSheet = ss.getSheetByName('students_master');
    if (stuSheet) {
      const stuData    = stuSheet.getDataRange().getValues();
      const stuHeaders = stuData[0].map(h => String(h).trim());
      const stuSidCol  = stuHeaders.indexOf('student_id');
      const stuGrCol   = stuHeaders.indexOf('grade');
      if (stuSidCol >= 0 && stuGrCol >= 0) {
        for (let i = 1; i < stuData.length; i++) {
          if (String(stuData[i][stuSidCol] || '').trim() === String(payload.student_id).trim()) {
            gradeAtSave = String(stuData[i][stuGrCol] || '').trim();
            break;
          }
        }
      }
    }

    const sheet = ss.getSheetByName('scores_data');
    if (!sheet) throw new Error('scores_data シートが見つかりません');

    const data    = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    const sidCol  = headers.indexOf('student_id');
    const subjCol = headers.indexOf('subject_id');
    const ttCol   = headers.indexOf('term_test_id');
    const gradeCol = headers.indexOf('grade');
    const yearCol  = headers.indexOf('year');
    if (sidCol < 0 || subjCol < 0) throw new Error('scores_data の列定義が不正です');

    payload.scores.forEach(newScore => {
      let rowIndex = -1;
      if (ttCol >= 0) {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][sidCol])  === String(payload.student_id)  &&
              String(data[i][subjCol]) === String(newScore.subject_id) &&
              String(data[i][ttCol])   === termTestId) {
            rowIndex = i + 1;
            break;
          }
        }
      }

      // grade と year は INSERT 時のみ記録し、UPDATE 時は既存値を保持する
      const existingGrade = rowIndex > 0 && gradeCol >= 0
        ? (String(data[rowIndex - 1][gradeCol] || '').trim() || gradeAtSave) : gradeAtSave;
      const existingYear  = rowIndex > 0 && yearCol  >= 0
        ? (String(data[rowIndex - 1][yearCol]  || '').trim() || yearAtSave)  : yearAtSave;

      const rowValues = [
        rowIndex > 0 ? data[rowIndex - 1][0] : 'SC' + Utilities.getUuid(),
        '',                 // exam_id（レガシー列、空で保持）
        payload.student_id,
        newScore.subject_id,
        newScore.score,
        newScore.grade_rank,
        newScore.class_rank,
        new Date(),         // update_at（毎回更新）
        newScore.not_taken ? '1' : '',
        termTestId,         // term_test_id
        existingGrade,      // grade（INSERT 時のみ記録、UPDATE は保持）
        existingYear,       // year（INSERT 時のみ記録、UPDATE は保持）
      ];

      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
      }
    });

    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ error: e.toString() });
  } finally {
    lock.releaseLock();
  }
}

/**
 * 生徒のコース（school_course）と文理（sub_course）を設定し、更新後の appData を返す。
 * コース未設定の生徒が初回設定フローを完了したときに呼ばれる。
 */
function setStudentCourseAndSubCourse(lineUserId, schoolCourse, subCourse) {
  try {
    const sc = _normalizeCourseName(schoolCourse);
    if (!sc) return { error: 'コース名を入力してください' };

    const parentSS = SpreadsheetApp.getActiveSpreadsheet();
    const idxSheet = parentSS.getSheetByName('student_index');
    if (!idxSheet) return { error: '生徒情報が見つかりません' };

    const idxRows  = getRowsData(idxSheet);
    const idxEntry = idxRows.find(r =>
      String(r.line_user_id || '').trim() === String(lineUserId || '').trim()
    );
    if (!idxEntry) return { error: '生徒情報が見つかりません' };

    const cramId    = String(idxEntry.cram_id    || '').trim();
    const studentId = String(idxEntry.student_id || '').trim();
    if (!cramId || !studentId) return { error: '校舎または生徒IDが未設定です' };

    const ss    = getChildSS(cramId);
    const sheet = ss.getSheetByName('students_master');
    if (!sheet) return { error: 'students_master が見つかりません' };

    const data    = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    const sidCol  = headers.indexOf('student_id');
    const scCol   = headers.indexOf('school_course');
    const subCol  = headers.indexOf('sub_course');
    const snCol   = headers.indexOf('school_name');
    if (sidCol < 0 || scCol < 0) return { error: '列が見つかりません' };

    let sn = '';
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][sidCol] || '').trim() === studentId) {
        sheet.getRange(i + 1, scCol + 1).setValue(sc);
        if (subCol >= 0) sheet.getRange(i + 1, subCol + 1).setValue(String(subCourse || ''));
        sn = String(data[i][snCol] || '').trim();
        break;
      }
    }

    // school_course_master に登録 + 高1/''/高2-3/文系・理系 の exam_patterns を自動生成
    if (sn) upsertSchoolCourse(ss, sn, sc);

    return getInitialData(lineUserId);
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * 生徒の文理（sub_course）を設定し、更新後の appData を返す。
 * 高2・高3 で sub_course 未設定の生徒が LIFF 上で文理を選択したときに呼ばれる。
 */
function setStudentSubCourse(lineUserId, subCourse) {
  try {
    if (subCourse !== '文系' && subCourse !== '理系') {
      return { error: '無効な値です' };
    }

    const parentSS = SpreadsheetApp.getActiveSpreadsheet();
    const idxSheet = parentSS.getSheetByName('student_index');
    if (!idxSheet) return { error: '生徒情報が見つかりません' };

    const idxRows  = getRowsData(idxSheet);
    const idxEntry = idxRows.find(r =>
      String(r.line_user_id || '').trim() === String(lineUserId || '').trim()
    );
    if (!idxEntry) return { error: '生徒情報が見つかりません' };

    const cramId    = String(idxEntry.cram_id    || '').trim();
    const studentId = String(idxEntry.student_id || '').trim();
    if (!cramId || !studentId) return { error: '校舎または生徒IDが未設定です' };

    const ss    = getChildSS(cramId);
    const sheet = ss.getSheetByName('students_master');
    if (!sheet) return { error: 'students_master が見つかりません' };

    const data    = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    const sidCol  = headers.indexOf('student_id');
    const subCol  = headers.indexOf('sub_course');
    const snCol   = headers.indexOf('school_name');
    const scCol   = headers.indexOf('school_course');
    if (sidCol < 0 || subCol < 0) return { error: '列が見つかりません' };

    let sn = '', sc = '';
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][sidCol] || '').trim() === studentId) {
        sheet.getRange(i + 1, subCol + 1).setValue(subCourse);
        sn = String(data[i][snCol] || '').trim();
        sc = String(data[i][scCol] || '').trim();
        break;
      }
    }

    // exam_patterns 自動生成（高2・高3用）
    if (sn) {
      _autoCreateExamPatterns(ss, sn, sc, subCourse, ['高2', '高3']);
    }

    // 更新後のデータで再描画させるため getInitialData を再実行
    return getInitialData(lineUserId);
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * 生徒からの不具合報告を親 SS の bug_reports シートに記録する。
 * メール通知は Sheets の組み込み通知ルール（ツール → 通知）で設定する。
 *
 * payload: { student_id, student_name, school_name, grade, report_type, detail }
 */
function submitBugReport(payload) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // bug_reports シートを確保（なければ作成）
    let sheet = ss.getSheetByName('bug_reports');
    if (!sheet) {
      sheet = ss.insertSheet('bug_reports');
      sheet.getRange(1, 1, 1, 8).setValues([[
        'report_id', 'timestamp', 'student_id', 'student_name',
        'school_name', 'grade', 'report_type', 'detail'
      ]]);
    }

    const reportId = 'BR' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
    sheet.appendRow([
      reportId,
      new Date(),
      String(payload.student_id   || '').trim(),
      String(payload.student_name || '').trim(),
      String(payload.school_name  || '').trim(),
      String(payload.grade        || '').trim(),
      String(payload.report_type  || '').trim(),
      String(payload.detail       || '').trim(),
    ]);

    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ error: e.toString() });
  }
}
