export default {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  transformIgnorePatterns: ["/node_modules/"],
  // Run test files one at a time to prevent
  // database conflicts between test suites
  maxWorkers: 1,
};
