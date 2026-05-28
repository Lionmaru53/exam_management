'use strict';
const { makeAdminUsersSheet, makeFakeSheet, makeBranchesSheet, makeFakeSS } = require('./helpers');

// childSS を openById が返すようにセットアップするヘルパー
function setupChildSS(childSheets = {}) {
  const branchSheet = makeBranchesSheet([{
    cram_id: 'C001', branch_name: 'テスト校', spreadsheet_id: 'child-ss-id', is_active: true,
  }]);
  const adminSheet = makeAdminUsersSheet([{
    email: 'master@example.com', role: 'master', cram_id: '', is_active: true,
  }]);
  const parentSS = makeFakeSS({
    admin_users: adminSheet,
    branches:    branchSheet,
    audit_log:   { appendRow: jest.fn() },
  });
  const childSS = makeFakeSS(childSheets);

  global.SpreadsheetApp.getActiveSpreadsheet.mockReturnValue(parentSS);
  global.SpreadsheetApp.openById.mockReturnValue(childSS);
  global.Session.getActiveUser.mockReturnValue({ getEmail: () => 'master@example.com' });

  return { parentSS, childSS };
}

// ---- addNewPattern ----

describe('addNewPattern', () => {
  const PAT_HEADERS = ['pattern_id', 'school_name', 'school_course', 'grade', 'sub_course'];

  test('school_course が空 → エラー', () => {
    const patSheet = makeFakeSheet(PAT_HEADERS, []);
    setupChildSS({ exam_patterns: patSheet });
    const result = addNewPattern('C001', { school_name: 'A高校', school_course: '', grade: '高1', sub_course: '' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('コース名は必須');
  });

  test('重複パターン → エラー', () => {
    const patSheet = makeFakeSheet(
      PAT_HEADERS,
      [['P001', 'A高校', '理系', '高1', '']]
    );
    setupChildSS({ exam_patterns: patSheet });
    const result = addNewPattern('C001', { school_name: 'A高校', school_course: '理系', grade: '高1', sub_course: '' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('既に登録済み');
  });

  test('正常追加 → success:true, pattern_id が返る', () => {
    const patSheet = makeFakeSheet(PAT_HEADERS, []);
    setupChildSS({ exam_patterns: patSheet });
    const result = addNewPattern('C001', { school_name: 'A高校', school_course: '理系', grade: '高1', sub_course: '' });
    expect(result.success).toBe(true);
    expect(typeof result.pattern_id).toBe('string');
    expect(result.pattern_id.startsWith('P')).toBe(true);
    expect(patSheet.appendRow).toHaveBeenCalled();
  });

  test('"理系コース" は "理系" に正規化して重複チェック', () => {
    const patSheet = makeFakeSheet(PAT_HEADERS, [['P001', 'A高校', '理系', '高1', '']]);
    setupChildSS({ exam_patterns: patSheet });
    const result = addNewPattern('C001', { school_name: 'A高校', school_course: '理系コース', grade: '高1', sub_course: '' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('既に登録済み');
  });

  test('cramId が空 → エラー', () => {
    setupChildSS({});
    const result = addNewPattern('', { school_name: 'A高校', school_course: '理系', grade: '高1', sub_course: '' });
    expect(result.success).toBe(false);
  });
});

// ---- addNewSubject ----

describe('addNewSubject', () => {
  const SUB_HEADERS = ['subject_id', 'subject_name', 'genre_id', 'grade', 'note'];
  const GNR_HEADERS = ['genre_id', 'genre_name'];

  test('subjects_master シートなし → エラー', () => {
    global.SpreadsheetApp.getActiveSpreadsheet.mockReturnValue(makeFakeSS({}));
    const result = addNewSubject('P001', '数学', '');
    expect(result.success).toBe(false);
    expect(result.error).toContain('subjects_master');
  });

  test('正常追加 → success:true, subject_id が返る', () => {
    const subSheet = makeFakeSheet(SUB_HEADERS, []);
    const gnrSheet = makeFakeSheet(GNR_HEADERS, [['G001', '数学']]);
    global.SpreadsheetApp.getActiveSpreadsheet.mockReturnValue(
      makeFakeSS({ subjects_master: subSheet, genres_master: gnrSheet })
    );
    const result = addNewSubject('P001', '数学I', '数学');
    expect(result.success).toBe(true);
    expect(typeof result.subject_id).toBe('string');
    expect(result.subject_id.startsWith('S')).toBe(true);
    expect(subSheet.appendRow).toHaveBeenCalledWith(
      expect.arrayContaining(['数学I', 'G001'])
    );
  });

  test('genres_master になければ genre_id は空文字', () => {
    const subSheet = makeFakeSheet(SUB_HEADERS, []);
    const gnrSheet = makeFakeSheet(GNR_HEADERS, []);
    global.SpreadsheetApp.getActiveSpreadsheet.mockReturnValue(
      makeFakeSS({ subjects_master: subSheet, genres_master: gnrSheet })
    );
    const result = addNewSubject('P001', '独自科目', '未知ジャンル');
    expect(result.success).toBe(true);
    expect(subSheet.appendRow).toHaveBeenCalledWith(
      expect.arrayContaining(['独自科目', ''])
    );
  });
});

// ---- saveSchoolExamPeriod ----

describe('saveSchoolExamPeriod', () => {
  const SEP_HEADERS = [
    'school_name', 'school_course', 'grade', 'sub_course',
    'term_test_id', 'year', 'start_date', 'end_date',
  ];

  test('必須パラメータが不足 → エラー', () => {
    const sepSheet = makeFakeSheet(SEP_HEADERS, []);
    setupChildSS({ school_exam_periods: sepSheet });
    const result = saveSchoolExamPeriod('C001', { schoolName: 'A高校', termTestId: '', year: '2024' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('必須パラメータ');
  });

  test('school_exam_periods シートなし → エラー', () => {
    setupChildSS({});
    const result = saveSchoolExamPeriod('C001', { schoolName: 'A高校', termTestId: 'T1', year: '2024' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('school_exam_periods');
  });

  test('startDate/endDate あり → 行削除 + appendRow', () => {
    const existing = [['A高校', '', '', '', 'T1', 2024, '2024-01-10', '2024-01-15']];
    const sepSheet = makeFakeSheet(SEP_HEADERS, existing);
    setupChildSS({ school_exam_periods: sepSheet });
    const result = saveSchoolExamPeriod('C001', {
      schoolName: 'A高校', termTestId: 'T1', year: '2024',
      startDate: '2024-01-10', endDate: '2024-01-16',
    });
    expect(result.success).toBe(true);
    expect(sepSheet.deleteRow).toHaveBeenCalled();
    expect(sepSheet.appendRow).toHaveBeenCalled();
  });

  test('startDate/endDate なし → 行削除のみ (appendRow は呼ばれない)', () => {
    const existing = [['A高校', '', '', '', 'T1', 2024, '2024-01-10', '2024-01-15']];
    const sepSheet = makeFakeSheet(SEP_HEADERS, existing);
    setupChildSS({ school_exam_periods: sepSheet });
    const result = saveSchoolExamPeriod('C001', {
      schoolName: 'A高校', termTestId: 'T1', year: '2024',
      startDate: '', endDate: '',
    });
    expect(result.success).toBe(true);
    expect(sepSheet.deleteRow).toHaveBeenCalled();
    expect(sepSheet.appendRow).not.toHaveBeenCalled();
  });
});
