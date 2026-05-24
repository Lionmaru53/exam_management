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

    // exam_id が未設定の場合、pattern_id から既存エントリを探すか新規作成する
    let examId = String(payload.exam_id || '').trim();
    if (!examId && payload.pattern_id) {
      const schedSheet = ss.getSheetByName('exam_schedule');
      if (!schedSheet) throw new Error('exam_schedule シートが見つかりません');
      const schedData = schedSheet.getDataRange().getValues();
      for (let i = 1; i < schedData.length; i++) {
        if (String(schedData[i][1]).trim() === String(payload.pattern_id).trim()) {
          examId = String(schedData[i][0]).trim();
          break;
        }
      }
      if (!examId) {
        examId = 'EX' + Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
        schedSheet.appendRow([examId, payload.pattern_id, new Date().getFullYear(), '', '']);
      }
    }
    if (!examId) throw new Error('exam_id が取得できませんでした');

    const sheet = ss.getSheetByName('scores_data');
    if (!sheet) throw new Error('scores_data シートが見つかりません');

    const data = sheet.getDataRange().getValues();

    payload.scores.forEach(newScore => {
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][1]) === examId &&
            String(data[i][2]) === String(payload.student_id) &&
            String(data[i][3]) === String(newScore.subject_id)) {
          rowIndex = i + 1;
          break;
        }
      }

      const rowValues = [
        rowIndex > 0 ? data[rowIndex - 1][0] : 'SC' + Utilities.getUuid(),
        examId,
        payload.student_id,
        newScore.subject_id,
        newScore.score,
        newScore.grade_rank,
        newScore.class_rank,
        new Date()
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
    const sc = String(schoolCourse || '').trim();
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
      const sttSheet = parentSS.getSheetByName('school_term_test_settings');
      const sttRows  = sttSheet ? getRowsData(sttSheet) : [];
      const activeTermTests = sttRows
        .filter(r => String(r.school_name || '').trim() === sn && String(r.is_active || '').trim() === '1')
        .map(r => String(r.term_test_id).trim())
        .filter(Boolean);
      if (activeTermTests.length > 0) {
        _autoCreateExamPatterns(ss, sn, sc, subCourse, activeTermTests, ['高2', '高3']);
      }
    }

    // 更新後のデータで再描画させるため getInitialData を再実行
    return getInitialData(lineUserId);
  } catch (e) {
    return { error: e.message };
  }
}
