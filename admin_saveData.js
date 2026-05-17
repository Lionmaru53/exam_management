function generateUniqueId(prefix) {
  return prefix + Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
}

/**
 * exam_schedule への日程保存（upsert）
 * payload: { exam_id, pattern_id, year, start_date, end_date }
 */
function updateExamData(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('exam_schedule');
    const data = sheet.getDataRange().getValues();

    let rowIndex = -1;
    let examId = payload.exam_id;

    if (examId && examId !== '') {
      // exam_id で既存行を検索
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(examId)) {
          rowIndex = i + 1;
          break;
        }
      }
    }

    if (rowIndex < 0 && payload.pattern_id && payload.year) {
      // pattern_id + year で既存行を検索
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][1]) === String(payload.pattern_id) &&
            String(data[i][2]) === String(payload.year)) {
          rowIndex = i + 1;
          examId = String(data[i][0]);
          break;
        }
      }
    }

    if (!examId) {
      examId = generateUniqueId('EX');
    }

    const rowValues = [
      examId,
      payload.pattern_id || '',
      payload.year || '',
      payload.start_date || '',
      payload.end_date || ''
    ];

    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }

    return { success: true, exam_id: examId };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * exam_patterns への新規パターン追加
 * payload: { school_name, school_course, grade, sub_course, term_test_id }
 */
function addNewPattern(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('exam_patterns');
    const rows = getRowsData(sheet);

    const exists = rows.some(row =>
      String(row.school_name).trim() === String(payload.school_name).trim() &&
      String(row.school_course).trim() === String(payload.school_course).trim() &&
      String(row.term_test_id).trim() === String(payload.term_test_id).trim() &&
      String(row.grade).trim() === String(payload.grade).trim() &&
      String(row.sub_course || '').trim() === String(payload.sub_course || '').trim()
    );

    if (exists) {
      return { success: false, error: '既に登録済みのパターンです' };
    }

    const newPatternId = generateUniqueId('P');
    sheet.appendRow([
      newPatternId,
      payload.school_name,
      payload.school_course,
      payload.grade,
      payload.sub_course || '',
      payload.term_test_id
    ]);

    return { success: true, pattern_id: newPatternId };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * pattern_subjects の更新（全削除→再登録）
 */
function updatePatternSubjects(patternId, selectedIds, newSubjectName, genreName) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const psSheet = ss.getSheetByName('pattern_subjects');

    const currentSelectedIds = Array.isArray(selectedIds) ? selectedIds.slice() : [];

    if (newSubjectName && newSubjectName.trim() !== '') {
      const addResult = addNewSubject(patternId, newSubjectName.trim(), genreName || '');
      if (!addResult.success) {
        return addResult;
      }
      currentSelectedIds.push(addResult.subject_id);
    }

    const psData = psSheet.getDataRange().getValues();
    for (let i = psData.length - 1; i >= 1; i--) {
      if (String(psData[i][0]) === String(patternId)) {
        psSheet.deleteRow(i + 1);
      }
    }

    currentSelectedIds.forEach(subjectId => {
      psSheet.appendRow([patternId, subjectId]);
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * subjects_master への新規教科追加
 */
function addNewSubject(patternId, newSubjectName, genreName, grade) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const subjectsSheet = ss.getSheetByName('subjects_master');
    if (!subjectsSheet) {
      return { success: false, error: 'subjects_master シートが見つかりません' };
    }

    const genresSheet = ss.getSheetByName('genres_master');
    let genreId = '';
    if (genresSheet) {
      const genreRows = getRowsData(genresSheet);
      const genre = genreRows.find(g => String(g.genre_name || '').trim() === String(genreName || '').trim());
      genreId = genre ? genre.genre_id : '';
    }

    const newSubjectId = generateUniqueId('S');
    subjectsSheet.appendRow([newSubjectId, newSubjectName, genreId, grade || '']);

    return { success: true, subject_id: newSubjectId };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

globalThis.addNewSubject = addNewSubject;

/**
 * グループ一括教科設定: 同じ学校・コース・学年・サブ区分の全試験区分に同じ教科を設定
 * payload: { school_name, school_course, grade, sub_course, term_test_ids, selected_subject_ids }
 */
function batchSetGroupSubjects(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss          = SpreadsheetApp.getActiveSpreadsheet();
    const patSheet    = ss.getSheetByName('exam_patterns');
    const psSheet     = ss.getSheetByName('pattern_subjects');
    const patternRows = getRowsData(patSheet);
    const patternIds  = [];

    const sn  = String(payload.school_name  || '').trim();
    const sc  = String(payload.school_course || '').trim();
    const gr  = String(payload.grade        || '').trim();
    const sub = String(payload.sub_course   || '').trim();

    for (const termTestId of payload.term_test_ids) {
      const existing = patternRows.find(p =>
        String(p.school_name  || '').trim() === sn &&
        String(p.school_course || '').trim() === sc &&
        String(p.grade        || '').trim() === gr &&
        String(p.sub_course   || '').trim() === sub &&
        String(p.term_test_id || '').trim() === String(termTestId).trim()
      );
      if (existing) {
        patternIds.push(String(existing.pattern_id));
      } else {
        const newId = generateUniqueId('P');
        patSheet.appendRow([newId, sn, sc, gr, sub, termTestId]);
        patternIds.push(newId);
      }
    }

    const psData       = psSheet.getDataRange().getValues();
    const patternIdSet = new Set(patternIds);
    for (let i = psData.length - 1; i >= 1; i--) {
      if (patternIdSet.has(String(psData[i][0]))) {
        psSheet.deleteRow(i + 1);
      }
    }
    // 同一秒内に生成された ID が重複している場合でも1回だけ書き込む
    const uniquePatternIds = [...new Set(patternIds)];
    for (const patternId of uniquePatternIds) {
      for (const subjectId of payload.selected_subject_ids) {
        psSheet.appendRow([patternId, subjectId]);
      }
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 試験区分ごと一括教科設定
 * items: [{ school_name, school_course, grade, sub_course, term_test_id, selected_subject_ids }]
 */
function batchSetPerTermSubjects(items) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss          = SpreadsheetApp.getActiveSpreadsheet();
    const patSheet    = ss.getSheetByName('exam_patterns');
    const psSheet     = ss.getSheetByName('pattern_subjects');
    const patternRows = getRowsData(patSheet);
    const updates     = [];

    for (const item of items) {
      const sn   = String(item.school_name  || '').trim();
      const sc   = String(item.school_course || '').trim();
      const gr   = String(item.grade        || '').trim();
      const sub  = String(item.sub_course   || '').trim();
      const ttId = String(item.term_test_id || '').trim();

      const existing = patternRows.find(p =>
        String(p.school_name  || '').trim() === sn &&
        String(p.school_course || '').trim() === sc &&
        String(p.grade        || '').trim() === gr &&
        String(p.sub_course   || '').trim() === sub &&
        String(p.term_test_id || '').trim() === ttId
      );

      let patternId;
      if (existing) {
        patternId = String(existing.pattern_id);
      } else {
        patternId = generateUniqueId('P');
        patSheet.appendRow([patternId, sn, sc, gr, sub, ttId]);
        patternRows.push({ pattern_id: patternId, school_name: sn, school_course: sc, grade: gr, sub_course: sub, term_test_id: ttId });
      }
      updates.push({ patternId, selectedSubjectIds: item.selected_subject_ids || [] });
    }

    const psData      = psSheet.getDataRange().getValues();
    const affectedIds = new Set(updates.map(u => u.patternId));
    for (let i = psData.length - 1; i >= 1; i--) {
      if (affectedIds.has(String(psData[i][0]))) {
        psSheet.deleteRow(i + 1);
      }
    }
    for (const { patternId, selectedSubjectIds } of updates) {
      for (const subjectId of selectedSubjectIds) {
        psSheet.appendRow([patternId, subjectId]);
      }
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ---- 共通マスターデータ管理 ----

/**
 * term_tests_master に試験区分を追加または更新（upsert）
 * payload: { term_test_id?, test_name, is_two_terms }
 */
function upsertTermTest(callerEmail, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ctx = getAdminContext(callerEmail);
    if (ctx.role !== 'master') return { success: false, error: '権限がありません' };

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('term_tests_master');
    const data  = sheet.getDataRange().getValues();
    const headers = data[0];
    const idCol   = headers.indexOf('term_test_id') + 1;

    const isTwoTerms = payload.is_two_terms === true || String(payload.is_two_terms) === '1' ? '1' : '0';

    if (payload.term_test_id) {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][idCol - 1]) === String(payload.term_test_id)) {
          const nameCol = headers.indexOf('test_name') + 1;
          const flagCol = headers.indexOf('is_two_terms') + 1;
          if (nameCol > 0) sheet.getRange(i + 1, nameCol).setValue(payload.test_name);
          if (flagCol > 0) sheet.getRange(i + 1, flagCol).setValue(isTwoTerms);
          writeAuditLog(ctx, 'update_term_test', payload, 'success');
          return { success: true };
        }
      }
    }

    const newId = 'T' + Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
    sheet.appendRow([newId, payload.test_name, isTwoTerms]);
    writeAuditLog(ctx, 'add_term_test', payload, 'success');
    return { success: true, term_test_id: newId };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * genres_master にジャンルを追加または更新（upsert）
 * payload: { genre_id?, genre_name }
 */
function upsertGenre(callerEmail, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ctx = getAdminContext(callerEmail);
    if (ctx.role !== 'master') return { success: false, error: '権限がありません' };

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('genres_master');
    const data  = sheet.getDataRange().getValues();
    const headers = data[0];
    const idCol   = headers.indexOf('genre_id') + 1;

    if (payload.genre_id) {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][idCol - 1]) === String(payload.genre_id)) {
          const nameCol = headers.indexOf('genre_name') + 1;
          if (nameCol > 0) sheet.getRange(i + 1, nameCol).setValue(payload.genre_name);
          writeAuditLog(ctx, 'update_genre', payload, 'success');
          return { success: true };
        }
      }
    }

    const newId = 'G' + Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
    sheet.appendRow([newId, payload.genre_name]);
    writeAuditLog(ctx, 'add_genre', payload, 'success');
    return { success: true, genre_id: newId };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * サブ区分グループ追加: 全試験区分に対してパターンを作成（教科は空）
 * payload: { school_name, school_course, grade, sub_course }
 */
function addSubCourseGroup(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss           = SpreadsheetApp.getActiveSpreadsheet();
    const patSheet     = ss.getSheetByName('exam_patterns');
    const ttSheet      = ss.getSheetByName('term_tests_master');
    const patternRows  = getRowsData(patSheet);
    const termTestRows = getRowsData(ttSheet);

    const sn  = String(payload.school_name  || '').trim();
    const sc  = String(payload.school_course || '').trim();
    const gr  = String(payload.grade        || '').trim();
    const sub = String(payload.sub_course   || '').trim();

    let created = 0;
    for (const tt of termTestRows) {
      const ttId = String(tt.term_test_id || '').trim();
      const exists = patternRows.some(p =>
        String(p.school_name  || '').trim() === sn &&
        String(p.school_course || '').trim() === sc &&
        String(p.grade        || '').trim() === gr &&
        String(p.sub_course   || '').trim() === sub &&
        String(p.term_test_id || '').trim() === ttId
      );
      if (!exists) {
        patSheet.appendRow([generateUniqueId('P'), sn, sc, gr, sub, ttId]);
        created++;
      }
    }

    return { success: true, created };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * exam_schedule への複数行一括保存（upsert）
 * items: Array<{ exam_id, pattern_id, year, start_date, end_date }>
 */
function updateExamDataBatch(items) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('exam_schedule');
    const data  = sheet.getDataRange().getValues();

    // 既存行のインデックスを構築（1回だけ読む）
    const byExamId      = {};  // examId → rowIndex (1-based)
    const byPatternYear = {};  // `patternId||year` → { rowIndex, examId }
    for (let i = 1; i < data.length; i++) {
      const eid = String(data[i][0]);
      const pid = String(data[i][1]);
      const yr  = String(data[i][2]);
      if (eid) byExamId[eid] = i + 1;
      if (pid && yr) byPatternYear[`${pid}||${yr}`] = { rowIndex: i + 1, examId: eid };
    }

    // 同一秒内の連続生成でも衝突しないようタイムスタンプ＋連番で ID を生成
    const base = Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
    let autoIdCounter = 0;

    items.forEach(payload => {
      let rowIndex = -1;
      let examId   = payload.exam_id;

      if (examId && byExamId[examId]) {
        rowIndex = byExamId[examId];
      } else if (payload.pattern_id && payload.year) {
        const pk = `${payload.pattern_id}||${payload.year}`;
        if (byPatternYear[pk]) {
          rowIndex = byPatternYear[pk].rowIndex;
          examId   = byPatternYear[pk].examId;
        }
      }

      if (!examId) examId = 'EX' + base + (++autoIdCounter);

      const rowValues = [
        examId,
        payload.pattern_id  || '',
        payload.year        || '',
        payload.start_date  || '',
        payload.end_date    || ''
      ];

      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
        // 追加した行を byExamId / byPatternYear に反映し、以降の重複追加を防ぐ
        const newRow = data.length;
        data.push(rowValues);
        byExamId[examId] = newRow + 1;
        if (payload.pattern_id && payload.year) {
          byPatternYear[`${payload.pattern_id}||${payload.year}`] = { rowIndex: newRow + 1, examId };
        }
      }
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 教科パターン未登録の試験区分に対して全学年のパターンを自動作成し、試験日程を保存
 * payload: { school_name, school_course, sub_course, term_test_id, year, start_date, end_date }
 */
function upsertExamWithAutoPattern(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss          = SpreadsheetApp.getActiveSpreadsheet();
    const patSheet    = ss.getSheetByName('exam_patterns');
    const schedSheet  = ss.getSheetByName('exam_schedule');
    const patternRows = getRowsData(patSheet);

    const sn   = String(payload.school_name  || '').trim();
    const sc   = String(payload.school_course || '').trim();
    const sub  = String(payload.sub_course   || '').trim();
    const ttId = String(payload.term_test_id || '').trim();
    const grades = ['高1', '高2', '高3'];

    // 同一秒内の連続生成でも衝突しないようタイムスタンプ＋インデックスで ID を生成
    const base = Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
    const patternIds = [];

    for (let i = 0; i < grades.length; i++) {
      const grade    = grades[i];
      const existing = patternRows.find(p =>
        String(p.school_name  || '').trim() === sn &&
        String(p.school_course || '').trim() === sc &&
        String(p.grade        || '').trim() === grade &&
        String(p.sub_course   || '').trim() === sub &&
        String(p.term_test_id || '').trim() === ttId
      );

      let patternId;
      if (existing) {
        patternId = String(existing.pattern_id);
      } else {
        patternId = 'P' + base + (i + 1);
        patSheet.appendRow([patternId, sn, sc, grade, sub, ttId]);
        patternRows.push({ pattern_id: patternId, school_name: sn, school_course: sc, grade, sub_course: sub, term_test_id: ttId });
      }
      patternIds.push(patternId);
    }

    // exam_schedule への upsert
    const schedData = schedSheet.getDataRange().getValues();
    const byPatYear = {};
    for (let i = 1; i < schedData.length; i++) {
      const pid = String(schedData[i][1]);
      const yr  = String(schedData[i][2]);
      if (pid && yr) byPatYear[`${pid}||${yr}`] = { rowIndex: i + 1, examId: String(schedData[i][0]) };
    }

    for (const patternId of [...new Set(patternIds)]) {
      const pk = `${patternId}||${payload.year}`;
      let rowIndex = -1;
      let examId   = '';

      if (byPatYear[pk]) {
        rowIndex = byPatYear[pk].rowIndex;
        examId   = byPatYear[pk].examId;
      }
      if (!examId) examId = generateUniqueId('EX');

      const row = [examId, patternId, payload.year, payload.start_date, payload.end_date];
      if (rowIndex > 0) {
        schedSheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
      } else {
        schedSheet.appendRow(row);
      }
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}
