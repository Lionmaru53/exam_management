'use strict';
const { makeFakeSheet } = require('./helpers');

describe('getRowsData', () => {
  test('sheet が null → 空配列', () => {
    expect(getRowsData(null)).toEqual([]);
  });

  test('sheet が undefined → 空配列', () => {
    expect(getRowsData(undefined)).toEqual([]);
  });

  test('ヘッダー行のみ → 空配列', () => {
    const sheet = makeFakeSheet(['name', 'email'], []);
    expect(getRowsData(sheet)).toEqual([]);
  });

  test('正常データ → オブジェクト配列に変換', () => {
    const sheet = makeFakeSheet(
      ['name', 'email'],
      [['山田太郎', 'yamada@test.com'], ['佐藤花子', 'sato@test.com']]
    );
    const result = getRowsData(sheet);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: '山田太郎', email: 'yamada@test.com' });
    expect(result[1]).toEqual({ name: '佐藤花子', email: 'sato@test.com' });
  });

  test('数値セルは文字列に変換', () => {
    const sheet = makeFakeSheet(
      ['id', 'score'],
      [[1, 95]]
    );
    const result = getRowsData(sheet);
    expect(result[0].id).toBe('1');
    expect(result[0].score).toBe('95');
  });

  test('空のヘッダー列はスキップ', () => {
    const sheet = makeFakeSheet(
      ['name', '', 'email'],
      [['山田', '', 'y@test.com']]
    );
    const result = getRowsData(sheet);
    expect(Object.keys(result[0])).toEqual(['name', 'email']);
  });
});
