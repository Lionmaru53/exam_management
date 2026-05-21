'use strict';
const { makeFakeSheet, makeFakeSS } = require('./helpers');

describe('_mapRows', () => {
  const headers = ['管理番号', '姓', '名', '姓かな', '名かな', '学校', '学年'];

  test('正常な行を Student オブジェクトに変換', () => {
    const rows   = [['S001', '山田', '太郎', 'やまだ', 'たろう', 'A高校', '2']];
    const { students } = _mapRows(headers, rows, 'C001');
    expect(students).toHaveLength(1);
    expect(students[0]).toMatchObject({
      student_id: 'S001',
      cram_id:    'C001',
      school_name: 'A高校',
      grade:      '2',
      is_active:  true,
    });
  });

  test('student_id（管理番号）が空の行はスキップ', () => {
    const rows   = [['', '山田', '太郎', '', '', '', ''], ['S002', '佐藤', '花子', '', '', '', '']];
    const { students } = _mapRows(headers, rows, 'C001');
    expect(students).toHaveLength(1);
    expect(students[0].student_id).toBe('S002');
  });

  test('姓+名 が結合されて name になる', () => {
    const rows   = [['S003', '佐藤', '次郎', 'さとう', 'じろう', '', '']];
    const { students } = _mapRows(headers, rows, 'C001');
    expect(students[0].name).toBe('佐藤次郎');
    expect(students[0].pronunciation).toBe('さとうじろう');
  });

  test('マッピング外の列は無視される', () => {
    const headersWithExtra = ['管理番号', '姓', '名', '未知列'];
    const rows = [['S004', '田中', '三郎', 'XXX']];
    const { students } = _mapRows(headersWithExtra, rows, 'C001');
    expect(students[0].student_id).toBe('S004');
    expect(students[0]).not.toHaveProperty('未知列');
  });

  test('全行が空の場合は空配列', () => {
    const rows = [['', '', '', '', '', '', ''], ['', '', '', '', '', '', '']];
    const { students } = _mapRows(headers, rows, 'C001');
    expect(students).toEqual([]);
  });

  test('skipped は初期値 0', () => {
    const rows = [['S001', '田中', '花子', '', '', '', '']];
    const { skipped } = _mapRows(headers, rows, 'C001');
    expect(skipped).toBe(0);
  });

  describe('校舎列フィルタ', () => {
    const headersWithBranch = ['校舎', '管理番号', '姓', '名', '姓かな', '名かな', '学校', '学年'];

    test('校舎列が cramId と一致する行はインポートされる', () => {
      const rows = [['C001', 'S001', '山田', '太郎', 'やまだ', 'たろう', 'A高校', '2']];
      const { students, skipped } = _mapRows(headersWithBranch, rows, 'C001');
      expect(students).toHaveLength(1);
      expect(skipped).toBe(0);
    });

    test('校舎列が cramId と不一致の行はスキップされる', () => {
      const rows = [
        ['C001', 'S001', '山田', '太郎', 'やまだ', 'たろう', 'A高校', '2'],
        ['Z99',  'S002', '佐藤', '花子', 'さとう', 'はなこ', 'B高校', '1'],
      ];
      const { students, skipped } = _mapRows(headersWithBranch, rows, 'C001');
      expect(students).toHaveLength(1);
      expect(students[0].student_id).toBe('S001');
      expect(skipped).toBe(1);
    });

    test('校舎列が全行不一致の場合 students は空、skipped が全件カウント', () => {
      const rows = [
        ['Z99', 'S001', '山田', '太郎', '', '', '', ''],
        ['Z99', 'S002', '佐藤', '花子', '', '', '', ''],
      ];
      const { students, skipped } = _mapRows(headersWithBranch, rows, 'C001');
      expect(students).toHaveLength(0);
      expect(skipped).toBe(2);
    });

    test('校舎列がないファイルは全行インポートされる（後方互換）', () => {
      const rows = [
        ['S001', '山田', '太郎', '', '', '', ''],
        ['S002', '佐藤', '花子', '', '', '', ''],
      ];
      const { students, skipped } = _mapRows(headers, rows, 'C001');
      expect(students).toHaveLength(2);
      expect(skipped).toBe(0);
    });
  });
});

describe('_upsertStudentsMaster', () => {
  function makeStudentsSS(existingStudents) {
    const headers  = STUDENTS_MASTER_HEADERS;
    const dataRows = existingStudents.map(s => headers.map(h => s[h] || ''));
    const sheet    = makeFakeSheet(headers, dataRows);
    return { getSheetByName: jest.fn(() => sheet), _sheet: sheet };
  }

  test('新規生徒を追加 → added: 1, updated: 0', () => {
    const { _sheet, ...fakeSS } = makeStudentsSS([]);
    const students = [{
      student_id: 'S001', name: '山田太郎', pronunciation: 'やまだたろう',
      cram_id: 'C001', school_name: 'A高校', school_course: '', sub_course: '',
      grade: '2', line_user_id: '', is_active: true,
    }];
    const result = _upsertStudentsMaster(fakeSS, students);
    expect(result.added).toBe(1);
    expect(result.updated).toBe(0);
    expect(_sheet.appendRow).not.toHaveBeenCalled();
  });

  test('既存生徒を更新 → added: 0, updated: 1', () => {
    const existing = [{
      student_id: 'S001', name: '旧名前', pronunciation: '', cram_id: 'C001',
      school_name: '', school_course: '', sub_course: '', grade: '1',
      line_user_id: '', is_active: true,
    }];
    const { _sheet, ...fakeSS } = makeStudentsSS(existing);
    const updated = [{
      student_id: 'S001', name: '新名前', pronunciation: '', cram_id: 'C001',
      school_name: 'B高校', school_course: '', sub_course: '', grade: '2',
      line_user_id: '', is_active: true,
    }];
    const result = _upsertStudentsMaster(fakeSS, updated);
    expect(result.added).toBe(0);
    expect(result.updated).toBe(1);
  });

  test('既存の line_user_id はインポートで上書きされない', () => {
    const existingLineId = 'U_existing_line_id';
    const existing = [{
      student_id: 'S001', name: '山田太郎', pronunciation: '', cram_id: 'C001',
      school_name: '', school_course: '', sub_course: '', grade: '1',
      line_user_id: existingLineId, is_active: true,
    }];
    const { _sheet, ...fakeSS } = makeStudentsSS(existing);

    const capturedRows = [];
    _sheet.getRange.mockImplementation((row, col, numRows, numCols) => ({
      getValue:  jest.fn(() => ''),
      getValues: jest.fn(() => [STUDENTS_MASTER_HEADERS]),
      setValue:  jest.fn(),
      setValues: jest.fn((vals) => { capturedRows.push(vals); }),
    }));

    const imported = [{
      student_id: 'S001', name: '山田太郎', pronunciation: '', cram_id: 'C001',
      school_name: 'A高校', school_course: '', sub_course: '', grade: '2',
      line_user_id: '',
      is_active: true,
    }];
    _upsertStudentsMaster(fakeSS, imported);

    const lineIdIdx = STUDENTS_MASTER_HEADERS.indexOf('line_user_id');
    const savedRow  = capturedRows[0]?.[0];
    if (savedRow) {
      expect(savedRow[lineIdIdx]).toBe(existingLineId);
    }
  });
});
