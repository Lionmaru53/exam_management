/**
 * 生徒データインポート（ブラウザ側で xlsx 解析済みの行データを受け取り、子 SS に Upsert）
 *
 * xlsx の解析はフロントエンドが SheetJS で行う。GAS 側は Drive API 不要。
 */

// Excel 1行目のヘッダー名 → 内部フィールド名のマッピング
// _ プレフィックスは結合処理のための中間フィールド
const STUDENT_COLUMN_MAP = {
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
  'school_name', 'school_course', 'sub_course', 'grade',
  'line_user_id', 'is_active'
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
    const ctx = getAdminContext();
    if (ctx.role !== 'master' && String(ctx.cram_id || '').trim() !== String(cramId || '').trim()) {
      return { success: false, error: '権限がありません' };
    }
    if (!cramId)     return { success: false, error: '校舎を選択してください' };
    if (!sheetRows || sheetRows.length < 2) {
      return { success: false, error: 'データが空です（ヘッダー行のみ）' };
    }

    const rawHeaders = sheetRows[0].map(function (h) { return String(h || '').trim(); });
    const dataRows   = sheetRows.slice(1).filter(function (r) {
      return r.some(function (c) { return String(c || '').trim() !== ''; });
    });

    const students = _mapRows(rawHeaders, dataRows, cramId);
    if (students.length === 0) {
      return { success: false, error: '有効なデータが見つかりませんでした（管理番号が空の行はスキップされます）' };
    }

    const childSS = getChildSS(cramId);
    const result  = _upsertStudentsMaster(childSS, students);
    _upsertStudentsBranch(childSS, students);

    writeAuditLog(ctx, 'import_students', { cram_id: cramId, count: students.length }, 'success');
    return { success: true, added: result.added, updated: result.updated };

  } catch (e) {
    console.error('importStudentData error:', e);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function _mapRows(rawHeaders, rows, cramId) {
  var students = [];
  rows.forEach(function (row) {
    var raw = {};
    rawHeaders.forEach(function (h, i) {
      var key = STUDENT_COLUMN_MAP[h];
      if (key) raw[key] = String(row[i] || '').trim();
    });

    var studentId = (raw['student_id'] || '').trim();
    if (!studentId) return;

    students.push({
      student_id:    studentId,
      name:          (raw['_last_name'] || '') + (raw['_first_name'] || ''),
      pronunciation: (raw['_last_kana'] || '') + (raw['_first_kana'] || ''),
      cram_id:       cramId,
      school_name:   raw['school_name'] || '',
      school_course: '',
      sub_course:    '',
      grade:         raw['grade'] || '',
      line_user_id:  '',
      is_active:     true
    });
  });
  return students;
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
  var lineCol = headers.indexOf('line_user_id');

  var existingMap = {};
  for (var i = 1; i < data.length; i++) {
    var sid = String(data[i][idCol] || '').trim();
    if (sid) existingMap[sid] = i + 1;
  }

  var newRows = [];
  var updated = 0;

  students.forEach(function (student) {
    var sid = String(student.student_id).trim();
    var row = headers.map(function (h) {
      return student[h] !== undefined ? student[h] : '';
    });

    if (existingMap[sid]) {
      // 既登録の line_user_id は保持する
      if (lineCol >= 0) {
        var existingLineId = String(data[existingMap[sid] - 1][lineCol] || '').trim();
        if (existingLineId) row[lineCol] = existingLineId;
      }
      sheet.getRange(existingMap[sid], 1, 1, row.length).setValues([row]);
      updated++;
    } else {
      newRows.push(row);
    }
  });

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);
  }

  return { added: newRows.length, updated: updated };
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
