/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // The jest-expo preset already ships the correct transformIgnorePatterns so
  // React Native / Expo ESM modules get transpiled; we keep those defaults.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
};
