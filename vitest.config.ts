import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // This allows us to use jest-like globals (describe, it, expect)
    // without importing them in every test file. Clean and simple.
    globals: true,
    // We need a browser-like environment because some of our code
    // (e.g., window.crypto, TextEncoder) depends on browser APIs.
    // 'jsdom' simulates this environment.
    environment: "jsdom",
    // We can set some initial coverage thresholds to aim for.
    // Let's start modestly and increase as we go.
    coverage: {
      provider: "v8", // Use the V8 provider we installed
      reporter: ["text", "json", "html"], // Generate multiple reports
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
      },
      // What files to include/exclude in the coverage report
      include: ["src/**/*.ts"],
      exclude: [
        "src/generated_protos/**",
        "src/models/**",
        "src/index.ts",
        "**/*.test.ts",
      ],
    },
  },
});
