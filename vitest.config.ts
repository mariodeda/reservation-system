import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  // Transform .tsx with the automatic JSX runtime (the project's tsconfig uses
  // "preserve", which esbuild can't emit directly).
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: {
    globals: true,
    // Default to node; DOM test files opt in via `// @vitest-environment jsdom`.
    environment: "node",
    setupFiles: ["test/setup-locale.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    // MySQL integration tests download/boot a real mysqld on first run.
    testTimeout: 30_000,
    hookTimeout: 180_000,
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text", "html"],
      include: [
        "src/lib/reservations/**/*.ts",
        "src/components/admin/**/*.{ts,tsx}",
        "src/app/api/**/*.ts",
        "src/proxy.ts",
      ],
      exclude: ["src/lib/reservations/mysql-pool.ts"],
    },
  },
});
