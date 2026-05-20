'use strict';
const { makeAdminUsersSheet, makeFakeSheet, makeFakeSS } = require('./helpers');

// getStudentList() のテスト
describe('getStudentList', () => {
  const STUDENT_HEADERS = [
    'student_id', 'name', 'pronunciation', 'cram_id',
    'school_name', 'school_course', 'sub_course', 'grade',
    'line_user_id', 'is_active',
  ];

  function makeStudentsSheet(students) {
    const rows = students.map(s => STUDENT_HEADERS.map(h => s[h] !== undefined ? s[h] : ''));
    return makeFakeSheet(STUDENT_HEADERS, rows);
  }

  function setupMockSS(students, role = 'master', email = 'master@example.com', cramId = 'C001') {
    const adminSheet   = makeAdminUsersSheet([{ email, role, cram_id: role === 'master' ? '' : cramId, is_active: true }]);
    const studentsSheet = makeStudentsSheet(students);

    // 子 SS（getChildSS が返す）
    const childSS = makeFakeSS({ students_master: studentsSheet });
    global.SpreadsheetApp.openById.mockReturnValue(childSS);

    // 親 SS（getActiveSpreadsheet が返す）
    const branchesSheet = makeFakeSheet(
      ['cram_id', 'branch_name', 'spreadsheet_id', 'is_active', 'created_at'],
      [[cramId, 'テスト校', 'dummy-ss-id', true, '']]
    );
    const parentSS = makeFakeSS({ admin_users: adminSheet, branches: branchesSheet, audit_log: { appendRow: jest.fn() } });
    global.SpreadsheetApp.getActiveSpreadsheet.mockReturnValue(parentSS);
    global.Session.getActiveUser.mockReturnValue({ getEmail: () => email });
  }

  test('students_master の内容をそのまま返す', () => {
    setupMockSS([
      { student_id: 'S001', name: '山田太郎', school_name: 'A高校', grade: '2', is_active: true, line_user_id: 'Uabc' },
      { student_id: 'S002', name: '佐藤花子', school_name: 'A高校', grade: '1', is_active: true, line_user_id: '' },
    ]);
    const result = getStudentList('C001');
    expect(result.success).toBe(true);
    expect(result.students).toHaveLength(2);
    expect(result.cramId).toBe('C001');
  });

  test('student_id が空の行はスキップ', () => {
    setupMockSS([
      { student_id: '',     name: '空行', school_name: 'A高校', grade: '1', is_active: true },
      { student_id: 'S001', name: '山田',  school_name: 'A高校', grade: '2', is_active: true },
    ]);
    const result = getStudentList('C001');
    expect(result.success).toBe(true);
    expect(result.students).toHaveLength(1);
  });

  test('is_active が文字列 "1" でも true になる', () => {
    setupMockSS([{ student_id: 'S001', name: '山田', school_name: 'A', grade: '1', is_active: '1' }]);
    const result = getStudentList('C001');
    expect(result.students[0].is_active).toBe(true);
  });

  test('is_active が false の生徒も返す（フィルターはフロントで行う）', () => {
    setupMockSS([
      { student_id: 'S001', name: '有効', school_name: 'A', grade: '1', is_active: true },
      { student_id: 'S002', name: '無効', school_name: 'A', grade: '2', is_active: false },
    ]);
    const result = getStudentList('C001');
    expect(result.students).toHaveLength(2);
    expect(result.students.find(s => s.student_id === 'S002').is_active).toBe(false);
  });

  test('cramId が空（校舎未選択）→ エラー', () => {
    // master で cramId 未指定
    const adminSheet = makeAdminUsersSheet([{ email: 'master@example.com', role: 'master', cram_id: '', is_active: true }]);
    const parentSS   = makeFakeSS({ admin_users: adminSheet });
    global.SpreadsheetApp.getActiveSpreadsheet.mockReturnValue(parentSS);
    global.Session.getActiveUser.mockReturnValue({ getEmail: () => 'master@example.com' });

    const result = getStudentList('');
    expect(result.success).toBe(false);
    expect(result.error).toContain('校舎を選択してください');
  });

  test('branch_admin は自身の cram_id を自動使用', () => {
    setupMockSS(
      [{ student_id: 'S001', name: '山田', school_name: 'A', grade: '1', is_active: true }],
      'branch_admin', 'branch@example.com', 'C001'
    );
    // branch_admin は targetCramId を渡さなくても自身の cram_id を使う
    const result = getStudentList('');
    expect(result.success).toBe(true);
    expect(result.cramId).toBe('C001');
  });

  test('students_master シートなし → エラー', () => {
    const adminSheet = makeAdminUsersSheet([{ email: 'master@example.com', role: 'master', cram_id: '', is_active: true }]);
    const branchesSheet = makeFakeSheet(
      ['cram_id', 'branch_name', 'spreadsheet_id', 'is_active', 'created_at'],
      [['C001', 'テスト校', 'dummy-ss-id', true, '']]
    );
    const childSS  = makeFakeSS({});  // students_master シートなし
    const parentSS = makeFakeSS({ admin_users: adminSheet, branches: branchesSheet });
    global.SpreadsheetApp.getActiveSpreadsheet.mockReturnValue(parentSS);
    global.SpreadsheetApp.openById.mockReturnValue(childSS);
    global.Session.getActiveUser.mockReturnValue({ getEmail: () => 'master@example.com' });

    const result = getStudentList('C001');
    expect(result.success).toBe(false);
    expect(result.error).toContain('students_master');
  });
});
