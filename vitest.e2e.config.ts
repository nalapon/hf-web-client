import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // E2E tests interact with a real network, so we use the default Node.js environment.
    environment: "node",
    // IMPORTANT: This config ONLY looks for tests inside the test/e2e directory.
    include: ["test/e2e/**/*.test.ts"],
    // Network operations can be slow. We give each test a generous timeout.
    testTimeout: 90000, // 90 seconds, to be safe.
  },
});
