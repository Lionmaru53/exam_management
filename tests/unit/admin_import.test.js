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
    expect(students[0].name).toBe('佐藤 次郎');
    expect(students[0].pronunciation).toBe('さとう じろう');
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

  test('school_course と sub_course はオブジェクトに含まれない', () => {
    const rows = [['S001', '山田', '太郎', 'やまだ', 'たろう', 'A高校', '2']];
    const { students } = _mapRows(headers, rows, 'C001');
    expect(students[0]).not.toHaveProperty('school_course');
    expect(students[0]).not.toHaveProperty('sub_course');
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

  test('更新時に school_course と sub_course は既存値を保持する', () => {
    const existing = [{
      student_id: 'S001', name: '旧名前', pronunciation: '', cram_id: 'C001',
      school_name: 'A高校', school_course: '理系', sub_course: '理系', grade: '1',
      is_active: true,
    }];
    const { _sheet, ...fakeSS } = makeStudentsSS(existing);
    // school_course と sub_course を持たない student オブジェクト（_mapRows の新動作を模倣）
    const imported = [{
      student_id: 'S001', name: '新名前', pronunciation: '', cram_id: 'C001',
      school_name: 'B高校', grade: '2', is_active: true,
    }];
    _upsertStudentsMaster(fakeSS, imported);
    // getRange(2, 1, 1, ...) の呼び出し（行2=データ1行目の更新）を探す
    const callIdx = _sheet.getRange.mock.calls.findIndex(
      args => args[0] === 2 && args[1] === 1
    );
    expect(callIdx).toBeGreaterThanOrEqual(0);
    const setValuesSpy = _sheet.getRange.mock.results[callIdx].value.setValues;
    expect(setValuesSpy).toHaveBeenCalledTimes(1);
    const writtenRow = setValuesSpy.mock.calls[0][0][0]; // [[...row...]][0]
    const headerArr = STUDENTS_MASTER_HEADERS;
    expect(writtenRow[headerArr.indexOf('school_course')]).toBe('理系');
    expect(writtenRow[headerArr.indexOf('sub_course')]).toBe('理系');
  });

  test('インポートにない管理番号の is_active が false になる', () => {
    const existing = [
      { student_id: 'S001', name: '山田太郎', pronunciation: '', cram_id: 'C001',
        school_name: 'A高校', school_course: '', sub_course: '', grade: '1', is_active: true },
      { student_id: 'S002', name: '佐藤花子', pronunciation: '', cram_id: 'C001',
        school_name: 'B高校', school_course: '', sub_course: '', grade: '2', is_active: true },
    ];
    const { _sheet, ...fakeSS } = makeStudentsSS(existing);
    // S001 のみインポート（S002 は含まれない）
    const result = _upsertStudentsMaster(fakeSS, [
      { student_id: 'S001', name: '山田太郎', pronunciation: '', cram_id: 'C001',
        school_name: 'A高校', grade: '1', is_active: true },
    ]);
    expect(result.deactivated).toBe(1);
    expect(result.inactiveIds).toContain('S002');
  });

  test('全員インポートされた場合は deactivated が 0', () => {
    const existing = [
      { student_id: 'S001', name: '山田太郎', pronunciation: '', cram_id: 'C001',
        school_name: 'A高校', school_course: '', sub_course: '', grade: '1', is_active: true },
    ];
    const { _sheet, ...fakeSS } = makeStudentsSS(existing);
    const result = _upsertStudentsMaster(fakeSS, [
      { student_id: 'S001', name: '山田太郎', pronunciation: '', cram_id: 'C001',
        school_name: 'A高校', grade: '1', is_active: true },
    ]);
    expect(result.deactivated).toBe(0);
    expect(result.inactiveIds).toHaveLength(0);
  });

});

