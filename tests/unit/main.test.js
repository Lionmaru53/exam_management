'use strict';

describe('_verifyLineIdToken', () => {
  const VALID_USER_ID  = 'U1234567890abcdef';
  const VALID_CHANNEL  = '1111111111';
  const OTHER_CHANNEL  = '2222222222';
  const CHANNEL_IDS    = JSON.stringify([VALID_CHANNEL, OTHER_CHANNEL]);

  function mockProps(channelIdsJson) {
    global.PropertiesService = {
      getScriptProperties: jest.fn(() => ({
        getProperty: jest.fn((key) =>
          key === 'LINE_CHANNEL_IDS' ? channelIdsJson : null
        ),
      })),
    };
  }

  function mockFetch(status, body) {
    global.UrlFetchApp.fetch.mockReturnValue({
      getResponseCode: jest.fn(() => status),
      getContentText:  jest.fn(() => JSON.stringify(body)),
    });
  }

  afterEach(() => {
    jest.clearAllMocks();
    global.PropertiesService = {
      getScriptProperties: jest.fn(() => ({
        getProperty: jest.fn(() => null),
      })),
    };
  });

  test('ホワイトリスト内 channelId・LINE API 200・sub 一致 → true', () => {
    mockProps(CHANNEL_IDS);
    mockFetch(200, { sub: VALID_USER_ID });
    expect(_verifyLineIdToken('valid.token', VALID_USER_ID, VALID_CHANNEL)).toBe(true);
  });

  test('2つ目の channelId でも検証できる → true', () => {
    mockProps(CHANNEL_IDS);
    mockFetch(200, { sub: VALID_USER_ID });
    expect(_verifyLineIdToken('valid.token', VALID_USER_ID, OTHER_CHANNEL)).toBe(true);
  });

  test('sub が userId と不一致 → false（なりすまし防止）', () => {
    mockProps(CHANNEL_IDS);
    mockFetch(200, { sub: 'UdifferentUser' });
    expect(_verifyLineIdToken('valid.token', VALID_USER_ID, VALID_CHANNEL)).toBe(false);
  });

  test('LINE API が 400 → false（無効トークン）', () => {
    mockProps(CHANNEL_IDS);
    mockFetch(400, { error: 'invalid_request' });
    expect(_verifyLineIdToken('bad.token', VALID_USER_ID, VALID_CHANNEL)).toBe(false);
  });

  test('ホワイトリスト外の channelId → false・LINE API 未呼び出し', () => {
    mockProps(CHANNEL_IDS);
    expect(_verifyLineIdToken('any.token', VALID_USER_ID, '9999999999')).toBe(false);
    expect(global.UrlFetchApp.fetch).not.toHaveBeenCalled();
  });

  test('channelId が未指定 → false', () => {
    mockProps(CHANNEL_IDS);
    expect(_verifyLineIdToken('any.token', VALID_USER_ID, undefined)).toBe(false);
    expect(global.UrlFetchApp.fetch).not.toHaveBeenCalled();
  });

  test('LINE_CHANNEL_IDS が未設定 → false', () => {
    mockProps(null);
    expect(_verifyLineIdToken('any.token', VALID_USER_ID, VALID_CHANNEL)).toBe(false);
    expect(global.UrlFetchApp.fetch).not.toHaveBeenCalled();
  });

  test('LINE_CHANNEL_IDS が不正 JSON → false', () => {
    mockProps('not-json');
    expect(_verifyLineIdToken('any.token', VALID_USER_ID, VALID_CHANNEL)).toBe(false);
    expect(global.UrlFetchApp.fetch).not.toHaveBeenCalled();
  });

  test('UrlFetchApp が例外を投げる → false', () => {
    mockProps(CHANNEL_IDS);
    global.UrlFetchApp.fetch.mockImplementation(() => { throw new Error('network error'); });
    expect(_verifyLineIdToken('any.token', VALID_USER_ID, VALID_CHANNEL)).toBe(false);
  });
});
