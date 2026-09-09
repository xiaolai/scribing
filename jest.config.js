/**
 * `rootDir` is the repository root so that Babel resolves babel.config.js from here;
 * with rootDir pointed at src/, Babel looked for its root config inside src/ and
 * silently transformed TypeScript without @babel/preset-typescript.
 */
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/src'],
  setupFiles: ['jest-canvas-mock'],
  setupFilesAfterEnv: ['<rootDir>/jest-setup.js'],
  testEnvironment: '<rootDir>/jest-jsdom-env.js',
  testEnvironmentOptions: {
    url: 'https://test.com/url#tag',
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  // Count every shipped module, including ones no test imports yet, so the number
  // reflects the library rather than only the parts already under test.
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/__tests__/**',
    '!src/testFixtures/**',
    '!src/testUtils.ts',
    '!src/typings/**',
    // Interface-only modules compile to nothing; including them reports a false 0%.
    '!src/fonts/types.ts',
    '!src/units/types.ts',
    '!src/renderers/*/index.ts',
  ],
  // Set just under the measured numbers, so a real regression fails the build while
  // ordinary churn does not. Raise these when coverage rises; never lower them to
  // make a red build green.
  coverageThreshold: {
    global: {
      statements: 93,
      branches: 85,
      functions: 96,
      lines: 95,
    },
  },
};
