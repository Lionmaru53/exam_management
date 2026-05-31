/**
 * 生徒データインポート
 *
 * - importStudentData : SheetJS 解析済みの xlsx 行データ → 子 SS の students_master に Upsert
 *
 * student_index は line_student_import シートのスプレッドシート数式で自動管理される。
 */

// Excel 1行目のヘッダー名 → 内部フィールド名のマッピング
// _ プレフィックスは結合処理のための中間フィールド
const STUDENT_COLUMN_MAP = {
  '校舎':     '_cram_id',   // 列があれば cramId と照合してフィルタ
  '管理番号': 'student_id',
  '姓':       '_last_name',
  '名':       '_first_name',
  '姓かな':   '_last_kana',
  '名かな':   '_first_kana',
  '学校':     'school_name',
  '学年':     'grade',
};

// 子 SS の students_master ヘッダー定義
const STUDENTS_MASTER_HEADERS = [
  'student_id', 'name', 'pronunciation', 'cram_id',
  'school_name', 'school_course', 'sub_course', 'grade', 'is_active'
];

/**
 * ブラウザ側で SheetJS が解析した行データ（2次元配列）を受け取り、子 SS に Upsert する。
 * @param {string} cramId      - 対象校舎の cram_id
 * @param {Array}  sheetRows   - SheetJS の sheet_to_json({header:1}) の結果（rows[0] がヘッダー行）
 * @returns {{ success: boolean, added: number, updated: number, error?: string }}
 */
function importStudentData(cramId, sheetRows) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(60000);
    const ctx        = getAdminContext();
    const ctxCramIds = ctx.cram_ids || [];
    if (ctx.role !== 'master' && !ctxCramIds.includes(String(cramId || '').trim())) {
      return { success: false, error: '権限がありません' };
    }
    const isMultiBranch = !cramId && ctx.role === 'master';
    if (!isMultiBranch && !cramId) return { success: false, error: '校舎を選択してください' };
    if (!sheetRows || sheetRows.length < 2) {
      return { success: false, error: 'データが空です（ヘッダー行のみ）' };
    }

    const rawHeaders = sheetRows[0].map(function (h) { return String(h || '').trim(); });
    const dataRows   = sheetRows.slice(1).filter(function (r) {
      return r.some(function (c) { return String(c || '').trim() !== ''; });
    });

    if (isMultiBranch) {
      const result = _importMultiBranch(rawHeaders, dataRows);
      if (result.success) {
        writeAuditLog(ctx, 'import_students_multi', { count: result.total }, 'success');
      }
      return result;
    }

    const mapped   = _mapRows(rawHeaders, dataRows, cramId);
    const students = mapped.students;
    const skipped  = mapped.skipped;
    if (students.length === 0) {
      const msg = skipped > 0
        ? `校舎コード不一致のため全行がスキップされました（スキップ: ${skipped} 件）。ファイルの「校舎」列と選択中の校舎コード（${cramId}）を確認してください。`
        : '有効なデータが見つかりませんでした（管理番号が空の行はスキップされます）';
      return { success: false, error: msg };
    }

    const childSS = getChildSS(cramId);
    const result  = _upsertStudentsMaster(childSS, students);
    _upsertStudentsBranch(childSS, students);
    _deactivateStudentsBranch(childSS, result.inactiveIds);

    writeAuditLog(ctx, 'import_students', { cram_id: cramId, count: students.length }, 'success');
    return { success: true, added: result.added, updated: result.updated,
             deactivated: result.deactivated, skipped };

  } catch (e) {
    console.error('importStudentData error:', e);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function _mapRows(rawHeaders, rows, cramId) {
  var students = [];
  var skipped  = 0;
  rows.forEach(function (row) {
    var raw = {};
    rawHeaders.forEach(function (h, i) {
      var key = STUDENT_COLUMN_MAP[h];
      if (key) raw[key] = String(row[i] || '').trim();
    });

    var studentId = (raw['student_id'] || '').trim();
    if (!studentId) return;

    // 「校舎」列が存在し、かつ cramId と不一致の行はスキップ
    if ('_cram_id' in raw && raw['_cram_id'] !== String(cramId || '').trim()) {
      skipped++;
      return;
    }

    students.push({
      student_id:    studentId,
      name:          [raw['_last_name'], raw['_first_name']].filter(Boolean).join(' '),
      pronunciation: [raw['_last_kana'], raw['_first_kana']].filter(Boolean).join(' '),
      cram_id:       cramId,
      school_name:   raw['school_name'] || '',
      grade:         raw['grade'] || '',
      is_active:     true
    });
  });
  return { students: students, skipped: skipped };
}

function _ensureStudentsMasterSheet(ss) {
  var sheet = ss.getSheetByName('students_master');
  if (!sheet) {
    sheet = ss.insertSheet('students_master');
    sheet.getRange(1, 1, 1, STUDENTS_MASTER_HEADERS.length).setValues([STUDENTS_MASTER_HEADERS]);
  }
  return sheet;
}

function _upsertStudentsMaster(ss, students) {
  var sheet   = _ensureStudentsMasterSheet(ss);
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  var idCol   = headers.indexOf('student_id');

  // existingMap: sid → { rowNum: 1-indexed行番号, rowData: 行の値配列 }
  var existingMap = {};
  for (var i = 1; i < data.length; i++) {
    var sid = String(data[i][idCol] || '').trim();
    if (sid) existingMap[sid] = { rowNum: i + 1, rowData: data[i] };
  }

  var newRows = [];
  var updated = 0;

  students.forEach(function (student) {
    var sid = String(student.student_id).trim();

    if (existingMap[sid]) {
      // 既存行を更新: undefined フィールドは既存値を保持（school_course, sub_course など）
      var existingRow = existingMap[sid].rowData;
      var row = headers.map(function (h, i) {
        return student[h] !== undefined ? student[h] : existingRow[i];
      });
      sheet.getRange(existingMap[sid].rowNum, 1, 1, row.length).setValues([row]);
      updated++;
    } else {
      // 新規行: undefined フィールドは空文字
      var row = headers.map(function (h) {
        return student[h] !== undefined ? student[h] : '';
      });
      newRows.push(row);
    }
  });

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);
  }

  // インポートに含まれない既存生徒を非在籍化
  var importedIdMap = {};
  students.forEach(function (s) {
    importedIdMap[String(s.student_id).trim()] = true;
  });
  var isActiveCol = headers.indexOf('is_active');
  var deactivated = 0;
  var inactiveIds = [];
  if (isActiveCol >= 0) {
    Object.keys(existingMap).forEach(function (sid) {
      if (!importedIdMap[sid]) {
        sheet.getRange(existingMap[sid].rowNum, isActiveCol + 1).setValue(false);
        inactiveIds.push(sid);
        deactivated++;
      }
    });
  }

  return { added: newRows.length, updated: updated, deactivated: deactivated, inactiveIds: inactiveIds };
}

function _importMultiBranch(rawHeaders, dataRows) {
  var branchColIdx = rawHeaders.indexOf('校舎');
  if (branchColIdx === -1) {
    return { success: false, error: '校舎列が見つかりません。複数校舎インポートには「校舎」列が必要です。' };
  }

  var groups = {};
  dataRows.forEach(function (row) {
    var cid = String(row[branchColIdx] || '').trim();
    if (!cid) return;
    if (!groups[cid]) groups[cid] = [];
    groups[cid].push(row);
  });

  var totalAdded = 0, totalUpdated = 0, totalSkipped = 0, totalDeactivated = 0;
  var warnings = [];

  Object.keys(groups).forEach(function (cid) {
    try {
      var mapped = _mapRows(rawHeaders, groups[cid], cid);
      if (mapped.students.length === 0) {
        totalSkipped += groups[cid].length;
        return;
      }
      var childSS = getChildSS(cid);
      var result  = _upsertStudentsMaster(childSS, mapped.students);
      _upsertStudentsBranch(childSS, mapped.students);
      _deactivateStudentsBranch(childSS, result.inactiveIds);
      totalAdded        += result.added;
      totalUpdated      += result.updated;
      totalDeactivated  += result.deactivated;
      totalSkipped += mapped.skipped;
    } catch (e) {
      warnings.push(cid + ': ' + e.message);
      totalSkipped += groups[cid].length;
    }
  });

  return {
    success:     true,
    added:       totalAdded,
    updated:     totalUpdated,
    deactivated: totalDeactivated,
    skipped:     totalSkipped,
    total:       totalAdded + totalUpdated,
    warnings:    warnings,
  };
}

function _upsertStudentsBranch(ss, students) {
  var sheet = ss.getSheetByName('students_branch');
  if (!sheet) return;

  var data  = sheet.getDataRange().getValues();
  var idCol = data[0].indexOf('student_id');

  var existingMap = {};
  for (var i = 1; i < data.length; i++) {
    var sid = String(data[i][idCol] || '').trim();
    if (sid) existingMap[sid] = i + 1;
  }

  var newRows = [];
  students.forEach(function (student) {
    var sid = String(student.student_id).trim();
    var row = [sid, student.grade, student.is_active];
    if (existingMap[sid]) {
      sheet.getRange(existingMap[sid], 1, 1, row.length).setValues([row]);
    } else {
      newRows.push(row);
    }
  });

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 3).setValues(newRows);
  }
}

function _deactivateStudentsBranch(ss, inactiveIds) {
  if (!inactiveIds || inactiveIds.length === 0) return;
  var sheet = ss.getSheetByName('students_branch');
  if (!sheet) return;
  var data       = sheet.getDataRange().getValues();
  var headers    = data[0];
  var idCol      = headers.indexOf('student_id');
  var isActiveCol = headers.indexOf('is_active');
  if (idCol < 0 || isActiveCol < 0) return;
  var inactiveSet = {};
  inactiveIds.forEach(function (id) { inactiveSet[id] = true; });
  for (var i = 1; i < data.length; i++) {
    var sid = String(data[i][idCol] || '').trim();
    if (inactiveSet[sid]) {
      sheet.getRange(i + 1, isActiveCol + 1).setValue(false);
    }
  }
}

// Node.js（Jest）でテストできるよう関数を global に公開する
if (typeof module !== 'undefined') Object.assign(global, {
  STUDENT_COLUMN_MAP, STUDENTS_MASTER_HEADERS,
  importStudentData,
  _mapRows, _importMultiBranch, _upsertStudentsMaster, _upsertStudentsBranch,
  _deactivateStudentsBranch, _ensureStudentsMasterSheet,
});
