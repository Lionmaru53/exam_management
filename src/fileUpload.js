const STUDENT_FILES_SHEET = 'student_files';

/**
 * 生徒がファイルを Google Drive にアップロードし、student_files シートに記録する。
 * payload: {
 *   student_id: string,
 *   exam_id: string | null,
 *   file_type: 'score_proof' | 'evaluation' | 'other',
 *   file_name: string,
 *   base64_data: string,  // data URL（"data:...;base64,..."）または raw base64
 *   mime_type: string     // e.g. 'image/jpeg', 'application/pdf'
 * }
 */
function uploadStudentFile(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);

    const studentId = String(payload.student_id || '').trim();
    if (!studentId) return JSON.stringify({ error: '生徒IDが指定されていません' });

    const parentSS = SpreadsheetApp.getActiveSpreadsheet();
    const idxSheet = parentSS.getSheetByName('student_index');
    if (!idxSheet) return JSON.stringify({ error: 'student_index シートが見つかりません' });

    const idxRows  = getRowsData(idxSheet);
    const idxEntry = idxRows.find(r => String(r.student_id || '').trim() === studentId);
    if (!idxEntry) return JSON.stringify({ error: '生徒情報が見つかりません' });

    const cramId = String(idxEntry.cram_id || '').trim();
    if (!cramId) return JSON.stringify({ error: '校舎情報が未設定です' });

    const ss = getChildSS(cramId);

    const folder = _getDriveFolder(ss, cramId);

    let base64 = String(payload.base64_data || '');
    if (base64.includes(',')) base64 = base64.split(',')[1];

    const mimeType = String(payload.mime_type || 'application/octet-stream');
    const fileName = String(payload.file_name || ('upload_' + Date.now()));

    const blob      = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, fileName);
    const driveFile = folder.createFile(blob);
    driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileId  = 'FILE' + Utilities.getUuid().replace(/-/g, '').substring(0, 12);
    const examId  = String(payload.exam_id  || '').trim();
    const fileType = String(payload.file_type || 'other');

    _ensureStudentFilesSheet(ss);
    const filesSheet = ss.getSheetByName(STUDENT_FILES_SHEET);
    filesSheet.appendRow([fileId, studentId, examId, fileType, driveFile.getId(), fileName, new Date()]);

    return JSON.stringify({ success: true, file_id: fileId, drive_file_id: driveFile.getId() });
  } catch (e) {
    return JSON.stringify({ error: e.toString() });
  } finally {
    lock.releaseLock();
  }
}

/**
 * 生徒のファイル一覧を返す（student_id で自分のファイルのみ）。
 */
function getStudentFiles(studentId) {
  try {
    const parentSS = SpreadsheetApp.getActiveSpreadsheet();
    const idxRows  = getRowsData(parentSS.getSheetByName('student_index') || { getDataRange: () => ({ getValues: () => [] }) });
    const idxEntry = idxRows.find(r => String(r.student_id || '').trim() === String(studentId).trim());
    if (!idxEntry) return JSON.stringify({ error: '生徒情報が見つかりません' });

    const cramId = String(idxEntry.cram_id || '').trim();
    const ss     = getChildSS(cramId);

    _ensureStudentFilesSheet(ss);
    const rows  = getRowsData(ss.getSheetByName(STUDENT_FILES_SHEET));
    const files = rows.filter(r => String(r.student_id || '').trim() === String(studentId).trim());

    return JSON.stringify({ success: true, files: stringifyDates(files) });
  } catch (e) {
    return JSON.stringify({ error: e.toString() });
  }
}

/**
 * ファイルを削除する（生徒は自分のファイルのみ）。
 * payload: { student_id, file_id }
 */
function deleteStudentFile(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const studentId = String(payload.student_id || '').trim();
    const fileId    = String(payload.file_id    || '').trim();
    if (!studentId || !fileId) return JSON.stringify({ error: '引数が不足しています' });

    const parentSS  = SpreadsheetApp.getActiveSpreadsheet();
    const idxRows   = getRowsData(parentSS.getSheetByName('student_index'));
    const idxEntry  = idxRows.find(r => String(r.student_id || '').trim() === studentId);
    if (!idxEntry) return JSON.stringify({ error: '生徒情報が見つかりません' });

    const cramId     = String(idxEntry.cram_id || '').trim();
    const ss         = getChildSS(cramId);
    const filesSheet = ss.getSheetByName(STUDENT_FILES_SHEET);
    if (!filesSheet) return JSON.stringify({ error: 'student_files シートが見つかりません' });

    const data     = filesSheet.getDataRange().getValues();
    const headers  = data[0];
    const fileIdCol     = headers.indexOf('file_id');
    const studentIdCol  = headers.indexOf('student_id');
    const driveFileIdCol = headers.indexOf('drive_file_id');

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][fileIdCol]).trim() !== fileId) continue;
      if (String(data[i][studentIdCol]).trim() !== studentId) {
        return JSON.stringify({ error: '他の生徒のファイルは削除できません' });
      }
      try {
        DriveApp.getFileById(String(data[i][driveFileIdCol]).trim()).setTrashed(true);
      } catch (e) {
        console.warn('Drive ファイルのゴミ箱移動失敗:', e.message);
      }
      filesSheet.deleteRow(i + 1);
      return JSON.stringify({ success: true });
    }
    return JSON.stringify({ error: '指定したファイルが見つかりません' });
  } catch (e) {
    return JSON.stringify({ error: e.toString() });
  } finally {
    lock.releaseLock();
  }
}

/**
 * 管理者向け: 校舎の全ファイル一覧を取得する。
 * @param {string} cramId - 校舎 ID
 */
function getStudentFilesForAdmin(cramId) {
  try {
    const ctx          = getAdminContext();
    const targetCramId = String(cramId || (ctx.cram_ids && ctx.cram_ids[0]) || '').trim();
    if (!targetCramId) return { success: false, error: '校舎が選択されていません' };

    const ss = getChildSS(targetCramId);
    _ensureStudentFilesSheet(ss);

    const files = stringifyDates(getRowsData(ss.getSheetByName(STUDENT_FILES_SHEET)));

    const studentsSheet = ss.getSheetByName('students_master');
    const studentMap    = {};
    if (studentsSheet) {
      getRowsData(studentsSheet).forEach(s => { studentMap[s.student_id] = s.name || ''; });
    }
    files.forEach(f => { f.student_name = studentMap[f.student_id] || ''; });

    return { success: true, files };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 子 SS の config シートから Drive フォルダを取得（なければ作成して config に保存）。
 */
function _getDriveFolder(childSS, cramId) {
  const configSheet = childSS.getSheetByName('config');
  if (!configSheet) throw new Error('config シートが見つかりません');

  const data = configSheet.getDataRange().getValues();
  let folderIdRow = -1;
  let folderId    = '';

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === 'DRIVE_FOLDER_ID') {
      folderIdRow = i + 1;
      folderId    = String(data[i][1] || '').trim();
      break;
    }
  }

  if (folderId) {
    try { return DriveApp.getFolderById(folderId); } catch (e) { /* フォルダが消された場合は再作成 */ }
  }

  const branchName = _getConfigValue(childSS, 'BRANCH_NAME') || cramId;
  const newFolder  = DriveApp.createFolder('[塾管理] ' + branchName + ' アップロード');
  const newId      = newFolder.getId();

  if (folderIdRow > 0) {
    configSheet.getRange(folderIdRow, 2).setValue(newId);
  } else {
    configSheet.appendRow(['DRIVE_FOLDER_ID', newId]);
  }
  return newFolder;
}

function _getConfigValue(childSS, key) {
  const configSheet = childSS.getSheetByName('config');
  if (!configSheet) return null;
  const data = configSheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) return String(data[i][1] || '').trim();
  }
  return null;
}

function _ensureStudentFilesSheet(ss) {
  if (!ss.getSheetByName(STUDENT_FILES_SHEET)) {
    const sheet = ss.insertSheet(STUDENT_FILES_SHEET);
    sheet.getRange(1, 1, 1, 7).setValues([[
      'file_id', 'student_id', 'exam_id', 'file_type', 'drive_file_id', 'file_name', 'uploaded_at'
    ]]);
  }
}

if (typeof module !== 'undefined') Object.assign(global, {
  STUDENT_FILES_SHEET,
  uploadStudentFile, getStudentFiles, deleteStudentFile, getStudentFilesForAdmin,
  _getDriveFolder, _getConfigValue, _ensureStudentFilesSheet
});
