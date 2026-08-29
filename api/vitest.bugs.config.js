import { defineConfig } from "vitest/config";

// The known-bug suite, run on its own with `npm run test:bugs`.
//
// It is expected to fail. Each case encodes the behaviour the code was written to
// have, per docs/tournament-rules.md and docs/division-state.md, and names the line
// that currently prevents it. The rest of the suite locks in what the code does
// today, so the two are deliberately in tension — which is why this cannot share a
// run with them.
//
// A separate config rather than an `exclude` in vitest.config.js: vitest applies
// CLI path filters on top of include/exclude, so a directory excluded there stays
// excluded even when named explicitly on the command line.
//
// No coverage here. Coverage belongs to the default run in vitest.config.js.
export default defineConfig({
    test: {
        environment: "node",
        globals: true,
        setupFiles: ["./test/setup.js"],
        include: ["test/known-bugs/**/*.test.js"],
        clearMocks: true
    }
});
