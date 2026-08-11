import { defineConfig } from "vitest/config";

// The UI's first test setup. Deliberately narrow: it covers the pure modules
// only — no React, no DOM.
//
// Rendering tests need a DOM environment and a testing library, which is a
// larger decision than this configuration should make on its own. The modules
// tested here carry rules that exist nowhere else — slot arithmetic, court
// affinity, the round-order constraint, fixture filtering — so they are where
// the value is highest and the setup cost lowest.
export default defineConfig({
    test: {
        // node, not jsdom: nothing under test touches the DOM. Add an
        // environment when component tests arrive, not before.
        environment: "node",
        globals: true,
        include: ["test/**/*.test.js"],
        clearMocks: true,
        coverage: {
            provider: "v8",
            reporter: ["text", "lcov", "html"],
            reportOnFailure: true,
            // Only what is actually under test. Including all of src/ would
            // report a headline figure dominated by untested components and
            // make the number meaningless.
            include: [
                "src/utils/scheduleUtils.js",
                "src/utils/scheduleGenerator.js",
                "src/components/tournament/fixtureUtils.js",
                // Not a pure module — it calls fetch — but the tournament cache
                // added on 2026-08-11 decides whether one reader can be shown
                // another's payload, so it is worth the stubbed fetch.
                "src/requests.js"
            ]
            // No thresholds, on purpose. A gate over a handful of files out of
            // forty would be theatre. Add one when the suite covers enough to
            // mean something — see docs/known-limitations.md, which records what
            // this suite does and does not reach.
        }
    }
});
