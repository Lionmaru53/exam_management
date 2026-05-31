const UPLOAD_FOLDER_ID_KEY = 'UPLOAD_FOLDER_ID';

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'application/pdf': 'pdf'
};

function _sanitizeFileName(str) {
  return String(str || '').replace(/[\/\\:*?"<>|]/g, '_').trim();
}

function _getOrCreateUploadHistorySheet(ss) {
  let sheet = ss.getSheetByName('upload_history');
  if (!sheet) {
    sheet = ss.insertSheet('upload_history');
    sheet.appendRow(['upload_id', 'student_id', 'term_test_id', 'test_name', 'grade', 'file_url', 'uploaded_at', 'thumbnail_b64']);
  }
  return sheet;
}

function _upsertUploadHistory(sheet, record) {
  const rows = getRowsData(sheet);
  const idx  = rows.findIndex(r =>
    String(r.student_id  || '') === String(record.student_id  || '') &&
    String(r.term_test_id || '') === String(record.term_test_id || '')
  );

  const rowValues = [
    record.upload_id, record.student_id, record.term_test_id,
    record.test_name, record.grade, record.file_url, record.uploaded_at,
    record.thumbnail_b64 || ''
  ];

  if (idx >= 0) {
    // ヘッダー行が1行目なので idx+2 が実際の行番号
    sheet.getRange(idx + 2, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function _nextUploadId(sheet) {
  const rows = getRowsData(sheet);
  if (rows.length === 0) return 'UH001';
  const nums = rows
    .map(r => parseInt(String(r.upload_id || '').replace(/\D/g, ''), 10))
    .filter(n => !isNaN(n));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return 'UH' + String(max + 1).padStart(3, '0');
}

// フォルダを取得または作成するヘルパー
function _getOrCreateFolder(parentFolder, name) {
  const iter = parentFolder.getFoldersByName(name);
  return iter.hasNext() ? iter.next() : parentFolder.createFolder(name);
}

function _uploadFileToDrive(payload) {
  const { student_id, pronunciation, grade, term_test_id, test_name, mime_type, base64_data, cram_id, thumbnail_b64 } = payload || {};

  if (!student_id || !grade || !term_test_id || !test_name || !mime_type || !base64_data) {
    return { success: false, error: '必須パラメータが不足しています' };
  }

  const ext = MIME_TO_EXT[mime_type];
  if (!ext) {
    return { success: false, error: '対応していないファイル形式です' };
  }

  const folderId = PropertiesService.getScriptProperties().getProperty(UPLOAD_FOLDER_ID_KEY);
  if (!folderId) {
    return { success: false, error: 'アップロード先フォルダが設定されていません（UPLOAD_FOLDER_ID）' };
  }

  let rootFolder;
  try {
    rootFolder = DriveApp.getFolderById(folderId);
  } catch (e) {
    return { success: false, error: 'アップロード先フォルダが見つかりません: ' + e.message };
  }

  // フォルダ階層: root/{cram_id}/{student_id}/
  const parentLevel = cram_id
    ? _getOrCreateFolder(rootFolder, String(cram_id))
    : rootFolder;
  const studentFolder = _getOrCreateFolder(parentLevel, String(student_id));

  // ファイル名: {読み（スペース削除）}_{学年}_{試験名}.ext
  const readingName = String(pronunciation || student_id).replace(/\s+/g, '');
  const baseName = _sanitizeFileName(readingName) + '_'
                 + _sanitizeFileName(grade) + '_'
                 + _sanitizeFileName(test_name);
  const fileName = baseName + '.' + ext;

  // 既存ファイルを削除（上書き）
  const existIter = studentFolder.getFilesByName(fileName);
  while (existIter.hasNext()) {
    existIter.next().setTrashed(true);
  }

  const bytes = Utilities.base64Decode(base64_data);
  const blob  = Utilities.newBlob(bytes, mime_type, fileName);
  const file  = studentFolder.createFile(blob);
  const fileUrl = file.getUrl();

  // アップロード履歴を子SSに記録
  if (cram_id) {
    try {
      const childSS   = getChildSS(cram_id);
      const histSheet = _getOrCreateUploadHistorySheet(childSS);
      const uploadId  = _nextUploadId(histSheet);
      _upsertUploadHistory(histSheet, {
        upload_id:    uploadId,
        student_id,
        term_test_id,
        test_name,
        grade,
        file_url:     fileUrl,
        uploaded_at:  new Date().toISOString(),
        thumbnail_b64: thumbnail_b64 || ''
      });
    } catch (e) {
      // 履歴書き込み失敗はアップロード結果には影響させない
      console.warn('upload_history 書き込み失敗:', e.message);
    }
  }

  return {
    success:   true,
    file_url:  fileUrl,
    file_name: fileName
  };
}

function uploadFileToServer(payload) {
  return _uploadFileToDrive(payload);
}

if (typeof module !== 'undefined') Object.assign(global, {
  _sanitizeFileName,
  _uploadFileToDrive,
  uploadFileToServer,
});
