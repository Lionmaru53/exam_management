'use strict';
const { makeAdminUsersSheet, makeFakeSheet, makeFakeSS } = require('./helpers');

describe('getDashboardData', () => {
  const LOG_HEADERS = ['timestamp', 'line_user_id', 'result', 'student_id', 'cram_id', 'student_name'];

  function makeLogSheet(entries) {
    const rows = entries.map(e => LOG_HEADERS.map(h => e[h] !== undefined ? e[h] : ''));
    return makeFakeSheet(LOG_HEADERS, rows);
  }

  // logEntries=null にするとシートを作らない（getSheetByName が null を返す）
  function setupMockSS(logEntries, options = {}) {
    const { email = 'master@example.com', role = 'master', isActive = true } = options;
    const adminSheet = makeAdminUsersSheet([{ email, role, cram_id: '', is_active: isActive }]);
    const sheetMap   = { admin_users: adminSheet, audit_log: { appendRow: jest.fn() } };
    if (logEntries !== null) sheetMap['liff_access_log'] = makeLogSheet(logEntries);
    global.SpreadsheetApp.getActiveSpreadsheet.mockReturnValue(makeFakeSS(sheetMap));
    global.Session.getActiveUser.mockReturnValue({ getEmail: () => email });
  }

  // ---- 正常系 ----

  test('ログが6件あるとき最新5件のみ返す', () => {
    setupMockSS([
      { timestamp: '2024-01-01T10:00:00', result: 'success', student_name: '生徒1', cram_id: 'C001' },
      { timestamp: '2024-01-02T10:00:00', result: 'success', student_name: '生徒2', cram_id: 'C001' },
      { timestamp: '2024-01-03T10:00:00', result: 'success', student_name: '生徒3', cram_id: 'C001' },
      { timestamp: '2024-01-04T10:00:00', result: 'success', student_name: '生徒4', cram_id: 'C001' },
      { timestamp: '2024-01-05T10:00:00', result: 'success', student_name: '生徒5', cram_id: 'C001' },
      { timestamp: '2024-01-06T10:00:00', result: 'success', student_name: '生徒6', cram_id: 'C001' },
    ]);
    const res = getDashboardData();
    expect(res.success).toBe(true);
    expect(res.recentAccesses).toHaveLength(5);
  });

  test('ログが3件のみのとき3件すべて返す', () => {
    setupMockSS([
      { timestamp: '2024-01-01T10:00:00', result: 'success',        student_name: '生徒A' },
      { timestamp: '2024-01-02T10:00:00', result: 'success',        student_name: '生徒B' },
      { timestamp: '2024-01-03T10:00:00', result: '生徒未登録_1',   student_name: '' },
    ]);
    const res = getDashboardData();
    expect(res.success).toBe(true);
    expect(res.recentAccesses).toHaveLength(3);
  });

  test('タイムスタンプ降順で返す', () => {
    setupMockSS([
      { timestamp: '2024-01-03T10:00:00', result: 'success', student_name: '古い' },
      { timestamp: '2024-01-05T10:00:00', result: 'success', student_name: '最新' },
      { timestamp: '2024-01-04T10:00:00', result: 'success', student_name: '中間' },
    ]);
    const res = getDashboardData();
    expect(res.success).toBe(true);
    expect(res.recentAccesses[0].student_name).toBe('最新');
    expect(res.recentAccesses[1].student_name).toBe('中間');
    expect(res.recentAccesses[2].student_name).toBe('古い');
  });

  test('ログが0件のとき空配列を返す', () => {
    setupMockSS([]);
    const res = getDashboardData();
    expect(res.success).toBe(true);
    expect(res.recentAccesses).toEqual([]);
  });

  test('liff_access_log シートが存在しない場合も success:true で空配列を返す', () => {
    setupMockSS(null);
    const res = getDashboardData();
    expect(res.success).toBe(true);
    expect(res.recentAccesses).toEqual([]);
  });

  test('各行の全フィールドが返り値に含まれる', () => {
    setupMockSS([{
      timestamp:    '2024-01-01T10:00:00',
      line_user_id: 'Uabc123',
      result:       'success',
      student_id:   'S001',
      cram_id:      'C001',
      student_name: '山田太郎',
    }]);
    const res = getDashboardData();
    expect(res.success).toBe(true);
    const row = res.recentAccesses[0];
    expect(row.line_user_id).toBe('Uabc123');
    expect(row.result).toBe('success');
    expect(row.student_id).toBe('S001');
    expect(row.cram_id).toBe('C001');
    expect(row.student_name).toBe('山田太郎');
  });

  // ---- 認証エラー系 ----

  test('未登録メールアドレス → success:false', () => {
    const adminSheet = makeAdminUsersSheet([{ email: 'other@example.com', role: 'master', cram_id: '', is_active: true }]);
    global.SpreadsheetApp.getActiveSpreadsheet.mockReturnValue(
      makeFakeSS({ admin_users: adminSheet, audit_log: { appendRow: jest.fn() } })
    );
    global.Session.getActiveUser.mockReturnValue({ getEmail: () => 'unknown@example.com' });

    const res = getDashboardData();
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
  });

  test('is_active=false のユーザー → success:false', () => {
    setupMockSS([], { email: 'inactive@example.com', role: 'master', isActive: false });
    const res = getDashboardData();
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
