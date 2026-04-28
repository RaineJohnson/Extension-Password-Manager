/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^webextension-polyfill$': '<rootDir>/tests/mocks/webextensionPolyfill.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'Node10',
          target: 'ES2022',
          jsx: 'react-jsx',
          esModuleInterop: true,
          strict: true,
          ignoreDeprecations: '6.0',
        },
      },
    ],
  },
};
