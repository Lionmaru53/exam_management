/**
 * 指定生徒の school_course または sub_course を一括更新する。
 * @param {string}   cramId
 * @param {string[]} studentIds
 * @param {'school_course'|'sub_course'} field
 * @param {string}   newValue
 */
function updateStudentField(cramId, studentIds, field, newValue) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ctx = getAdminContext();
    const ctxCramIds = ctx.cram_ids || [];
    if (ctx.role !== 'master' && !ctxCramIds.includes(String(cramId || '').trim())) {
      return { success: false, error: '権限がありません' };
    }
    if (!['school_course', 'sub_course'].includes(field)) {
      return { success: false, error: '無効なフィールドです' };
    }
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return { success: false, error: '生徒が選択されていません' };
    }

    const ss    = _getTargetSS(cramId);
    const sheet = ss.getSheetByName('students_master');
    if (!sheet) return { success: false, error: 'students_master シートが見つかりません' };

    const data      = sheet.getDataRange().getValues();
    const headers   = data[0].map(h => String(h).trim());
    const sidCol    = headers.indexOf('student_id');
    const fieldCol  = headers.indexOf(field);
    if (sidCol < 0 || fieldCol < 0) return { success: false, error: 'field "' + field + '" not found' };

    const snCol = headers.indexOf('school_name');
    const scCol = headers.indexOf('school_course');

    const idSet  = new Set(studentIds.map(String));
    let updated  = 0;
    const affectedPairs = new Set(); // "school_name||school_course"

    // school_course 変更時: 旧コース情報を先に収集
    const oldCoursePairs = []; // { school_name, school_course }
    if (field === 'school_course') {
      const normalizedNew = _normalizeCourseName(newValue);
      for (let i = 1; i < data.length; i++) {
        if (idSet.has(String(data[i][sidCol]).trim())) {
          const sn = String(data[i][snCol] || '').trim();
          const sc = String(data[i][scCol] || '').trim();
          if (sn && sc && sc !== normalizedNew) {
            oldCoursePairs.push({ school_name: sn, school_course: sc });
          }
        }
      }
    }

    for (let i = 1; i < data.length; i++) {
      if (idSet.has(String(data[i][sidCol]).trim())) {
        const normalized = (field === 'school_course') ? _normalizeCourseName(newValue) : String(newValue || '');
        sheet.getRange(i + 1, fieldCol + 1).setValue(normalized);
        updated++;
        if (field === 'sub_course' && String(newValue || '').trim()) {
          const sn = String(data[i][snCol] || '').trim();
          const sc = String(data[i][scCol] || '').trim();
          if (sn) affectedPairs.add(sn + '||' + sc);
        }
      }
    }

    // sub_course 設定時: 新しい (school, course, sub_course) 組み合わせの exam_patterns を自動生成
    if (affectedPairs.size > 0) {
      const subCourse = String(newValue || '').trim();
      const parentSS  = SpreadsheetApp.getActiveSpreadsheet();
      const sttSheet  = parentSS.getSheetByName('school_term_test_settings');
      const sttRows   = sttSheet ? getRowsData(sttSheet) : [];
      affectedPairs.forEach(function (key) {
        const parts = key.split('||');
        const sn = parts[0];
        const sc = parts[1];
        const activeTermTests = sttRows
          .filter(r => String(r.school_name || '').trim() === sn && String(r.is_active || '').trim() === '1')
          .map(r => String(r.term_test_id).trim())
          .filter(Boolean);
        if (activeTermTests.length > 0) {
          // 文系/理系は高2・高3のみ
          _autoCreateExamPatterns(ss, sn, sc, subCourse, ['高2', '高3']);
        }
      });
    }

    // school_course 変更後: 在籍0人になった旧コースを自動削除
    let autoDeletedCourses = 0;
    if (field === 'school_course' && oldCoursePairs.length > 0) {
      const delResult = _deleteOrphanedCourses(ss, oldCoursePairs);
      autoDeletedCourses = delResult.deleted;
    }

    writeAuditLog(ctx, 'update_student_field', { cram_id: cramId, field, count: updated, autoDeletedCourses }, 'success');
    return { success: true, updated, autoDeletedCourses };
  } catch (e) {
    console.error('updateStudentField error:', e);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * school_course_master からコースを削除する。
 * 有効な生徒が使用中の場合はエラーを返す。
 * @param {string} cramId
 * @param {string} schoolName
 * @param {string} courseName
 */
function deleteCourseFromMaster(cramId, schoolName, courseName) {
  try {
    const ctx = getAdminContext();
    const ctxCramIds = ctx.cram_ids || [];
    if (ctx.role !== 'master' && !ctxCramIds.includes(String(cramId || '').trim())) {
      return { success: false, error: '権限がありません' };
    }
    const val = _normalizeCourseName(courseName);
    if (!val) return { success: false, error: 'コース名が無効です' };

    const ss = _getTargetSS(cramId);

    // 有効な生徒が使用中か確認
    const stSheet = ss.getSheetByName('students_master');
    if (stSheet) {
      const stData    = stSheet.getDataRange().getValues();
      const stHeaders = stData[0].map(h => String(h).trim());
      const snCol     = stHeaders.indexOf('school_name');
      const scCol     = stHeaders.indexOf('school_course');
      const acCol     = stHeaders.indexOf('is_active');
      const inUse = stData.slice(1).some(row =>
        String(row[snCol] || '').trim() === schoolName &&
        String(row[scCol] || '').trim() === val &&
        (acCol < 0 || row[acCol] === true || String(row[acCol]).trim() === '1')
      );
      if (inUse) {
        return { success: false, error: 'このコースを使用中の有効な生徒がいます。先にコースを変更してください。' };
      }
    }

    // school_course_master から削除（後ろから走査して行ずれを防ぐ）
    const scmSheet = ss.getSheetByName('school_course_master');
    if (!scmSheet) return { success: false, error: 'school_course_master シートが見つかりません' };

    const data    = scmSheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    const snIdx   = headers.indexOf('school_name');
    const scIdx   = headers.indexOf('school_course');
    let deleted   = 0;
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][snIdx] || '').trim() === schoolName &&
          String(data[i][scIdx] || '').trim() === val) {
        scmSheet.deleteRow(i + 1);
        deleted++;
      }
    }
    if (deleted === 0) return { success: false, error: 'コースが見つかりませんでした' };

    writeAuditLog(ctx, 'delete_course', { cram_id: cramId, school_name: schoolName, course: val }, 'success');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 孤立コース（在籍0人）を関連シートからまとめて削除する。
 * 削除対象: school_course_master / exam_patterns / pattern_subjects / school_exam_periods
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss  子SS
 * @param {{ school_name: string, school_course: string }[]} pairs  削除候補の旧コース一覧
 * @returns {{ deleted: number }}  実際に削除したコース数
 */
function _deleteOrphanedCourses(ss, pairs) {
  // 重複除去
  const uniquePairs = [];
  const seen = new Set();
  pairs.forEach(function(p) {
    const key = p.school_name + '||' + p.school_course;
    if (!seen.has(key)) { seen.add(key); uniquePairs.push(p); }
  });

  const stSheet = ss.getSheetByName('students_master');
  if (!stSheet) return { deleted: 0 };

  const stData    = stSheet.getDataRange().getValues();
  const stHeaders = stData[0].map(function(h) { return String(h).trim(); });
  const stSnCol   = stHeaders.indexOf('school_name');
  const stScCol   = stHeaders.indexOf('school_course');
  const stAcCol   = stHeaders.indexOf('is_active');

  let deleted = 0;

  uniquePairs.forEach(function(pair) {
    const sn = pair.school_name;
    const sc = pair.school_course;

    // アクティブ在籍生徒が残っていれば削除しない
    const inUse = stData.slice(1).some(function(row) {
      return String(row[stSnCol] || '').trim() === sn &&
             String(row[stScCol] || '').trim() === sc &&
             (stAcCol < 0 || row[stAcCol] === true ||
              String(row[stAcCol]).trim() === '1' ||
              String(row[stAcCol]).trim().toLowerCase() === 'true');
    });
    if (inUse) return;

    // exam_patterns から pattern_id を収集してから削除
    const epSheet = ss.getSheetByName('exam_patterns');
    const patternIds = [];
    if (epSheet) {
      const epData    = epSheet.getDataRange().getValues();
      const epHeaders = epData[0].map(function(h) { return String(h).trim(); });
      const epSnIdx   = epHeaders.indexOf('school_name');
      const epScIdx   = epHeaders.indexOf('school_course');
      const epPidIdx  = epHeaders.indexOf('pattern_id');
      for (let i = 1; i < epData.length; i++) {
        if (String(epData[i][epSnIdx] || '').trim() === sn &&
            String(epData[i][epScIdx] || '').trim() === sc) {
          patternIds.push(String(epData[i][epPidIdx]).trim());
        }
      }

      // exam_patterns 削除（後ろから）
      for (let i = epData.length - 1; i >= 1; i--) {
        if (String(epData[i][epSnIdx] || '').trim() === sn &&
            String(epData[i][epScIdx] || '').trim() === sc) {
          epSheet.deleteRow(i + 1);
        }
      }
    }

    // pattern_subjects 削除
    if (patternIds.length > 0) {
      const psSheet = ss.getSheetByName('pattern_subjects');
      if (psSheet) {
        const psData    = psSheet.getDataRange().getValues();
        const psHeaders = psData[0].map(function(h) { return String(h).trim(); });
        const psPidIdx  = psHeaders.indexOf('pattern_id');
        const pidSet    = new Set(patternIds);
        for (let i = psData.length - 1; i >= 1; i--) {
          if (pidSet.has(String(psData[i][psPidIdx]).trim())) {
            psSheet.deleteRow(i + 1);
          }
        }
      }
    }

    // school_course_master 削除
    const scmSheet = ss.getSheetByName('school_course_master');
    if (scmSheet) {
      const scmData    = scmSheet.getDataRange().getValues();
      const scmHeaders = scmData[0].map(function(h) { return String(h).trim(); });
      const scmSnIdx   = scmHeaders.indexOf('school_name');
      const scmScIdx   = scmHeaders.indexOf('school_course');
      for (let i = scmData.length - 1; i >= 1; i--) {
        if (String(scmData[i][scmSnIdx] || '').trim() === sn &&
            String(scmData[i][scmScIdx] || '').trim() === sc) {
          scmSheet.deleteRow(i + 1);
        }
      }
    }

    // school_exam_periods 削除
    const sepSheet = ss.getSheetByName('school_exam_periods');
    if (sepSheet) {
      const sepData    = sepSheet.getDataRange().getValues();
      const sepHeaders = sepData[0].map(function(h) { return String(h).trim(); });
      const sepSnIdx   = sepHeaders.indexOf('school_name');
      const sepScIdx   = sepHeaders.indexOf('school_course');
      for (let i = sepData.length - 1; i >= 1; i--) {
        if (String(sepData[i][sepSnIdx] || '').trim() === sn &&
            String(sepData[i][sepScIdx] || '').trim() === sc) {
          sepSheet.deleteRow(i + 1);
        }
      }
    }

    deleted++;
  });

  return { deleted: deleted };
}

/**
 * school_course_master に新しいコースを追加する。
 * @param {string} cramId
 * @param {string} schoolName
 * @param {string} newValue
 */
function addCourseToMaster(cramId, schoolName, newValue) {
  try {
    const ctx = getAdminContext();
    const ctxCramIds = ctx.cram_ids || [];
    if (ctx.role !== 'master' && !ctxCramIds.includes(String(cramId || '').trim())) {
      return { success: false, error: '権限がありません' };
    }
    const val = _normalizeCourseName(newValue);
    if (!val) return { success: false, error: '値を入力してください' };

    const ss = _getTargetSS(cramId);
    upsertSchoolCourse(ss, schoolName, val);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

if (typeof module !== 'undefined') Object.assign(global, {
  updateStudentField, deleteCourseFromMaster, addCourseToMaster, _deleteOrphanedCourses,
});
