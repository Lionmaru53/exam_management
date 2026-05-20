module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/**/*.test.js'],
  setupFiles: ['./tests/unit/jest.setup.js'],
  clearMocks: true,
};
