import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    // Vitest 4's default `forks` pool crashes its worker under Node 24 on
    // Windows (every file reports "0 test" / "reading 'config'"). The `threads`
    // pool runs the suite cleanly, so pin it here.
    pool: "threads",
  },
});
