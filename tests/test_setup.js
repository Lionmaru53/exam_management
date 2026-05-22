/**
 * テストデータのセットアップ / クリーンアップ
 *
 * 使い方:
 *   1. GAS エディタで initTestData() を手動実行 → テスト用シートにサンプルデータが投入される
 *   2. test_runner.js の runAllTests() でテストを実行
 *   3. clearTestData() でテストデータを削除（シートごと削除）
 *
 * 注意: このファイルは dev/test ブランチ専用。本番 GAS プロジェクトには push しないこと。
 *
 * ---- テスト用シート名プレフィックス ----
 * 本番シートと衝突しないよう "_test_" プレフィックスを付ける。
 * テスト関数はこれらのシートを直接操作する。
 */

// ---- 定数 ----

const TEST_PREFIX       = '_test_';
const TEST_ADMIN_SHEET  = TEST_PREFIX + 'admin_users';
const TEST_BRANCH_SHEET = TEST_PREFIX + 'branches';
const TEST_INDEX_SHEET  = TEST_PREFIX + 'student_index';

// テスト用固定データ
const TEST_DATA = {
  admins: [
    // headers: email, role, cram_id, is_active, last_login
    ['email', 'role', 'cram_id', 'is_active', 'last_login'],
    ['master@example.com',  'master',       '',     true,  ''],
    ['branch1@example.com', 'branch_admin', 'C001', true,  ''],
    ['branch2@example.com', 'branch_admin', 'C002', true,  ''],
    ['inactive@example.com','branch_admin', 'C001', false, ''],
  ],
  branches: [
    // headers: cram_id, branch_name, spreadsheet_id, is_active, created_at
    ['cram_id', 'branch_name', 'spreadsheet_id', 'is_active', 'created_at'],
    ['C001', '渋谷校',   '',  true,  '2026-01-01'],
    ['C002', '新宿校',   '',  true,  '2026-01-02'],
    ['C999', '廃止校',   '',  false, '2026-01-03'],  // 無効校舎（getChildSS は失敗すべき）
  ],
  // student_index: LINE ID → cram_id ルーティング
  studentIndex: [
    ['student_id', 'line_user_id', 'cram_id'],
    ['S001', 'Uabc123', 'C001'],
    ['S002', 'Udef456', 'C001'],
    ['S003', 'Ughi789', 'C002'],
  ],
};

/**
 * テスト用シートにサンプルデータを投入する。
 * 既存のテストシートはいったん削除してから再作成する。
 */
function initTestData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  clearTestData();

  _createSheetWithData(ss, TEST_ADMIN_SHEET,  TEST_DATA.admins);
  _createSheetWithData(ss, TEST_BRANCH_SHEET, TEST_DATA.branches);
  _createSheetWithData(ss, TEST_INDEX_SHEET,  TEST_DATA.studentIndex);

  Logger.log('テストデータを初期化しました。');
  Logger.log('  ' + TEST_ADMIN_SHEET  + ': ' + (TEST_DATA.admins.length  - 1) + ' 件');
  Logger.log('  ' + TEST_BRANCH_SHEET + ': ' + (TEST_DATA.branches.length - 1) + ' 件');
  Logger.log('  ' + TEST_INDEX_SHEET  + ': ' + (TEST_DATA.studentIndex.length - 1) + ' 件');
}

/**
 * テスト用シートをすべて削除する。
 */
function clearTestData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [TEST_ADMIN_SHEET, TEST_BRANCH_SHEET, TEST_INDEX_SHEET].forEach(function (name) {
    const s = ss.getSheetByName(name);
    if (s) {
      ss.deleteSheet(s);
      Logger.log('削除: ' + name);
    }
  });
}

// ---- テスト用スタブ（getAdminContext のオーバーライド） ----

/**
 * テスト用の adminContext を返す。
 * 本番の getAdminContext() は Session.getActiveUser() に依存するため、
 * テストでは直接このオブジェクトを渡して検証する。
 */
const TEST_CONTEXTS = {
  master:       { email: 'master@example.com',  role: 'master',       cram_id: '' },
  branchAdmin1: { email: 'branch1@example.com', role: 'branch_admin', cram_id: 'C001' },
  branchAdmin2: { email: 'branch2@example.com', role: 'branch_admin', cram_id: 'C002' },
  inactive:     { email: 'inactive@example.com', role: 'branch_admin', cram_id: 'C001' },
};

// ---- テスト用スプレッドシートデータ（インメモリ検証用） ----

/**
 * 本番シート名をテストシート名に差し替えた getBranches 相当のロジック。
 * 実際の getBranches() は BRANCHES_SHEET 定数に依存するため、
 * テストでは TEST_BRANCH_SHEET を参照するこちらを使う。
 */
function testGetBranchesData() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TEST_BRANCH_SHEET);
  if (!sheet) throw new Error(TEST_BRANCH_SHEET + ' が存在しません。initTestData() を先に実行してください。');
  return getRowsData(sheet);
}

/**
 * テスト用 admin_users を読む。
 */
function testGetAdminUsersData() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TEST_ADMIN_SHEET);
  if (!sheet) throw new Error(TEST_ADMIN_SHEET + ' が存在しません。initTestData() を先に実行してください。');
  return getRowsData(sheet);
}

// ---- ユーティリティ ----

function _createSheetWithData(ss, name, rows) {
  const sheet = ss.insertSheet(name);
  if (rows.length === 0) return sheet;
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  return sheet;
}
