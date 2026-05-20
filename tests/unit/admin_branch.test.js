'use strict';
const { makeAdminUsersSheet, makeBranchesSheet, makeFakeSS } = require('./helpers');

// addBranch() / updateBranch() のテスト
// getAdminContext() が内部で呼ばれるため、Session モックが必要
// → Jest で初めてテスト可能になった関数群

function setupMockSS(branches, role = 'master', email = 'master@example.com') {
  const adminSheet  = makeAdminUsersSheet([{ email, role, cram_id: role === 'master' ? '' : 'C001', is_active: true }]);
  const branchSheet = makeBranchesSheet(branches);
  const mockSS = makeFakeSS({ admin_users: adminSheet, branches: branchSheet, audit_log: { appendRow: jest.fn() } });
  global.SpreadsheetApp.getActiveSpreadsheet.mockReturnValue(mockSS);
  global.Session.getActiveUser.mockReturnValue({ getEmail: () => email });
  return { mockSS, branchSheet };
}

describe('addBranch', () => {
  test('新規校舎を追加 → success, appendRow が呼ばれる', () => {
    const { branchSheet } = setupMockSS([{ cram_id: 'C001', branch_name: '渋谷校' }]);
    const result = addBranch({ cram_id: 'C002', branch_name: '新宿校' });
    expect(result.success).toBe(true);
    expect(branchSheet.appendRow).toHaveBeenCalledWith(
      expect.arrayContaining(['C002', '新宿校'])
    );
  });

  test('重複した cram_id → エラー', () => {
    setupMockSS([{ cram_id: 'C001', branch_name: '渋谷校' }]);
    const result = addBranch({ cram_id: 'C001', branch_name: '別名' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('既に登録されています');
  });

  test('cram_id が空 → エラー', () => {
    setupMockSS([]);
    const result = addBranch({ cram_id: '', branch_name: 'テスト校' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('cram_id を入力してください');
  });

  test('cram_id がスペースのみ → エラー（trim 後に空になる）', () => {
    setupMockSS([]);
    const result = addBranch({ cram_id: '   ', branch_name: 'テスト校' });
    expect(result.success).toBe(false);
  });

  test('branch_admin 権限 → "権限がありません" エラー', () => {
    setupMockSS([], 'branch_admin', 'branch@example.com');
    const result = addBranch({ cram_id: 'C003', branch_name: 'テスト校' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('権限がありません');
  });
});

describe('updateBranch', () => {
  test('校舎名を更新 → success, setValue が呼ばれる', () => {
    const { branchSheet } = setupMockSS([{ cram_id: 'C001', branch_name: '旧名' }]);
    const result = updateBranch({ cram_id: 'C001', branch_name: '新名' });
    expect(result.success).toBe(true);
    expect(branchSheet.getRange).toHaveBeenCalled();
  });

  test('存在しない cram_id → エラー', () => {
    setupMockSS([{ cram_id: 'C001', branch_name: '渋谷校' }]);
    const result = updateBranch({ cram_id: 'C999', branch_name: '新名' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('C999');
  });

  test('branch_admin 権限 → "権限がありません" エラー', () => {
    setupMockSS([{ cram_id: 'C001', branch_name: '渋谷校' }], 'branch_admin', 'branch@example.com');
    const result = updateBranch({ cram_id: 'C001', branch_name: '新名' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('権限がありません');
  });
});
