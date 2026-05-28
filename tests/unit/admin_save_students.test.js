'use strict';
const { makeAdminUsersSheet, makeFakeSheet, makeBranchesSheet, makeFakeSS } = require('./helpers');

const STUDENT_HEADERS = [
  'student_id', 'name', 'school_name', 'school_course', 'sub_course', 'grade', 'is_active',
];

function makeStudentsSheet(students) {
  const rows = students.map(s => STUDENT_HEADERS.map(h => s[h] !== undefined ? s[h] : ''));
  return makeFakeSheet(STUDENT_HEADERS, rows);
}

function setupSS({ students = [], role = 'master', cramId = 'C001', childSheets = {} } = {}) {
  const email = role === 'master' ? 'master@example.com' : 'branch@example.com';
  const adminSheet  = makeAdminUsersSheet([{ email, role, cram_id: role === 'master' ? '' : cramId, is_active: true }]);
  const branchSheet = makeBranchesSheet([{ cram_id: cramId, branch_name: 'テスト校', spreadsheet_id: 'child-ss-id', is_active: true }]);
  const parentSS = makeFakeSS({
    admin_users: adminSheet,
    branches:    branchSheet,
    audit_log:   { appendRow: jest.fn() },
  });
  const studentsSheet = makeStudentsSheet(students);
  const childSS = makeFakeSS({ students_master: studentsSheet, ...childSheets });

  global.SpreadsheetApp.getActiveSpreadsheet.mockReturnValue(parentSS);
  global.SpreadsheetApp.openById.mockReturnValue(childSS);
  global.Session.getActiveUser.mockReturnValue({ getEmail: () => email });

  return { parentSS, childSS, studentsSheet };
}

// ---- updateStudentField ----

describe('updateStudentField', () => {
  test('branch_admin が担当外校舎を操作 → 権限エラー', () => {
    setupSS({ role: 'branch_admin', cramId: 'C001' });
    const result = updateStudentField('C999', ['S001'], 'school_course', '理系');
    expect(result.success).toBe(false);
    expect(result.error).toContain('権限がありません');
  });

  test('無効なフィールド名 → エラー', () => {
    setupSS();
    const result = updateStudentField('C001', ['S001'], 'invalid_field', '値');
    expect(result.success).toBe(false);
    expect(result.error).toContain('無効なフィールドです');
  });

  test('studentIds が空配列 → エラー', () => {
    setupSS();
    const result = updateStudentField('C001', [], 'school_course', '理系');
    expect(result.success).toBe(false);
    expect(result.error).toContain('生徒が選択されていません');
  });

  test('students_master シートなし → エラー', () => {
    const email = 'master@example.com';
    const adminSheet  = makeAdminUsersSheet([{ email, role: 'master', cram_id: '', is_active: true }]);
    const branchSheet = makeBranchesSheet([{ cram_id: 'C001', spreadsheet_id: 'child-ss-id', is_active: true }]);
    global.SpreadsheetApp.getActiveSpreadsheet.mockReturnValue(
      makeFakeSS({ admin_users: adminSheet, branches: branchSheet, audit_log: { appendRow: jest.fn() } })
    );
    global.SpreadsheetApp.openById.mockReturnValue(makeFakeSS({}));
    global.Session.getActiveUser.mockReturnValue({ getEmail: () => email });

    const result = updateStudentField('C001', ['S001'], 'school_course', '理系');
    expect(result.success).toBe(false);
    expect(result.error).toContain('students_master');
  });

  test('正常: school_course を更新 → success:true, updated:1', () => {
    setupSS({
      students: [{ student_id: 'S001', school_name: 'A高校', school_course: '普通', is_active: true }],
    });
    const result = updateStudentField('C001', ['S001'], 'school_course', '理系');
    expect(result.success).toBe(true);
    expect(result.updated).toBe(1);
  });

  test('正常: sub_course を更新 → success:true, updated:1', () => {
    setupSS({
      students: [{ student_id: 'S001', school_name: 'A高校', school_course: '理系', sub_course: '', is_active: true }],
    });
    const result = updateStudentField('C001', ['S001'], 'sub_course', '文系');
    expect(result.success).toBe(true);
    expect(result.updated).toBe(1);
  });

  test('studentIds に含まれない生徒は updated カウントに含まれない', () => {
    setupSS({
      students: [
        { student_id: 'S001', school_course: '文系', is_active: true },
        { student_id: 'S002', school_course: '文系', is_active: true },
      ],
    });
    const result = updateStudentField('C001', ['S001'], 'school_course', '理系');
    expect(result.success).toBe(true);
    expect(result.updated).toBe(1);
  });

  test('branch_admin が自分の担当校舎を操作 → 成功', () => {
    setupSS({
      role: 'branch_admin', cramId: 'C001',
      students: [{ student_id: 'S001', school_course: '文系', is_active: true }],
    });
    const result = updateStudentField('C001', ['S001'], 'school_course', '理系');
    expect(result.success).toBe(true);
  });
});

// ---- deleteCourseFromMaster ----

describe('deleteCourseFromMaster', () => {
  test('使用中の有効生徒がいる → エラー', () => {
    const scmSheet = makeFakeSheet(['school_name', 'school_course'], [['A高校', '理系']]);
    const { childSS } = setupSS({
      students: [{ student_id: 'S001', school_name: 'A高校', school_course: '理系', is_active: true }],
      childSheets: { school_course_master: scmSheet },
    });
    const result = deleteCourseFromMaster('C001', 'A高校', '理系');
    expect(result.success).toBe(false);
    expect(result.error).toContain('使用中');
  });

  test('school_course_master シートなし → エラー', () => {
    setupSS({ students: [] });
    const result = deleteCourseFromMaster('C001', 'A高校', '理系');
    expect(result.success).toBe(false);
    expect(result.error).toContain('school_course_master');
  });

  test('コースが見つからない → エラー', () => {
    const scmSheet = makeFakeSheet(['school_name', 'school_course'], [['A高校', '文系']]);
    setupSS({ students: [], childSheets: { school_course_master: scmSheet } });
    const result = deleteCourseFromMaster('C001', 'A高校', '理系');
    expect(result.success).toBe(false);
    expect(result.error).toContain('見つかりませんでした');
  });

  test('コース名が空 → エラー', () => {
    setupSS({ students: [] });
    const result = deleteCourseFromMaster('C001', 'A高校', '');
    expect(result.success).toBe(false);
  });

  test('正常削除 → success:true, deleteRow が呼ばれる', () => {
    const scmSheet = makeFakeSheet(['school_name', 'school_course'], [['A高校', '理系']]);
    setupSS({ students: [], childSheets: { school_course_master: scmSheet } });

    const result = deleteCourseFromMaster('C001', 'A高校', '理系');
    expect(result.success).toBe(true);
    expect(scmSheet.deleteRow).toHaveBeenCalledWith(2);
  });

  test('is_active=false の生徒は使用中とみなさない → 削除できる', () => {
    const scmSheet = makeFakeSheet(['school_name', 'school_course'], [['A高校', '理系']]);
    setupSS({
      students: [{ student_id: 'S001', school_name: 'A高校', school_course: '理系', is_active: false }],
      childSheets: { school_course_master: scmSheet },
    });
    const result = deleteCourseFromMaster('C001', 'A高校', '理系');
    expect(result.success).toBe(true);
  });
});

// ---- addCourseToMaster ----

describe('addCourseToMaster', () => {
  test('空のコース名 → エラー', () => {
    setupSS();
    const result = addCourseToMaster('C001', 'A高校', '');
    expect(result.success).toBe(false);
    expect(result.error).toContain('値を入力してください');
  });

  test('スペースのみのコース名 → エラー', () => {
    setupSS();
    const result = addCourseToMaster('C001', 'A高校', '   ');
    expect(result.success).toBe(false);
  });

  test('branch_admin が担当外校舎へ追加 → 権限エラー', () => {
    setupSS({ role: 'branch_admin', cramId: 'C001' });
    const result = addCourseToMaster('C999', 'A高校', '理系');
    expect(result.success).toBe(false);
    expect(result.error).toContain('権限がありません');
  });

  test('正常追加 → success:true', () => {
    const scmHeaders = ['school_name', 'school_course'];
    const scmSheet   = makeFakeSheet(scmHeaders, []);
    setupSS({ childSheets: { school_course_master: scmSheet, exam_patterns: makeFakeSheet(['pattern_id', 'school_name', 'school_course', 'grade', 'sub_course'], []) } });
    const result = addCourseToMaster('C001', 'A高校', '理系');
    expect(result.success).toBe(true);
  });
});

// ---- _deleteOrphanedCourses ----

describe('_deleteOrphanedCourses', () => {
  const EP_HEADERS  = ['pattern_id', 'school_name', 'school_course', 'grade', 'sub_course'];
  const PS_HEADERS  = ['pattern_id', 'subject_id'];
  const SCM_HEADERS = ['school_name', 'school_course'];
  const SEP_HEADERS = ['school_name', 'school_course', 'term_test_id', 'year', 'start_date', 'end_date'];

  function makeSS({ students = [], patterns = [], subjects = [], courses = [], periods = [] } = {}) {
    return makeFakeSS({
      students_master:      makeFakeSheet(STUDENT_HEADERS, students.map(s => STUDENT_HEADERS.map(h => s[h] !== undefined ? s[h] : ''))),
      exam_patterns:        makeFakeSheet(EP_HEADERS,  patterns.map(p => EP_HEADERS.map(h => p[h] || ''))),
      pattern_subjects:     makeFakeSheet(PS_HEADERS,  subjects.map(s => [s.pattern_id, s.subject_id])),
      school_course_master: makeFakeSheet(SCM_HEADERS, courses.map(c => [c.school_name, c.school_course])),
      school_exam_periods:  makeFakeSheet(SEP_HEADERS, periods.map(p => SEP_HEADERS.map(h => p[h] || ''))),
    });
  }

  test('アクティブ生徒が残っている → 削除しない (deleted: 0)', () => {
    const ss = makeSS({
      students: [{ student_id: 'S001', school_name: 'A高校', school_course: '理系', is_active: true }],
      courses:  [{ school_name: 'A高校', school_course: '理系' }],
    });
    const result = _deleteOrphanedCourses(ss, [{ school_name: 'A高校', school_course: '理系' }]);
    expect(result.deleted).toBe(0);
  });

  test('在籍0人 → 関連シートから全削除 (deleted: 1)', () => {
    const ss = makeSS({
      students: [],
      patterns: [{ pattern_id: 'P001', school_name: 'A高校', school_course: '理系', grade: '高1', sub_course: '' }],
      subjects: [{ pattern_id: 'P001', subject_id: 'SUB1' }],
      courses:  [{ school_name: 'A高校', school_course: '理系' }],
      periods:  [{ school_name: 'A高校', school_course: '理系', term_test_id: 'T1', year: '2024' }],
    });
    const result = _deleteOrphanedCourses(ss, [{ school_name: 'A高校', school_course: '理系' }]);
    expect(result.deleted).toBe(1);
    expect(ss.getSheetByName('exam_patterns').deleteRow).toHaveBeenCalled();
    expect(ss.getSheetByName('pattern_subjects').deleteRow).toHaveBeenCalled();
    expect(ss.getSheetByName('school_course_master').deleteRow).toHaveBeenCalled();
    expect(ss.getSheetByName('school_exam_periods').deleteRow).toHaveBeenCalled();
  });

  test('重複ペアは1回だけ処理する (deleted: 1)', () => {
    const ss = makeSS({
      students: [],
      courses:  [{ school_name: 'A高校', school_course: '理系' }],
    });
    const pairs = [
      { school_name: 'A高校', school_course: '理系' },
      { school_name: 'A高校', school_course: '理系' },
    ];
    const result = _deleteOrphanedCourses(ss, pairs);
    expect(result.deleted).toBe(1);
  });

  test('students_master シートなし → deleted: 0 で安全終了', () => {
    const ss = makeFakeSS({});
    const result = _deleteOrphanedCourses(ss, [{ school_name: 'A高校', school_course: '理系' }]);
    expect(result.deleted).toBe(0);
  });

  test('複数の孤立コースをまとめて削除', () => {
    const ss = makeSS({
      students: [],
      courses:  [
        { school_name: 'A高校', school_course: '文系' },
        { school_name: 'A高校', school_course: '理系' },
      ],
    });
    const result = _deleteOrphanedCourses(ss, [
      { school_name: 'A高校', school_course: '文系' },
      { school_name: 'A高校', school_course: '理系' },
    ]);
    expect(result.deleted).toBe(2);
  });
});
