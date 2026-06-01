/**
 * subjects_master を参照して次の仮 subject_id を採番する。
 * 命名規則: SUB{学年数字}{通し番号}（例: SUB116 = 高1の16番目）
 * 既存の SUB{g}NN を含む全 subject_id を参照して最大値+1 を返す。
 */
function _generateTempSubjectId(parentSS, grade) {
  const gradeDigit = String(grade || '').replace(/[^0-9]/g, '').charAt(0) || '0';
  const prefix     = 'SUB' + gradeDigit;
  const re         = new RegExp('^' + prefix + '(\\d+)$');

  const subSheet = parentSS.getSheetByName('subjects_master');
  if (!subSheet) return prefix + '1';
  const data = subSheet.getDataRange().getValues();
  if (data.length < 2) return prefix + '1';
  const sidCol = data[0].map(h => String(h).trim()).indexOf('subject_id');
  if (sidCol < 0) return prefix + '1';

  let maxNum = 0;
  for (let i = 1; i < data.length; i++) {
    const m = String(data[i][sidCol] || '').match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return prefix + String(maxNum + 1);
}

/**
 * 「その他」で入力された教科を subjects_master に仮登録し、割り当てた subject_id を返す。
 * is_temp='1' かつ同名のエントリが既にある場合はそれを返す（重複防止）。
 * is_temp 列に '1' を書き込み、未解決として管理画面に表示する。
 */
function _getOrCreateTempSubject(parentSS, rawName, genreName, grade) {
  const subSheet = parentSS.getSheetByName('subjects_master');
  if (!subSheet) throw new Error('subjects_master が見つかりません');

  const data    = subSheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const sidCol  = headers.indexOf('subject_id');
  const nameCol = headers.indexOf('subject_name');
  if (sidCol < 0 || nameCol < 0) throw new Error('subjects_master の列定義が不正です');

  const name       = String(rawName || '').trim();
  const isTmpCheck = headers.indexOf('is_temp');

  // is_temp='1' かつ同名のエントリがあれば返す（重複防止）
  for (let i = 1; i < data.length; i++) {
    const sid    = String(data[i][sidCol]  || '').trim();
    const sname  = String(data[i][nameCol] || '').trim();
    const isTmp  = isTmpCheck >= 0 ? String(data[i][isTmpCheck] || '').trim() : '';
    if (isTmp === '1' && sname === name) return sid;
  }

  // genre_id を genres_master から解決
  let genreId = '';
  const genreSheet = parentSS.getSheetByName('genres_master');
  if (genreSheet) {
    const gd = genreSheet.getDataRange().getValues();
    const gh = gd[0].map(h => String(h).trim());
    const giCol = gh.indexOf('genre_id');
    const gnCol = gh.indexOf('genre_name');
    for (let i = 1; i < gd.length; i++) {
      if (String(gd[i][gnCol] || '').trim() === String(genreName || '').trim()) {
        genreId = String(gd[i][giCol] || '').trim();
        break;
      }
    }
  }

  // is_temp 列がなければ自動追加
  let isTempCol = headers.indexOf('is_temp');
  if (isTempCol < 0) {
    isTempCol = headers.length;
    subSheet.getRange(1, isTempCol + 1).setValue('is_temp');
    headers.push('is_temp');
  }

  const newId  = _generateTempSubjectId(parentSS, grade);
  const newRow = headers.map(h => {
    if (h === 'subject_id')   return newId;
    if (h === 'subject_name') return name;
    if (h === 'genre_id')     return genreId;
    if (h === 'grade')        return String(grade || '').trim();
    if (h === 'is_temp')      return '1';
    return '';
  });
  subSheet.appendRow(newRow);
  return newId;
}

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

    // 保存時点の学年・学校情報を students_master から取得（年度別集計・学校平均保存で必要）
    let gradeAtSave = '', schoolNameAtSave = '', schoolCourseAtSave = '', subCourseAtSave = '';
    const stuSheet = ss.getSheetByName('students_master');
    if (stuSheet) {
      const stuData    = stuSheet.getDataRange().getValues();
      const stuHeaders = stuData[0].map(h => String(h).trim());
      const stuSidCol  = stuHeaders.indexOf('student_id');
      const stuGrCol   = stuHeaders.indexOf('grade');
      const stuSnCol   = stuHeaders.indexOf('school_name');
      const stuScCol   = stuHeaders.indexOf('school_course');
      const stuSubCol  = stuHeaders.indexOf('sub_course');
      if (stuSidCol >= 0 && stuGrCol >= 0) {
        for (let i = 1; i < stuData.length; i++) {
          if (String(stuData[i][stuSidCol] || '').trim() === String(payload.student_id).trim()) {
            gradeAtSave      = String(stuData[i][stuGrCol]  || '').trim();
            schoolNameAtSave = stuSnCol  >= 0 ? String(stuData[i][stuSnCol]  || '').trim() : '';
            schoolCourseAtSave = stuScCol >= 0 ? String(stuData[i][stuScCol] || '').trim() : '';
            subCourseAtSave  = stuSubCol >= 0 ? String(stuData[i][stuSubCol] || '').trim() : '';
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

    // raw_subject_name 列が存在しない場合は自動追加
    let rawSubjCol = headers.indexOf('raw_subject_name');
    if (rawSubjCol < 0) {
      rawSubjCol = headers.length;
      sheet.getRange(1, rawSubjCol + 1).setValue('raw_subject_name');
      headers.push('raw_subject_name');
    }

    // genre_name 列が存在しない場合は自動追加
    let genreNameCol = headers.indexOf('genre_name');
    if (genreNameCol < 0) {
      genreNameCol = headers.length;
      sheet.getRange(1, genreNameCol + 1).setValue('genre_name');
      headers.push('genre_name');
    }

    payload.scores.forEach(newScore => {
      // ①「その他」エントリを OTHER_NNN に変換し subjects_master に仮登録
      if (newScore.subject_id === 'OTHER') {
        const rawName   = String(newScore.raw_subject_name || '').trim();
        if (!rawName) return;
        const genreName = String(newScore.genre_name || 'その他').trim();
        const tempId    = _getOrCreateTempSubject(parentSS, rawName, genreName, gradeAtSave);

        // 旧 OTHER 行（raw_subject_name 付き）があれば subject_id を tempId に書き換えてマイグレーション
        if (rawSubjCol >= 0 && ttCol >= 0) {
          for (let i = 1; i < data.length; i++) {
            if (String(data[i][sidCol]    || '').trim() === String(payload.student_id).trim() &&
                String(data[i][subjCol]   || '').trim() === 'OTHER' &&
                String(data[i][ttCol]     || '').trim() === termTestId &&
                String(data[i][rawSubjCol]|| '').trim() === rawName) {
              sheet.getRange(i + 1, subjCol    + 1).setValue(tempId);
              sheet.getRange(i + 1, rawSubjCol + 1).setValue('');
              data[i][subjCol]    = tempId;
              data[i][rawSubjCol] = '';
              break;
            }
          }
        }

        newScore = { ...newScore, subject_id: tempId };
      }

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

      const existingRawSubj = (rowIndex > 0 && data[rowIndex - 1].length > rawSubjCol)
        ? String(data[rowIndex - 1][rawSubjCol] || '').trim()
        : '';
      const rawSubjName = newScore.subject_id === 'OTHER'
        ? (String(newScore.raw_subject_name || '').trim() || existingRawSubj)
        : '';

      const genreName = newScore.subject_id === 'OTHER'
        ? String(newScore.genre_name || '').trim()
        : '';

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
        rawSubjName,        // raw_subject_name（OTHER のみ）
        genreName,          // genre_name（OTHER のみ）
      ];

      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
      }
    });

    // school_averages への upsert（grade_avg が指定されたエントリのみ）
    const avgEntries = payload.scores.filter(s => s.grade_avg !== '' && s.grade_avg != null);
    if (avgEntries.length > 0 && schoolNameAtSave && gradeAtSave) {
      const avgSheet = _getOrCreateSchoolAveragesSheet(ss);
      const avgData    = avgSheet.getDataRange().getValues();
      const avgHeaders = avgData[0].map(h => String(h).trim());
      const aSnCol  = avgHeaders.indexOf('school_name');
      const aScCol  = avgHeaders.indexOf('school_course');
      const aGrCol  = avgHeaders.indexOf('grade');
      const aSubCCol = avgHeaders.indexOf('sub_course');
      const aTtCol  = avgHeaders.indexOf('term_test_id');
      const aYrCol  = avgHeaders.indexOf('year');
      const aSiCol  = avgHeaders.indexOf('subject_id');
      const aAvgCol = avgHeaders.indexOf('grade_avg');
      const aUaCol  = avgHeaders.indexOf('updated_at');
      const aUbCol  = avgHeaders.indexOf('updated_by');

      avgEntries.forEach(entry => {
        const subjectId = entry.subject_id === 'OTHER' ? '' : entry.subject_id;
        if (!subjectId) return;
        const avgVal = parseFloat(entry.grade_avg);
        if (isNaN(avgVal)) return;

        let existRowIdx = -1;
        for (let i = 1; i < avgData.length; i++) {
          if (String(avgData[i][aSnCol]  || '') === schoolNameAtSave   &&
              String(avgData[i][aScCol]  || '') === schoolCourseAtSave &&
              String(avgData[i][aGrCol]  || '') === gradeAtSave        &&
              String(avgData[i][aSubCCol]|| '') === subCourseAtSave    &&
              String(avgData[i][aTtCol]  || '') === termTestId         &&
              String(avgData[i][aYrCol]  || '') === yearAtSave         &&
              String(avgData[i][aSiCol]  || '') === subjectId) {
            existRowIdx = i + 1;
            break;
          }
        }

        const rowVals = [
          schoolNameAtSave, schoolCourseAtSave, gradeAtSave, subCourseAtSave,
          termTestId, yearAtSave, subjectId,
          avgVal, new Date(), payload.student_id
        ];

        if (existRowIdx > 0) {
          avgSheet.getRange(existRowIdx, aAvgCol + 1).setValue(avgVal);
          avgSheet.getRange(existRowIdx, aUaCol  + 1).setValue(new Date());
          avgSheet.getRange(existRowIdx, aUbCol  + 1).setValue(payload.student_id);
        } else {
          avgSheet.appendRow(rowVals);
        }
      });
    }

    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ error: e.toString() });
  } finally {
    lock.releaseLock();
  }
}

function _getOrCreateSchoolAveragesSheet(ss) {
  let sheet = ss.getSheetByName('school_averages');
  if (!sheet) {
    sheet = ss.insertSheet('school_averages');
    sheet.appendRow([
      'school_name', 'school_course', 'grade', 'sub_course',
      'term_test_id', 'year', 'subject_id', 'grade_avg', 'updated_at', 'updated_by'
    ]);
  }
  return sheet;
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
      sheet.getRange(1, 1, 1, 9).setValues([[
        'report_id', 'timestamp', 'student_id', 'student_name',
        'school_name', 'grade', 'report_type', 'detail', 'is_resolved'
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
      '',  // is_resolved: 未解決
    ]);

    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ error: e.toString() });
  }
}

/**
 * 仮 subject_id または旧 raw_subject_name を実 subject_id に紐づける。
 *   identifier が subjects_master に is_temp='1' で存在 → scores_data を一括更新 + 仮エントリを削除
 *   それ以外 → 旧方式（subject_id='OTHER' かつ raw_subject_name=identifier の行を更新）
 */
function resolveOtherSubject(cramId, identifier, realSubjectId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    const parentSS = SpreadsheetApp.getActiveSpreadsheet();
    const id = String(identifier || '').trim();

    // subjects_master で is_temp='1' か確認
    let isTempId = false;
    const subSheetCheck = parentSS.getSheetByName('subjects_master');
    if (subSheetCheck) {
      const chkData    = subSheetCheck.getDataRange().getValues();
      const chkHeaders = chkData[0].map(h => String(h).trim());
      const chkSidCol  = chkHeaders.indexOf('subject_id');
      const chkTmpCol  = chkHeaders.indexOf('is_temp');
      if (chkSidCol >= 0 && chkTmpCol >= 0) {
        for (let i = 1; i < chkData.length; i++) {
          if (String(chkData[i][chkSidCol] || '').trim() === id &&
              String(chkData[i][chkTmpCol]  || '').trim() === '1') {
            isTempId = true;
            break;
          }
        }
      }
    }
    const ss    = getChildSS(cramId);
    const sheet = ss.getSheetByName('scores_data');
    if (!sheet) throw new Error('scores_data シートが見つかりません');

    const data    = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    const subjCol    = headers.indexOf('subject_id');
    const rawSubjCol = headers.indexOf('raw_subject_name');
    if (subjCol < 0) throw new Error('subject_id 列が見つかりません');

    let updated = 0;

    if (isTempId) {
      // 新方式：tempId → realSubjectId に一括更新
      const tempId = id;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][subjCol] || '').trim() === tempId) {
          sheet.getRange(i + 1, subjCol + 1).setValue(realSubjectId);
          updated++;
        }
      }
      // subjects_master から仮エントリを削除
      const subSheet = parentSS.getSheetByName('subjects_master');
      if (subSheet) {
        const subData    = subSheet.getDataRange().getValues();
        const subHeaders = subData[0].map(h => String(h).trim());
        const subSidCol  = subHeaders.indexOf('subject_id');
        for (let i = subData.length - 1; i >= 1; i--) {
          if (String(subData[i][subSidCol] || '').trim() === tempId) {
            subSheet.deleteRow(i + 1);
            break;
          }
        }
      }
    } else {
      // 旧方式（後方互換）：subject_id='OTHER' かつ raw_subject_name=identifier の行を更新
      if (rawSubjCol < 0) throw new Error('raw_subject_name 列が見つかりません');
      const rawName = id;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][subjCol]    || '').trim() === 'OTHER' &&
            String(data[i][rawSubjCol] || '').trim() === rawName) {
          sheet.getRange(i + 1, subjCol    + 1).setValue(realSubjectId);
          sheet.getRange(i + 1, rawSubjCol + 1).setValue('');
          updated++;
        }
      }
    }

    return JSON.stringify({ success: true, updated });
  } catch (e) {
    return JSON.stringify({ error: e.toString() });
  } finally {
    lock.releaseLock();
  }
}

/**
 * 仮登録教科を正式な科目として承認する（is_temp フラグを解除）。
 * 管理者が「このまま新しい科目として登録」を選んだ際に呼ばれる。
 */
function approveNewSubject(tempSubjectId) {
  try {
    const id = String(tempSubjectId || '').trim();
    if (!id) return JSON.stringify({ success: false, error: 'ID が指定されていません' });

    const parentSS = SpreadsheetApp.getActiveSpreadsheet();
    const subSheet = parentSS.getSheetByName('subjects_master');
    if (!subSheet) return JSON.stringify({ success: false, error: 'subjects_master が見つかりません' });

    const data      = subSheet.getDataRange().getValues();
    const headers   = data[0].map(h => String(h).trim());
    const sidCol    = headers.indexOf('subject_id');
    const isTempCol = headers.indexOf('is_temp');
    if (sidCol < 0) return JSON.stringify({ success: false, error: 'subject_id 列が見つかりません' });

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][sidCol] || '').trim() === id) {
        if (isTempCol >= 0) subSheet.getRange(i + 1, isTempCol + 1).setValue('');
        return JSON.stringify({ success: true });
      }
    }
    return JSON.stringify({ success: false, error: '指定の ID が見つかりません' });
  } catch (e) {
    return JSON.stringify({ error: e.toString() });
  }
}

/**
 * 特定の教科（genre）に属する科目を pattern_subjects に保存（差分更新）。
 * その教科の既存エントリを削除してから新規行を追加する。
 * LockService で排他制御し、同時編集によるデータ破損を防ぐ。
 */
function savePatternSubjectsForGenre(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    const parentSS = SpreadsheetApp.getActiveSpreadsheet();
    const idxSheet = parentSS.getSheetByName('student_index');
    if (!idxSheet) throw new Error('student_index シートが見つかりません');
    const idxRows  = getRowsData(idxSheet);
    const idxEntry = idxRows.find(r =>
      String(r.student_id || '').trim() === String(payload.student_id).trim()
    );
    if (!idxEntry) throw new Error('生徒情報が見つかりません（student_id: ' + payload.student_id + '）');

    const childSS = getChildSS(String(idxEntry.cram_id || '').trim());
    const psSheet = childSS.getSheetByName('pattern_subjects');
    if (!psSheet) throw new Error('pattern_subjects シートが見つかりません');

    const patternId = String(payload.pattern_id || '').trim();
    const genreName = String(payload.genre_name  || '').trim();
    const newSids   = (payload.subject_ids || []).map(s => String(s).trim()).filter(Boolean);

    // subjects_master × genres_master から genre に属する subject_id セットを作成
    const subSheet   = parentSS.getSheetByName('subjects_master');
    const genreSheet = parentSS.getSheetByName('genres_master');
    const genreSubjectIds = new Set();
    if (subSheet && genreSheet) {
      const gRows      = getRowsData(genreSheet);
      const genreEntry = gRows.find(r => String(r.genre_name || '').trim() === genreName);
      if (genreEntry) {
        const genreId = String(genreEntry.genre_id || '').trim();
        getRowsData(subSheet).forEach(s => {
          if (String(s.genre_id || '').trim() === genreId)
            genreSubjectIds.add(String(s.subject_id || '').trim());
        });
      }
    }

    // 対象教科の既存行を後ろから削除
    const psData    = psSheet.getDataRange().getValues();
    const psHeaders = psData[0].map(h => String(h).trim());
    const pPidCol   = psHeaders.indexOf('pattern_id');
    const pSidCol   = psHeaders.indexOf('subject_id');

    const toDelete = [];
    for (let i = psData.length - 1; i >= 1; i--) {
      const pid = String(psData[i][pPidCol] || '').trim();
      const sid = String(psData[i][pSidCol] || '').trim();
      if (pid === patternId && genreSubjectIds.has(sid)) toDelete.push(i + 1);
    }
    toDelete.forEach(rowNum => psSheet.deleteRow(rowNum));

    // 新規行を追加
    if (newSids.length > 0) {
      const addRows = newSids.map(sid =>
        psHeaders.map(h => h === 'pattern_id' ? patternId : h === 'subject_id' ? sid : '')
      );
      psSheet.getRange(psSheet.getLastRow() + 1, 1, addRows.length, psHeaders.length).setValues(addRows);
    }

    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.toString() });
  } finally {
    lock.releaseLock();
  }
}

/**
 * pattern_subjects の特定の科目を別の科目に置き換える（1件単独編集用）。
 * old_subject_id が空の場合は追加のみ行う。
 * LockService で排他制御。
 */
function replacePatternSubject(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    const parentSS = SpreadsheetApp.getActiveSpreadsheet();
    const idxSheet = parentSS.getSheetByName('student_index');
    if (!idxSheet) throw new Error('student_index シートが見つかりません');
    const idxRows  = getRowsData(idxSheet);
    const idxEntry = idxRows.find(r =>
      String(r.student_id || '').trim() === String(payload.student_id).trim()
    );
    if (!idxEntry) throw new Error('生徒情報が見つかりません');

    const childSS = getChildSS(String(idxEntry.cram_id || '').trim());
    const psSheet = childSS.getSheetByName('pattern_subjects');
    if (!psSheet) throw new Error('pattern_subjects シートが見つかりません');

    const patternId = String(payload.pattern_id    || '').trim();
    const oldSid    = String(payload.old_subject_id || '').trim();
    let   newSid    = String(payload.new_subject_id || '').trim();
    if (!newSid) throw new Error('新しい科目IDが指定されていません');

    let newSubjectForClient = null;
    if (newSid === 'OTHER') {
      const rawName   = String(payload.raw_subject_name || '').trim();
      const genreName = String(payload.genre_name       || 'その他').trim();
      if (!rawName) throw new Error('科目名を入力してください');

      // 学年を students_master から取得
      const stuSheet = childSS.getSheetByName('students_master');
      let grade = '';
      if (stuSheet) {
        const stuData    = stuSheet.getDataRange().getValues();
        const stuHeaders = stuData[0].map(h => String(h).trim());
        const stuSidCol  = stuHeaders.indexOf('student_id');
        const stuGrCol   = stuHeaders.indexOf('grade');
        for (let i = 1; i < stuData.length; i++) {
          if (String(stuData[i][stuSidCol] || '').trim() === String(payload.student_id).trim()) {
            grade = String(stuData[i][stuGrCol] || '').trim();
            break;
          }
        }
      }

      const tempId = _getOrCreateTempSubject(parentSS, rawName, genreName, grade);
      newSid = tempId;

      // クライアント側の availableSubjects 更新用データ
      const allGenres = getRowsData(parentSS.getSheetByName('genres_master'));
      const genreEntry = allGenres.find(g => String(g.genre_name || '').trim() === genreName);
      newSubjectForClient = {
        subject_id:   tempId,
        subject_name: rawName,
        display_name: rawName,
        genre_id:     genreEntry ? genreEntry.genre_id : null,
        genre_name:   genreName,
        is_temp:      '1',
        grade:        grade
      };
    }

    const psData    = psSheet.getDataRange().getValues();
    const psHeaders = psData[0].map(h => String(h).trim());
    const pPidCol   = psHeaders.indexOf('pattern_id');
    const pSidCol   = psHeaders.indexOf('subject_id');

    // 古い科目を削除（後ろから検索して1件）
    if (oldSid) {
      for (let i = psData.length - 1; i >= 1; i--) {
        if (String(psData[i][pPidCol] || '').trim() === patternId &&
            String(psData[i][pSidCol] || '').trim() === oldSid) {
          psSheet.deleteRow(i + 1);
          break;
        }
      }
    }

    // 新しい科目を追加（重複チェック）
    const remaining = psSheet.getDataRange().getValues();
    const alreadyExists = remaining.slice(1).some(row =>
      String(row[pPidCol] || '').trim() === patternId &&
      String(row[pSidCol] || '').trim() === newSid
    );

    if (!alreadyExists) {
      const newRow = psHeaders.map(h =>
        h === 'pattern_id' ? patternId : h === 'subject_id' ? newSid : ''
      );
      psSheet.appendRow(newRow);
    }

    // 更新後の patternSubjectIds を返す（フロントが getInitialData を再呼び出しせずに済む）
    const finalData = psSheet.getDataRange().getValues();
    const finalHeaders = finalData[0].map(h => String(h).trim());
    const fPidCol = finalHeaders.indexOf('pattern_id');
    const fSidCol = finalHeaders.indexOf('subject_id');
    const patternSubjectIds = finalData.slice(1)
      .filter(row => String(row[fPidCol] || '').trim() === patternId)
      .map(row => String(row[fSidCol] || '').trim())
      .filter(Boolean);

    return JSON.stringify({ success: true, patternSubjectIds, newSubject: newSubjectForClient });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.toString() });
  } finally {
    lock.releaseLock();
  }
}
