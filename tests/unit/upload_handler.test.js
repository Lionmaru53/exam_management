'use strict';

// DriveApp・PropertiesService・Utilities の追加モックを設定
function makeFakeIterator(items) {
  let i = 0;
  return { hasNext: () => i < items.length, next: () => items[i++] };
}

function makeFakeFolder(name, { files = [], subFolders = [] } = {}) {
  const folder = {
    getName:          jest.fn(() => name),
    getFoldersByName: jest.fn(() => makeFakeIterator([])),
    createFolder:     jest.fn((n) => makeFakeFolder(n)),
    getFilesByName:   jest.fn(() => makeFakeIterator(files)),
    createFile:       jest.fn(() => ({ getUrl: jest.fn(() => 'https://drive.google.com/file/fake') })),
    addFile:          jest.fn(),
    removeFile:       jest.fn(),
    getFiles:         jest.fn(() => makeFakeIterator(files)),
    getFolders:       jest.fn(() => makeFakeIterator(subFolders)),
    setTrashed:       jest.fn(),
  };
  return folder;
}

function setupDriveAndProps(fakeRootFolder) {
  global.DriveApp = {
    getFolderById: jest.fn(() => fakeRootFolder),
    getFileById:   jest.fn(() => ({ addEditor: jest.fn() })),
  };
  global.PropertiesService = {
    getScriptProperties: jest.fn(() => ({
      getProperty: jest.fn((key) => key === 'UPLOAD_FOLDER_ID' ? 'fake-folder-id' : null),
    })),
  };
  global.Utilities = {
    ...global.Utilities,
    base64Decode: jest.fn(() => new Uint8Array([1, 2, 3])),
    newBlob:      jest.fn((bytes, mime, name) => ({ bytes, mime, name })),
    formatDate:   jest.fn((d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d))),
    getUuid:      jest.fn(() => 'test-uuid'),
  };
  // upload_history 書き込みで getChildSS が呼ばれる場合のモック
  global.getChildSS = jest.fn(() => ({
    getSheetByName: jest.fn(() => null),
    insertSheet: jest.fn(() => ({
      appendRow: jest.fn(),
      getDataRange: jest.fn(() => ({ getValues: jest.fn(() => [[]]) })),
      getRange: jest.fn(() => ({ setValues: jest.fn() })),
      getLastRow: jest.fn(() => 1),
    })),
  }));
}

const BASE_PAYLOAD = {
  student_id:   'S001',
  pronunciation: 'やまだたろう',
  grade:        '高1',
  term_test_id: 'T01',
  test_name:    '1学期中間',
  mime_type:    'image/jpeg',
  base64_data:  'dGVzdA==',
  cram_id:      'C001',
};

// ---- _sanitizeFileName ----
describe('_sanitizeFileName', () => {
  test('特殊文字をアンダースコアに置換する', () => {
    expect(_sanitizeFileName('a/b:c*d?e"f<g>h|i')).toBe('a_b_c_d_e_f_g_h_i');
  });
  test('前後の空白をトリムする', () => {
    expect(_sanitizeFileName('  abc  ')).toBe('abc');
  });
  test('null/undefined → 空文字', () => {
    expect(_sanitizeFileName(null)).toBe('');
    expect(_sanitizeFileName(undefined)).toBe('');
  });
});

// ---- ファイル名の検証 ----
describe('_uploadFileToDrive ファイル名', () => {
  let rootFolder;

  beforeEach(() => {
    rootFolder = makeFakeFolder('root');
    const cramFolder = makeFakeFolder('C001');
    const studFolder = makeFakeFolder('S001');
    rootFolder.getFoldersByName.mockImplementation((n) =>
      n === 'C001' ? makeFakeIterator([cramFolder]) : makeFakeIterator([])
    );
    cramFolder.getFoldersByName.mockImplementation((n) =>
      n === 'S001' ? makeFakeIterator([studFolder]) : makeFakeIterator([])
    );
    rootFolder.createFolder.mockReturnValue(cramFolder);
    cramFolder.createFolder.mockReturnValue(studFolder);
    setupDriveAndProps(rootFolder);
  });

  test('pronunciationが使われ、スペースなしのファイル名になる', () => {
    const result = _uploadFileToDrive({ ...BASE_PAYLOAD, pronunciation: 'やまだ たろう' });
    expect(result.success).toBe(true);
    expect(result.file_name).toBe('やまだたろう_高1_1学期中間.jpg');
  });

  test('pronunciationが空のとき student_id にフォールバック', () => {
    const result = _uploadFileToDrive({ ...BASE_PAYLOAD, pronunciation: '' });
    expect(result.success).toBe(true);
    expect(result.file_name).toBe('S001_高1_1学期中間.jpg');
  });

  test('pronunciationが未指定のとき student_id にフォールバック', () => {
    const payload = { ...BASE_PAYLOAD };
    delete payload.pronunciation;
    const result = _uploadFileToDrive(payload);
    expect(result.success).toBe(true);
    expect(result.file_name).toBe('S001_高1_1学期中間.jpg');
  });

  test('PDFはpdf拡張子になる', () => {
    const result = _uploadFileToDrive({ ...BASE_PAYLOAD, mime_type: 'application/pdf' });
    expect(result.success).toBe(true);
    expect(result.file_name).toMatch(/\.pdf$/);
  });
});

// ---- フォルダ階層の検証 ----
describe('_uploadFileToDrive フォルダ階層', () => {
  test('cram_idありのとき root/{cram_id}/{student_id}/ にファイルを作成する', () => {
    const rootFolder = makeFakeFolder('root');
    const cramFolder = makeFakeFolder('C001');
    const studFolder = makeFakeFolder('S001');

    rootFolder.getFoldersByName.mockImplementation((n) =>
      n === 'C001' ? makeFakeIterator([cramFolder]) : makeFakeIterator([])
    );
    cramFolder.getFoldersByName.mockImplementation((n) =>
      n === 'S001' ? makeFakeIterator([studFolder]) : makeFakeIterator([])
    );
    setupDriveAndProps(rootFolder);

    _uploadFileToDrive(BASE_PAYLOAD);

    expect(rootFolder.getFoldersByName).toHaveBeenCalledWith('C001');
    expect(cramFolder.getFoldersByName).toHaveBeenCalledWith('S001');
    expect(studFolder.createFile).toHaveBeenCalled();
  });

  test('cram_idなしのとき root/{student_id}/ に直接作成する', () => {
    const rootFolder = makeFakeFolder('root');
    const studFolder = makeFakeFolder('S001');

    rootFolder.getFoldersByName.mockImplementation((n) =>
      n === 'S001' ? makeFakeIterator([studFolder]) : makeFakeIterator([])
    );
    setupDriveAndProps(rootFolder);

    const payload = { ...BASE_PAYLOAD };
    delete payload.cram_id;
    _uploadFileToDrive(payload);

    // cram_id フォルダは作られない
    expect(rootFolder.getFoldersByName).not.toHaveBeenCalledWith('C001');
    expect(rootFolder.getFoldersByName).toHaveBeenCalledWith('S001');
    expect(studFolder.createFile).toHaveBeenCalled();
  });

  test('cram_idフォルダが存在しない場合は作成する', () => {
    const rootFolder = makeFakeFolder('root');
    const newCramFolder = makeFakeFolder('C001');
    const studFolder = makeFakeFolder('S001');

    rootFolder.getFoldersByName.mockReturnValue(makeFakeIterator([]));
    rootFolder.createFolder.mockReturnValue(newCramFolder);
    newCramFolder.getFoldersByName.mockReturnValue(makeFakeIterator([studFolder]));
    setupDriveAndProps(rootFolder);

    _uploadFileToDrive(BASE_PAYLOAD);

    expect(rootFolder.createFolder).toHaveBeenCalledWith('C001');
    expect(studFolder.createFile).toHaveBeenCalled();
  });
});

// ---- バリデーション ----
describe('_uploadFileToDrive バリデーション', () => {
  beforeEach(() => {
    setupDriveAndProps(makeFakeFolder('root'));
  });

  test('必須パラメータ欠落 → エラー', () => {
    const result = _uploadFileToDrive({ student_id: 'S001' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('必須パラメータが不足しています');
  });

  test('不正なMIMEタイプ → エラー', () => {
    const result = _uploadFileToDrive({ ...BASE_PAYLOAD, mime_type: 'text/plain' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('対応していないファイル形式');
  });

  test('UPLOAD_FOLDER_IDが未設定 → エラー', () => {
    global.PropertiesService = {
      getScriptProperties: jest.fn(() => ({
        getProperty: jest.fn(() => null),
      })),
    };
    const result = _uploadFileToDrive(BASE_PAYLOAD);
    expect(result.success).toBe(false);
    expect(result.error).toContain('UPLOAD_FOLDER_ID');
  });

  test('payloadが空 → エラー', () => {
    const result = _uploadFileToDrive(null);
    expect(result.success).toBe(false);
  });
});
