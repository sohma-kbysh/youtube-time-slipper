import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    environmentMatchGlobs: [
      ["tests/scanner.test.ts", "jsdom"],
      ["tests/visibility.test.ts", "jsdom"]
    ]
  }
});
