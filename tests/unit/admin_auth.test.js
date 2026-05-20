'use strict';
const { makeAdminUsersSheet, makeFakeSS } = require('./helpers');

// getAdminContext() のテスト
// 従来の GAS テストでは Session.getActiveUser() がモック不可のため未テストだった
describe('getAdminContext', () => {
  let adminSheet, mockSS;

  beforeEach(() => {
    adminSheet = makeAdminUsersSheet([
      { email: 'master@example.com',   role: 'master',       cram_id: '',     is_active: true  },
      { email: 'branch1@example.com',  role: 'branch_admin', cram_id: 'C001', is_active: true  },
      { email: 'inactive@example.com', role: 'branch_admin', cram_id: 'C001', is_active: false },
    ]);
    mockSS = makeFakeSS({
      admin_users: adminSheet,
      audit_log:   { appendRow: jest.fn(), getSheetByName: jest.fn() },
    });
    global.SpreadsheetApp.getActiveSpreadsheet.mockReturnValue(mockSS);
  });

  test('master メールで認証 → role が master', () => {
    global.Session.getActiveUser.mockReturnValue({ getEmail: () => 'master@example.com' });
    const ctx = getAdminContext();
    expect(ctx.role).toBe('master');
    expect(ctx.email).toBe('master@example.com');
    expect(ctx.cram_id).toBe('');
  });

  test('branch_admin メールで認証 → role と cram_id が返る', () => {
    global.Session.getActiveUser.mockReturnValue({ getEmail: () => 'branch1@example.com' });
    const ctx = getAdminContext();
    expect(ctx.role).toBe('branch_admin');
    expect(ctx.cram_id).toBe('C001');
  });

  test('メールの大文字/小文字は区別しない', () => {
    global.Session.getActiveUser.mockReturnValue({ getEmail: () => 'MASTER@EXAMPLE.COM' });
    const ctx = getAdminContext();
    expect(ctx.role).toBe('master');
  });

  test('未登録メール → "アクセス権限がありません" エラー', () => {
    global.Session.getActiveUser.mockReturnValue({ getEmail: () => 'unknown@example.com' });
    expect(() => getAdminContext()).toThrow('アクセス権限がありません');
  });

  test('inactive ユーザー → "アクセス権限がありません" エラー', () => {
    global.Session.getActiveUser.mockReturnValue({ getEmail: () => 'inactive@example.com' });
    expect(() => getAdminContext()).toThrow('アクセス権限がありません');
  });

  test('email が空文字 → エラー', () => {
    global.Session.getActiveUser.mockReturnValue({ getEmail: () => '' });
    expect(() => getAdminContext()).toThrow();
  });

  test('admin_users シートが存在しない → エラー', () => {
    global.Session.getActiveUser.mockReturnValue({ getEmail: () => 'master@example.com' });
    global.SpreadsheetApp.getActiveSpreadsheet.mockReturnValue(makeFakeSS({}));
    expect(() => getAdminContext()).toThrow('admin_users シートが見つかりません');
  });
});
