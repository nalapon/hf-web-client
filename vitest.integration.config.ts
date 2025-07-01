import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "integration",
    include: ["test/integration/**/*.test.ts"],
    exclude: ["test/e2e/**", "**/fabric-samples/**"],
    environment: "node",
    globals: true,
    testTimeout: 90_000,
    hookTimeout: 30_000,
    teardownTimeout: 30_000,
    reporters: ["verbose"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: {
      "@connectrpc/connect-web": "@connectrpc/connect-node",
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
