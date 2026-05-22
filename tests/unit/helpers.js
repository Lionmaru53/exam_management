/**
 * テスト共通ヘルパー
 *
 * GAS の Sheet / Spreadsheet オブジェクトを模倣する fake オブジェクトを生成する。
 * テストケースで繰り返し使うセットアップ処理をここに集約する。
 */

/**
 * Fake Sheet オブジェクトを生成する。
 * @param {string[]} headers - ヘッダー行（列名の配列）
 * @param {any[][]}  dataRows - データ行（2次元配列）
 */
function makeFakeSheet(headers, dataRows) {
  return {
    getDataRange: () => ({
      getValues: () => (headers.length ? [headers, ...dataRows] : [[]]),
    }),
    // getRange は _updateLastLogin や _upsertStudentsMaster が使用
    getRange: jest.fn(() => ({
      getValue:  jest.fn(() => ''),
      getValues: jest.fn(() => [headers]),
      setValue:  jest.fn(),
      setValues: jest.fn(),
    })),
    getLastColumn: jest.fn(() => headers.length),
    getLastRow:    jest.fn(() => dataRows.length + 1),
    appendRow:     jest.fn(),
    getName:       jest.fn(() => 'mock-sheet'),
    setName:       jest.fn(),
  };
}

/**
 * Fake Spreadsheet オブジェクトを生成する。
 * @param {{ [sheetName: string]: ReturnType<makeFakeSheet> }} sheetMap
 */
function makeFakeSS(sheetMap) {
  return {
    getSheetByName: jest.fn((name) => sheetMap[name] || null),
    insertSheet:    jest.fn(() => makeFakeSheet([], [])),
    deleteSheet:    jest.fn(),
    getId:          jest.fn(() => 'mock-ss-id'),
    getUrl:         jest.fn(() => 'https://docs.google.com/spreadsheets/d/mock-ss-id'),
    getActiveSheet: jest.fn(() => makeFakeSheet(['col'], [])),
  };
}

/**
 * admin_users シート用の fake sheet を生成するショートカット。
 * @param {Array<{ email: string, role: string, cram_id: string, is_active: boolean }>} users
 */
function makeAdminUsersSheet(users) {
  const headers  = ['admin_id', 'email', 'cram_id', 'role', 'is_active', 'created_at', 'last_login'];
  const dataRows = users.map((u, i) => [
    'A000' + i,
    u.email,
    u.cram_id || '',
    u.role,
    u.is_active !== undefined ? u.is_active : true,
    '',
    '',
  ]);
  return makeFakeSheet(headers, dataRows);
}

/**
 * branches シート用の fake sheet を生成するショートカット。
 * @param {Array<{ cram_id: string, branch_name: string, spreadsheet_id?: string, is_active?: boolean }>} branches
 */
function makeBranchesSheet(branches) {
  const headers  = ['cram_id', 'branch_name', 'spreadsheet_id', 'is_active', 'created_at'];
  const dataRows = branches.map(b => [
    b.cram_id,
    b.branch_name || '',
    b.spreadsheet_id || '',
    b.is_active !== undefined ? b.is_active : true,
    '',
  ]);
  return makeFakeSheet(headers, dataRows);
}

module.exports = { makeFakeSheet, makeFakeSS, makeAdminUsersSheet, makeBranchesSheet };
