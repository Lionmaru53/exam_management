/**
 * 生徒データインポート / LINE ID 連携
 *
 * - importStudentData: SheetJS で解析済みの xlsx 行データを受け取り、子 SS の students_master に Upsert
 * - linkLineIds: 外部 SS の「内部生」シート（2行目=ヘッダー、3行目以降=データ）から
 *               管理番号 ↔ LINE ID を読み、子 SS の students_master と
 *               親 SS の student_index に反映する
 */

// ---- student_index（親SS ルーティングテーブル）----

const STUDENT_INDEX_SHEET   = 'student_index';
const STUDENT_INDEX_HEADERS = ['student_id', 'line_user_id', 'cram_id'];

function _ensureStudentIndexSheet(ss) {
  var sheet = ss.getSheetByName(STUDENT_INDEX_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(STUDENT_INDEX_SHEET);
    sheet.getRange(1, 1, 1, STUDENT_INDEX_HEADERS.length).setValues([STUDENT_INDEX_HEADERS]);
  }
  return sheet;
}

/**
 * 外部 SS の「内部生」シートから LINE ID を読み込み、以下を更新する。
 *   1. 子 SS の students_master.line_user_id
 *   2. 親 SS の student_index（line_user_id → cram_id ルーティング用）
 *
 * シート構造: 1行目=タイトル行（無視）、2行目=ヘッダー行、3行目以降=データ
 *
 * @param {string} cramId          - 対象校舎の cram_id
 * @param {string} spreadsheetUrl  - LINE ID 管理スプレッドシートの URL
 * @returns {{ success, linked, notFound, error? }}
 */
function linkLineIds(cramId, spreadsheetUrl) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const ctx = getAdminContext();
    if (ctx.role !== 'master' && String(ctx.cram_id || '').trim() !== String(cramId || '').trim()) {
      return { success: false, error: '権限がありません' };
    }
    if (!cramId)          return { success: false, error: '校舎を選択してください' };
    if (!spreadsheetUrl)  return { success: false, error: 'スプレッドシート URL を入力してください' };

    // 外部 SS を開く
    var extSS;
    try {
      extSS = SpreadsheetApp.openByUrl(spreadsheetUrl.trim());
    } catch (e) {
      return { success: false, error: 'スプレッドシートを開けません。URL と共有設定を確認してください: ' + e.message };
    }

    var extSheet = extSS.getSheetByName('内部生');
    if (!extSheet) return { success: false, error: '「内部生」シートが見つかりません' };

    var extData = extSheet.getDataRange().getValues();
    // 1行目=タイトル行、2行目=ヘッダー行、3行目以降=データ
    if (extData.length < 3) return { success: false, error: 'データが不足しています（3行目以降にデータが必要です）' };

    var extHeaders = extData[1].map(function (h) { return String(h).trim(); }); // 2行目
    var sidCol     = extHeaders.indexOf('管理番号');
    var lidCol     = extHeaders.indexOf('生徒');

    if (sidCol < 0) return { success: false, error: '「管理番号」列が見つかりません（2行目のヘッダーを確認してください）' };
    if (lidCol < 0) return { success: false, error: '「生徒」列が見つかりません（2行目のヘッダーを確認してください）' };

    // 3行目以降から有効な行だけ抽出（両方に値がある行）
    var mappings = [];
    for (var i = 2; i < extData.length; i++) {
      var sid = String(extData[i][sidCol] || '').trim();
      var lid = String(extData[i][lidCol] || '').trim();
      if (sid && lid) mappings.push({ student_id: sid, line_user_id: lid });
    }
    if (mappings.length === 0) {
      return { success: false, error: '有効なデータが見つかりませんでした（管理番号または生徒列が空）' };
    }

    // 1. 子 SS の students_master を更新
    const childSS     = getChildSS(cramId);
    const masterSheet = _ensureStudentsMasterSheet(childSS);
    const masterData  = masterSheet.getDataRange().getValues();
    const mHeaders    = masterData[0];
    const mSidCol     = mHeaders.indexOf('student_id');
    const mLidCol     = mHeaders.indexOf('line_user_id');

    var studentMap = {};
    for (var j = 1; j < masterData.length; j++) {
      var s = String(masterData[j][mSidCol] || '').trim();
      if (s) studentMap[s] = j + 1; // 1-based row
    }

    var linked   = 0;
    var notFound = 0;
    mappings.forEach(function (m) {
      if (studentMap[m.student_id] && mLidCol >= 0) {
        masterSheet.getRange(studentMap[m.student_id], mLidCol + 1).setValue(m.line_user_id);
        linked++;
      } else {
        notFound++;
      }
    });

    // 2. 親 SS の student_index を Upsert
    const parentSS = SpreadsheetApp.getActiveSpreadsheet();
    const idxSheet = _ensureStudentIndexSheet(parentSS);
    const idxData  = idxSheet.getDataRange().getValues();
    const ixSidCol = idxData[0].indexOf('student_id');

    var idxMap = {};
    for (var k = 1; k < idxData.length; k++) {
      var is = String(idxData[k][ixSidCol] || '').trim();
      if (is) idxMap[is] = k + 1;
    }

    var newIdxRows = [];
    mappings.forEach(function (m) {
      var row = [m.student_id, m.line_user_id, cramId];
      if (idxMap[m.student_id]) {
        idxSheet.getRange(idxMap[m.student_id], 1, 1, row.length).setValues([row]);
      } else {
        newIdxRows.push(row);
      }
    });
    if (newIdxRows.length > 0) {
      idxSheet.getRange(idxSheet.getLastRow() + 1, 1, newIdxRows.length, 3).setValues(newIdxRows);
    }

    writeAuditLog(ctx, 'link_line_ids', { cram_id: cramId, linked: linked, notFound: notFound }, 'success');
    return { success: true, linked: linked, notFound: notFound };

  } catch (e) {
    console.error('linkLineIds error:', e);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

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
