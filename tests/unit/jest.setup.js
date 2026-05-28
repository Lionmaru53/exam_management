const path = require('path');
const SRC  = path.join(__dirname, '../../src');

// ---- GAS API グローバルモック ----

global.Logger = { log: jest.fn(), warn: jest.fn() };

global.Utilities = {
  formatDate: jest.fn((d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d))),
  getUuid:    jest.fn(() => 'test-uuid'),
};

global.Session = {
  getActiveUser: jest.fn(() => ({ getEmail: jest.fn(() => '') })),
};

global.LockService = {
  getScriptLock: jest.fn(() => ({
    waitLock:    jest.fn(),
    releaseLock: jest.fn(),
  })),
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(),
  openById:             jest.fn(),
  create:               jest.fn(),
};

global.DriveApp = {
  getFileById: jest.fn(() => ({ addEditor: jest.fn() })),
};

// ---- ソースファイルを依存順に読み込む（GAS グローバルスコープを再現）----
// 各ファイル末尾の `Object.assign(global, {...})` で関数が global に登録される

require(path.join(SRC, 'getRowsData.js'));   // 依存なし
require(path.join(SRC, 'getData.js'));        // stringifyDates を定義
require(path.join(SRC, 'admin_auth.js'));     // getAdminContext, writeAuditLog 等
require(path.join(SRC, 'admin_branch.js'));   // getBranches, addBranch 等、getChildSS
require(path.join(SRC, 'admin_import.js'));   // _mapRows, _upsertStudentsMaster 等
require(path.join(SRC, 'admin_getData.js'));  // getAdminInitialData, getStudentList 等
require(path.join(SRC, 'admin_save_students.js'));
require(path.join(SRC, 'admin_save_exams.js'));
