function generateUniqueId(prefix) {
  return prefix + Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
}

/**
 * exam_schedule への日程保存（upsert）
 * payload: { exam_id, pattern_id, term_test_id, year, start_date, end_date }
 */
function updateExamData(cramId, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss    = _getTargetSS(cramId);
    const sheet = ss.getSheetByName('exam_schedule');
    const data  = sheet.getDataRange().getValues();

    let rowIndex = -1;
    let examId   = payload.exam_id;
    const ttId   = String(payload.term_test_id || '').trim();

    if (examId && examId !== '') {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(examId)) {
          rowIndex = i + 1;
          break;
        }
      }
    }

    // exam_id 未確定の場合: (pattern_id, term_test_id, year) で検索
    if (rowIndex < 0 && payload.pattern_id && ttId && payload.year) {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][1]) === String(payload.pattern_id) &&
            String(data[i][2]) === ttId &&
            String(data[i][3]) === String(payload.year)) {
          rowIndex = i + 1;
          examId   = String(data[i][0]);
          break;
        }
      }
    }

    if (!examId) examId = generateUniqueId('EX');

    const rowValues = [
      examId,
      payload.pattern_id  || '',
      ttId,
      payload.year        || '',
      payload.start_date  || '',
      payload.end_date    || ''
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
 * payload: { school_name, school_course, grade, sub_course }
 */
function addNewPattern(cramId, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sc = String(payload.school_course || '').trim();
    if (!sc) return { success: false, error: 'コース名は必須です（空文字は不可）' };

    const ss    = _getTargetSS(cramId);
    const sheet = ss.getSheetByName('exam_patterns');
    const rows  = getRowsData(sheet);

    const exists = rows.some(row =>
      String(row.school_name   || '').trim() === String(payload.school_name).trim() &&
      String(row.school_course || '').trim() === sc &&
      String(row.grade         || '').trim() === String(payload.grade).trim() &&
      String(row.sub_course    || '').trim() === String(payload.sub_course || '').trim()
    );
    if (exists) return { success: false, error: '既に登録済みのパターンです' };

    const newPatternId = generateUniqueId('P');
    sheet.appendRow([
      newPatternId,
      payload.school_name,
      sc,
      payload.grade,
      payload.sub_course || ''
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
      if (!addResult.success) return addResult;
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
    if (!subjectsSheet) return { success: false, error: 'subjects_master シートが見つかりません' };

    const genresSheet = ss.getSheetByName('genres_master');
    let genreId = '';
    if (genresSheet) {
      const genreRows = getRowsData(genresSheet);
      const genre = genreRows.find(g => String(g.genre_name || '').trim() === String(genreName || '').trim());
      genreId = genre ? genre.genre_id : '';
    }

    const newSubjectId = generateUniqueId('S');
    subjectsSheet.appendRow([newSubjectId, newSubjectName, genreId, grade || '', '']);

    return { success: true, subject_id: newSubjectId };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

globalThis.addNewSubject = addNewSubject;

/**
 * デフォルト初期化: 5組み合わせ（高1/''/高2-3/文系・理系）のパターンを確保し
 * デフォルト教科を設定する。
 * payload: { school_name, school_course }
 */
function initializeDefaultPatterns(cramId, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ctx = getAdminContext();
    const ctxCramIds = ctx.cram_ids || [];
    if (ctx.role !== 'master' && !ctxCramIds.includes(String(cramId || '').trim())) {
      return { success: false, error: '権限がありません' };
    }

    const ss = getChildSS(cramId);
    const sn = String(payload.school_name   || '').trim();
    const sc = String(payload.school_course || '').trim();
    if (!sn || !sc) return { success: false, error: '学校名とコース名を指定してください' };

    _autoCreateAllPatterns(ss, sn, sc);
    writeAuditLog(ctx, 'initialize_default_patterns',
      { cramId, school_name: sn, school_course: sc }, 'success');
    return { success: true };
  } catch (e) {
    console.error('initializeDefaultPatterns error:', e);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * グループ教科設定: (school_name, school_course, grade, sub_course) の1パターンに教科を設定
 * payload: { school_name, school_course, grade, sub_course, selected_subject_ids }
 */
function batchSetGroupSubjects(cramId, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss       = _getTargetSS(cramId);
    const patSheet = ss.getSheetByName('exam_patterns');
    const psSheet  = ss.getSheetByName('pattern_subjects');

    const sn  = String(payload.school_name   || '').trim();
    const sc  = String(payload.school_course || '').trim();
    const gr  = String(payload.grade         || '').trim();
    const sub = String(payload.sub_course    || '').trim();

    const patternRows = getRowsData(patSheet);
    const pattern = patternRows.find(p =>
      String(p.school_name   || '').trim() === sn &&
      String(p.school_course || '').trim() === sc &&
      String(p.grade         || '').trim() === gr &&
      String(p.sub_course    || '').trim() === sub
    );
    if (!pattern) return { success: false, error: 'パターンが見つかりません' };

    const patternId = String(pattern.pattern_id);
    const psData    = psSheet.getDataRange().getValues();
    for (let i = psData.length - 1; i >= 1; i--) {
      if (String(psData[i][0]) === patternId) psSheet.deleteRow(i + 1);
    }
    for (const subjectId of (payload.selected_subject_ids || [])) {
      psSheet.appendRow([patternId, subjectId]);
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * exam_schedule への複数行一括保存（upsert）
 * items: Array<{ exam_id, pattern_id, term_test_id, year, start_date, end_date }>
 */
function updateExamDataBatch(cramId, items) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss    = _getTargetSS(cramId);
    const sheet = ss.getSheetByName('exam_schedule');
    const data  = sheet.getDataRange().getValues();

    const byExamId       = {};
    const byCompositeKey = {};
    for (let i = 1; i < data.length; i++) {
      const eid  = String(data[i][0]);
      const pid  = String(data[i][1]);
      const ttId = String(data[i][2]);
      const yr   = String(data[i][3]);
      if (eid)             byExamId[eid] = i + 1;
      if (pid && ttId && yr) byCompositeKey[`${pid}||${ttId}||${yr}`] = { rowIndex: i + 1, examId: eid };
    }

    const base = Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
    let autoIdCounter = 0;

    items.forEach(payload => {
      let rowIndex = -1;
      let examId   = payload.exam_id;
      const ttId   = String(payload.term_test_id || '').trim();

      if (examId && byExamId[examId]) {
        rowIndex = byExamId[examId];
      } else if (payload.pattern_id && ttId && payload.year) {
        const ck = `${payload.pattern_id}||${ttId}||${payload.year}`;
        if (byCompositeKey[ck]) {
          rowIndex = byCompositeKey[ck].rowIndex;
          examId   = byCompositeKey[ck].examId;
        }
      }

      if (!examId) examId = 'EX' + base + (++autoIdCounter);

      const rowValues = [
        examId,
        payload.pattern_id || '',
        ttId,
        payload.year       || '',
        payload.start_date || '',
        payload.end_date   || ''
      ];

      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
        const newRow = data.length;
        data.push(rowValues);
        byExamId[examId] = newRow + 1;
        if (payload.pattern_id && ttId && payload.year) {
          byCompositeKey[`${payload.pattern_id}||${ttId}||${payload.year}`] = { rowIndex: newRow + 1, examId };
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
 * 試験日程の upsert（既存パターンを参照して exam_schedule に保存）
 * payload: { school_name, school_course, sub_course, grade, term_test_id, year, start_date, end_date }
 * grade を省略した場合は全学年（高1/高2/高3）の対応パターンを処理する。
 */
function upsertExamWithAutoPattern(cramId, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss         = _getTargetSS(cramId);
    const patSheet   = ss.getSheetByName('exam_patterns');
    const schedSheet = ss.getSheetByName('exam_schedule');

    const sn   = String(payload.school_name  || '').trim();
    const sc   = String(payload.school_course || '').trim();
    const sub  = String(payload.sub_course   || '').trim();
    const ttId = String(payload.term_test_id || '').trim();
    const gr   = String(payload.grade        || '').trim();
    const grades = gr ? [gr] : ['高1', '高2', '高3'];

    const patternRows = getRowsData(patSheet);
    const schedData   = schedSheet.getDataRange().getValues();
    const byComposite = {};
    for (let i = 1; i < schedData.length; i++) {
      const pid  = String(schedData[i][1]);
      const stId = String(schedData[i][2]);
      const yr   = String(schedData[i][3]);
      if (pid && stId && yr) byComposite[`${pid}||${stId}||${yr}`] = { rowIndex: i + 1, examId: String(schedData[i][0]) };
    }

    for (const grade of grades) {
      const pattern = patternRows.find(p =>
        String(p.school_name   || '').trim() === sn  &&
        String(p.school_course || '').trim() === sc  &&
        String(p.grade         || '').trim() === grade &&
        String(p.sub_course    || '').trim() === sub
      );
      if (!pattern) continue;

      const patternId = String(pattern.pattern_id);
      const ck = `${patternId}||${ttId}||${payload.year}`;
      let rowIndex = -1;
      let examId   = '';

      if (byComposite[ck]) {
        rowIndex = byComposite[ck].rowIndex;
        examId   = byComposite[ck].examId;
      }
      if (!examId) examId = generateUniqueId('EX');

      const row = [examId, patternId, ttId, payload.year, payload.start_date || '', payload.end_date || ''];
      if (rowIndex > 0) {
        schedSheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
      } else {
        schedSheet.appendRow(row);
        byComposite[ck] = { rowIndex: schedSheet.getLastRow(), examId };
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
 * 試験の未実施教科を設定・解除する。
 * payload: { exam_id, subject_id, excluded }
 *   excluded = true  → exam_subject_exclusions に追加
 *   excluded = false → 削除
 */
function setExamSubjectExclusion(cramId, payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss      = _getTargetSS(cramId);
    const sheet   = ss.getSheetByName('exam_subject_exclusions');
    if (!sheet) return { success: false, error: 'exam_subject_exclusions シートが見つかりません' };

    const examId    = String(payload.exam_id    || '').trim();
    const subjectId = String(payload.subject_id || '').trim();
    if (!examId || !subjectId) return { success: false, error: 'exam_id と subject_id を指定してください' };

    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === examId && String(data[i][1]).trim() === subjectId) {
        rowIndex = i + 1;
        break;
      }
    }

    if (payload.excluded) {
      if (rowIndex < 0) sheet.appendRow([examId, subjectId, new Date()]);
    } else {
      if (rowIndex > 0) sheet.deleteRow(rowIndex);
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 試験の未実施教科一覧を取得する。
 * @param {string} cramId
 * @param {string} examId
 */
function getExamSubjectExclusions(cramId, examId) {
  try {
    const ss    = _getTargetSS(cramId);
    const sheet = ss.getSheetByName('exam_subject_exclusions');
    if (!sheet) return { success: true, subjectIds: [] };

    const rows = getRowsData(sheet).filter(r =>
      String(r.exam_id || '').trim() === String(examId || '').trim()
    );
    return { success: true, subjectIds: rows.map(r => String(r.subject_id).trim()) };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}
