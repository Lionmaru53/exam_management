'use strict';
const { makeFakeSheet, makeFakeSS } = require('./helpers');

describe('_mapRows', () => {
  const headers = ['管理番号', '姓', '名', '姓かな', '名かな', '学校', '学年'];

  test('正常な行を Student オブジェクトに変換', () => {
    const rows   = [['S001', '山田', '太郎', 'やまだ', 'たろう', 'A高校', '2']];
    const result = _mapRows(headers, rows, 'C001');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      student_id: 'S001',
      cram_id:    'C001',
      school_name: 'A高校',
      grade:      '2',
      is_active:  true,
    });
  });

  test('student_id（管理番号）が空の行はスキップ', () => {
    const rows   = [['', '山田', '太郎', '', '', '', ''], ['S002', '佐藤', '花子', '', '', '', '']];
    const result = _mapRows(headers, rows, 'C001');
    expect(result).toHaveLength(1);
    expect(result[0].student_id).toBe('S002');
  });

  test('姓+名 が結合されて name になる', () => {
    const rows   = [['S003', '佐藤', '次郎', 'さとう', 'じろう', '', '']];
    const result = _mapRows(headers, rows, 'C001');
    expect(result[0].name).toBe('佐藤次郎');
    expect(result[0].pronunciation).toBe('さとうじろう');
  });

  test('マッピング外の列は無視される', () => {
    const headersWithExtra = ['管理番号', '姓', '名', '未知列'];
    const rows = [['S004', '田中', '三郎', 'XXX']];
    const result = _mapRows(headersWithExtra, rows, 'C001');
    expect(result[0].student_id).toBe('S004');
    expect(result[0]).not.toHaveProperty('未知列');
  });

  test('全行が空の場合は空配列', () => {
    const rows = [['', '', '', '', '', '', ''], ['', '', '', '', '', '', '']];
    expect(_mapRows(headers, rows, 'C001')).toEqual([]);
  });
});

describe('_upsertStudentsMaster', () => {
  function makeStudentsSS(existingStudents) {
    const headers  = STUDENTS_MASTER_HEADERS;
    const dataRows = existingStudents.map(s => headers.map(h => s[h] || ''));
    const sheet    = makeFakeSheet(headers, dataRows);
    // getSheetByName は students_master を返す
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
    expect(_sheet.appendRow).not.toHaveBeenCalled(); // appendRow は直接呼ばれない（getRange で書き込み）
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

    // setValues の呼び出しを追跡して line_user_id を確認
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
      line_user_id: '',  // インポートデータには line_user_id なし
      is_active: true,
    }];
    _upsertStudentsMaster(fakeSS, imported);

    // 保存されたデータの line_user_id 列に既存 ID が保持されていること
    const lineIdIdx = STUDENTS_MASTER_HEADERS.indexOf('line_user_id');
    const savedRow  = capturedRows[0]?.[0];
    if (savedRow) {
      expect(savedRow[lineIdIdx]).toBe(existingLineId);
    }
  });
});
