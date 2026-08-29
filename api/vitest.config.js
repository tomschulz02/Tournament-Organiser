import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        globals: true,
        setupFiles: ["./test/setup.js"],
        include: ["test/**/*.test.js"],
        // test/known-bugs/ is written to fail until the bugs it documents are
        // fixed, so including it would leave `npm test` permanently red and
        // therefore useless as a signal. Run it on its own with
        // `npm run test:bugs`, which uses vitest.bugs.config.js.
        exclude: [...configDefaults.exclude, "test/known-bugs/**"],
        // Call history is wiped between tests. Implementations are not, so the
        // defaults installed by test/helpers/dbMock.js survive; tests that need a
        // clean slate call resetDbMock() themselves.
        clearMocks: true,
        coverage: {
            provider: "v8",
            reporter: ["text", "lcov", "html"],
            // Without this, a failing run prints no coverage at all, which is
            // exactly when the report is most useful.
            reportOnFailure: true,
            include: ["src/**/*.js"],
            exclude: [
                // Process entrypoint: dotenv, env validation, process.exit, listen.
                // Nothing imports it, and covering it would mean spawning a server.
                //
                // What it does is now only wiring. The shutdown sequence it used to
                // hold was extracted to src/lifecycle.js, which takes its server,
                // pool, logger and exit as arguments and is covered in full by
                // test/unit/lifecycle.test.js. What is left here — dotenv, the env
                // check, listen and one call to registerShutdownHandlers — cannot be
                // exercised without a real process and a real port, and testing it
                // would prove nothing the pieces do not already prove.
                "src/server.js",
                // Opens a real pg Pool on construction. Mocked in every test, so it
                // is never executed; see test/helpers/dbMock.js.
                "src/config/db.js"
            ],
            // A note on the `/* v8 ignore next */` markers above `} finally {`
            // in src/: v8 emits a single-path, always-zero "branch" spanning the
            // closing brace of a try/catch that is followed by finally. It is a
            // reporting artifact, not a missed path — every route through those
            // finally blocks is exercised. The markers suppress only that.
            // Actual coverage is 100. The gate matches it deliberately: a
            // threshold set below actual lets coverage fall silently, one
            // uncovered line at a time, without ever going red. Do not lower
            // these to make a change pass — cover the change instead.
            thresholds: {
                statements: 100,
                branches: 100,
                functions: 100,
                lines: 100
            }
        }
    }
});
