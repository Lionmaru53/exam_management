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
    for (let i = 1; i < data.length; i++) {
      if (idSet.has(String(data[i][sidCol]).trim())) {
        sheet.getRange(i + 1, fieldCol + 1).setValue(String(newValue || ''));
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
          _autoCreateExamPatterns(ss, sn, sc, subCourse, activeTermTests, ['高2', '高3']);
        }
      });
    }

    writeAuditLog(ctx, 'update_student_field', { cram_id: cramId, field, count: updated }, 'success');
    return { success: true, updated };
  } catch (e) {
    console.error('updateStudentField error:', e);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
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
    const val = String(newValue || '').trim();
    if (!val) return { success: false, error: '値を入力してください' };

    const ss = _getTargetSS(cramId);
    upsertSchoolCourse(ss, schoolName, val);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
