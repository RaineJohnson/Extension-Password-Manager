export default {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  transformIgnorePatterns: ["/node_modules/"],
};
