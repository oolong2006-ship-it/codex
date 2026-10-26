// unit: دوال نقية دون قاعدة بيانات. e2e: API + Postgres حقيقي.
const transform = { '^.+\\.ts$': ['@swc/jest'] };
module.exports = {
  projects: [
    { displayName: 'unit', testEnvironment: 'node', transform, testMatch: ['<rootDir>/src/**/*.spec.ts'] },
    {
      displayName: 'e2e',
      testEnvironment: 'node',
      transform,
      testMatch: ['<rootDir>/test/**/*.e2e.ts'],
      globalSetup: '<rootDir>/test/global-setup.ts',
    },
  ],
};
