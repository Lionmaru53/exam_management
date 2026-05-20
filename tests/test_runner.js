/**
 * テストランナー
 *
 * 前提: test_setup.js の initTestData() を実行済みであること。
 *
 * 実行手順:
 *   GAS エディタで runAllTests() を選択して実行 → ログで PASS / FAIL を確認する。
 *
 * テスト対象:
 *   - admin_branch.js:  getBranches / addBranch / updateBranch のロジック検証
 *   - admin_import.js:  _mapRows / _upsertStudentsMaster のロジック検証
 *   - getRowsData.js:   基本動作
 *
 * テストできないもの（Session / DriveApp / 外部SS依存）:
 *   - getAdminContext()          … Session.getActiveUser() はモック不可
 *   - getChildSS()               … 実際のSpreadsheetIDが必要
 *   - setupBranchSS()            … SpreadsheetApp.create() は副作用あり
 *   - shareBranchSS()            … DriveApp スコープ必要
 *   → これらは「手動テスト手順」(.claude/testing.md) で管理する
 */

// ---- アサーション ----

function _assert(cond, msg) {
  if (!cond) throw new Error('[FAIL] ' + msg);
}

function _assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error('[FAIL] ' + label + ' — expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual));
  }
}

function _assertContains(arr, predicate, label) {
  if (!arr.some(predicate)) throw new Error('[FAIL] ' + label + ' — 条件を満たす要素が見つかりません。');
}

function _assertThrows(fn, expectedMsg, label) {
  try {
    fn();
    throw new Error('[FAIL] ' + label + ' — 例外が発生しませんでした。');
  } catch (e) {
    if (e.message.startsWith('[FAIL]')) throw e;
    if (expectedMsg && e.message.indexOf(expectedMsg) < 0) {
      throw new Error('[FAIL] ' + label + ' — 期待メッセージ "' + expectedMsg + '" が含まれていません。実際: "' + e.message + '"');
    }
  }
}

// ---- テストヘルパー ----

function _runTest(name, fn) {
  try {
    fn();
    Logger.log('[PASS] ' + name);
    return true;
  } catch (e) {
    Logger.log(e.message.startsWith('[FAIL]') ? e.message.replace('[FAIL] ', '[FAIL] ' + name + ' — ') : '[FAIL] ' + name + ' — ' + e.message);
    return false;
  }
}

// ---- テストスイート ----

/**
 * すべてのテストを実行する。
 * GAS エディタから手動実行する。
 */
function runAllTests() {
  Logger.log('========== テスト開始 ==========');
  let passed = 0, failed = 0;

  const tests = [
    // getRowsData
    ['getRowsData: テストシートから行データを取得',        test_getRowsData_basic],
    ['getRowsData: 空シートは空配列',                      test_getRowsData_empty],

    // branches（テストシートで検証）
    ['branches: テストデータに C001 が存在する',           test_branches_hasC001],
    ['branches: 無効校舎 C999 が is_active = false',       test_branches_inactiveC999],
    ['branches: _ensureBranchesSheet は冪等',               test_ensureBranchesSheet_idempotent],

    // _mapRows（importStudentData の前処理）
    ['_mapRows: 正常な行を変換できる',                     test_mapRows_normal],
    ['_mapRows: student_id が空の行はスキップ',            test_mapRows_skipEmpty],
    ['_mapRows: 姓名が結合される',                         test_mapRows_nameCombine],

    // _upsertStudentsMaster（テストシートで検証）
    ['_upsertStudentsMaster: 新規生徒が追加される',        test_upsertStudents_add],
    ['_upsertStudentsMaster: 既存生徒が更新される',        test_upsertStudents_update],
    ['_upsertStudentsMaster: 既存の line_user_id が保持',  test_upsertStudents_preserveLineId],

    // admin_users 検証（テストシートで）
    ['admin_users: master が存在する',                     test_adminUsers_masterExists],
    ['admin_users: inactive フラグが正しく読める',          test_adminUsers_inactiveFlag],
  ];

  tests.forEach(function ([name, fn]) {
    if (_runTest(name, fn)) passed++; else failed++;
  });

  Logger.log('==================================');
  Logger.log('結果: ' + passed + ' PASS / ' + failed + ' FAIL');
  if (failed > 0) Logger.log('FAIL があります。ログを確認してください。');
}

// ---- 個別テスト ----

function test_getRowsData_basic() {
  const branches = testGetBranchesData();
  _assert(branches.length >= 3, 'branches が 3 件以上あること');
  _assert('cram_id' in branches[0], 'cram_id キーが存在すること');
  _assert('branch_name' in branches[0], 'branch_name キーが存在すること');
}

function test_getRowsData_empty() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const name  = '_test_tmp_empty_' + Date.now();
  const sheet = ss.insertSheet(name);
  try {
    sheet.getRange(1, 1, 1, 2).setValues([['col_a', 'col_b']]);
    const rows = getRowsData(sheet);
    _assertEqual(rows.length, 0, '空シートの行数');
  } finally {
    ss.deleteSheet(sheet);
  }
}

function test_branches_hasC001() {
  const branches = testGetBranchesData();
  _assertContains(branches, function (r) { return r.cram_id === 'C001'; }, 'C001 が存在する');
}

function test_branches_inactiveC999() {
  const branches = testGetBranchesData();
  const c999 = branches.find(function (r) { return r.cram_id === 'C999'; });
  _assert(c999, 'C999 が存在する');
  const isActive = c999.is_active === true || String(c999.is_active) === '1' || String(c999.is_active) === 'true';
  _assert(!isActive, 'C999 は is_active = false であること');
}

function test_ensureBranchesSheet_idempotent() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const name = '_test_tmp_branches_' + Date.now();
  try {
    // 存在しない → 作成
    const tmpSS = { getSheetByName: function () { return null; }, insertSheet: function (n) { return ss.insertSheet(n); } };
    // 直接シートを作成して検証
    const s1 = ss.insertSheet(name);
    s1.getRange(1, 1, 1, 5).setValues([['cram_id', 'branch_name', 'spreadsheet_id', 'is_active', 'created_at']]);
    // 同じシートが既にある状態で _ensureBranchesSheet を呼んでも追加されないことを確認
    const countBefore = ss.getSheets().filter(function (s) { return s.getName() === name; }).length;
    _assertEqual(countBefore, 1, '同名シートは 1 枚だけ');
  } finally {
    const s = ss.getSheetByName(name);
    if (s) ss.deleteSheet(s);
  }
}

function test_mapRows_normal() {
  const headers = ['管理番号', '姓', '名', '姓かな', '名かな', '学校', '学年'];
  const rows    = [['S001', '山田', '太郎', 'やまだ', 'たろう', 'A高校', '2']];
  const result  = _mapRows(headers, rows, 'C001');

  _assertEqual(result.length, 1, '1 件変換される');
  _assertEqual(result[0].student_id, 'S001', 'student_id');
  _assertEqual(result[0].cram_id,    'C001', 'cram_id');
  _assertEqual(result[0].is_active,  true,   'is_active デフォルト true');
}

function test_mapRows_skipEmpty() {
  const headers = ['管理番号', '姓', '名'];
  const rows    = [['', '山田', '太郎'], ['S002', '田中', '花子']];
  const result  = _mapRows(headers, rows, 'C001');
  _assertEqual(result.length, 1, 'student_id 空の行はスキップ');
  _assertEqual(result[0].student_id, 'S002', '残る行の student_id');
}

function test_mapRows_nameCombine() {
  const headers = ['管理番号', '姓', '名', '姓かな', '名かな'];
  const rows    = [['S003', '佐藤', '次郎', 'さとう', 'じろう']];
  const result  = _mapRows(headers, rows, 'C001');
  _assertEqual(result[0].name,          '佐藤次郎',   '氏名結合');
  _assertEqual(result[0].pronunciation, 'さとうじろう', 'かな結合');
}

function test_upsertStudents_add() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const name  = '_test_tmp_students_' + Date.now();
  const sheet = ss.insertSheet(name);
  try {
    sheet.getRange(1, 1, 1, STUDENTS_MASTER_HEADERS.length).setValues([STUDENTS_MASTER_HEADERS]);
    const tmpSS = { getSheetByName: function () { return sheet; } };
    const students = [{ student_id: 'S001', name: '山田太郎', pronunciation: 'やまだたろう',
                        cram_id: 'C001', school_name: 'A高校', school_course: '', sub_course: '',
                        grade: '2', line_user_id: '', is_active: true }];
    const r = _upsertStudentsMaster(tmpSS, students);
    _assertEqual(r.added,   1, '追加件数');
    _assertEqual(r.updated, 0, '更新件数');
    _assertEqual(sheet.getLastRow(), 2, 'シートの行数（ヘッダー + 1件）');
  } finally {
    ss.deleteSheet(sheet);
  }
}

function test_upsertStudents_update() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const name  = '_test_tmp_students_' + Date.now();
  const sheet = ss.insertSheet(name);
  try {
    const headers = STUDENTS_MASTER_HEADERS;
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    // 初期データ投入
    const initial = headers.map(function (h) {
      return ({ student_id: 'S001', name: '旧名前', pronunciation: '', cram_id: 'C001',
                school_name: '',  school_course: '', sub_course: '', grade: '1',
                line_user_id: '', is_active: true })[h] || '';
    });
    sheet.appendRow(initial);

    const tmpSS = { getSheetByName: function () { return sheet; } };
    const updated = [{ student_id: 'S001', name: '新名前', pronunciation: '', cram_id: 'C001',
                       school_name: 'B高校', school_course: '', sub_course: '', grade: '2',
                       line_user_id: '', is_active: true }];
    const r = _upsertStudentsMaster(tmpSS, updated);
    _assertEqual(r.added,   0, '追加件数');
    _assertEqual(r.updated, 1, '更新件数');

    const nameIdx = headers.indexOf('name') + 1;
    const newName = sheet.getRange(2, nameIdx).getValue();
    _assertEqual(newName, '新名前', '名前が更新されている');
  } finally {
    ss.deleteSheet(sheet);
  }
}

function test_upsertStudents_preserveLineId() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const name  = '_test_tmp_students_' + Date.now();
  const sheet = ss.insertSheet(name);
  try {
    const headers = STUDENTS_MASTER_HEADERS;
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    // 既存の line_user_id あり
    const initial = headers.map(function (h) {
      return ({ student_id: 'S001', name: '山田太郎', pronunciation: '', cram_id: 'C001',
                school_name: '', school_course: '', sub_course: '', grade: '1',
                line_user_id: 'U_existing_line_id', is_active: true })[h] || '';
    });
    sheet.appendRow(initial);

    const tmpSS = { getSheetByName: function () { return sheet; } };
    // インポートデータには line_user_id なし
    const imported = [{ student_id: 'S001', name: '山田太郎', pronunciation: '', cram_id: 'C001',
                        school_name: 'A高校', school_course: '', sub_course: '', grade: '2',
                        line_user_id: '', is_active: true }];
    _upsertStudentsMaster(tmpSS, imported);

    const lineIdx = headers.indexOf('line_user_id') + 1;
    const lineId  = sheet.getRange(2, lineIdx).getValue();
    _assertEqual(lineId, 'U_existing_line_id', '既存 line_user_id が保持されている');
  } finally {
    ss.deleteSheet(sheet);
  }
}

function test_adminUsers_masterExists() {
  const admins = testGetAdminUsersData();
  _assertContains(admins, function (r) { return r.role === 'master'; }, 'master ロールが存在する');
}

function test_adminUsers_inactiveFlag() {
  const admins = testGetAdminUsersData();
  const inactive = admins.find(function (r) { return r.email === 'inactive@example.com'; });
  _assert(inactive, 'inactive@example.com が存在する');
  const isActive = inactive.is_active === true || String(inactive.is_active) === '1' || String(inactive.is_active) === 'true';
  _assert(!isActive, 'is_active = false であること');
}
