/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  coverageDirectory: ".github/coverage",
  coverageReporters: [
    "json-summary"
  ],
  globalSetup: "./test/setup.js",
  globals: {
    fetch: global.fetch,
  }
};