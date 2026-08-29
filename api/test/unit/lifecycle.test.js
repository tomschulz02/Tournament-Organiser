import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    shutdown,
    registerShutdownHandlers,
    SHUTDOWN_SIGNALS,
    SHUTDOWN_TIMEOUT_MS
} from "../../src/lifecycle.js";

// The shutdown sequence is extracted from server.js precisely so it can be
// exercised without binding a port. Everything it touches is injected, so these
// tests use plain fakes rather than a real server or pool.

function makeServer({ closeError = null } = {}) {
    return {
        close: vi.fn((callback) => callback(closeError))
    };
}

function makePool({ endError = null } = {}) {
    return {
        end: endError ? vi.fn(async () => { throw endError; }) : vi.fn(async () => undefined)
    };
}

function makeLogger() {
    return { log: vi.fn(), error: vi.fn() };
}

describe("shutdown", () => {
    it("stops the listener, then closes the pool, then exits zero", async () => {
        const order = [];
        const server = { close: vi.fn((cb) => { order.push("server.close"); cb(null); }) };
        const pool = { end: vi.fn(async () => { order.push("pool.end"); }) };
        const exit = vi.fn();

        await shutdown({ server, pool, signal: "SIGTERM", logger: makeLogger(), exit });

        // Order is the point. Closing the pool first would fail the requests
        // still in flight rather than letting them finish.
        expect(order).toEqual(["server.close", "pool.end"]);
        expect(exit).toHaveBeenCalledWith(0);
    });

    it("names the signal it received", async () => {
        const logger = makeLogger();

        await shutdown({ server: makeServer(), pool: makePool(), signal: "SIGINT", logger, exit: vi.fn() });

        expect(logger.log).toHaveBeenCalledWith("SIGINT received, shutting down");
        expect(logger.log).toHaveBeenCalledWith("Shutdown complete");
    });

    it("exits non-zero and does not close the pool when the listener will not close", async () => {
        const failure = new Error("close failed");
        const pool = makePool();
        const logger = makeLogger();
        const exit = vi.fn();

        await shutdown({ server: makeServer({ closeError: failure }), pool, signal: "SIGTERM", logger, exit });

        expect(pool.end).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith("Shutdown failed", failure);
        expect(exit).toHaveBeenCalledWith(1);
    });

    it("exits non-zero when the pool will not close", async () => {
        const failure = new Error("pool end failed");
        const logger = makeLogger();
        const exit = vi.fn();

        await shutdown({
            server: makeServer(),
            pool: makePool({ endError: failure }),
            signal: "SIGTERM",
            logger,
            exit
        });

        expect(logger.error).toHaveBeenCalledWith("Shutdown failed", failure);
        expect(exit).toHaveBeenCalledWith(1);
    });

    describe("the forced-exit timer", () => {
        beforeEach(() => {
            vi.useFakeTimers();
            return () => vi.useRealTimers();
        });

        it("gives up when a request never finishes, rather than hanging until SIGKILL", async () => {
            // A listener whose callback is never invoked: the in-flight request
            // never completes, so close() never reports back.
            const server = { close: vi.fn() };
            const logger = makeLogger();
            const exit = vi.fn();

            shutdown({ server, pool: makePool(), signal: "SIGTERM", logger, exit, timeoutMs: 5000 });
            await vi.advanceTimersByTimeAsync(4999);
            expect(exit).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(1);

            expect(logger.error).toHaveBeenCalledWith("Shutdown timed out after 5000ms, exiting anyway");
            expect(exit).toHaveBeenCalledWith(1);
        });

        it("cancels the timer once shutdown completes, so it cannot fire late", async () => {
            const exit = vi.fn();

            await shutdown({ server: makeServer(), pool: makePool(), signal: "SIGTERM", logger: makeLogger(), exit });
            await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS * 2);

            expect(exit).toHaveBeenCalledExactlyOnceWith(0);
        });

        it("cancels the timer when shutdown fails too", async () => {
            const exit = vi.fn();

            await shutdown({
                server: makeServer({ closeError: new Error("close failed") }),
                pool: makePool(),
                signal: "SIGTERM",
                logger: makeLogger(),
                exit
            });
            await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS * 2);

            expect(exit).toHaveBeenCalledExactlyOnceWith(1);
        });
    });
});

describe("registerShutdownHandlers", () => {
    function makeProcess() {
        return { once: vi.fn(), exit: vi.fn() };
    }

    it("listens for SIGTERM and SIGINT", () => {
        const proc = makeProcess();

        registerShutdownHandlers({ server: makeServer(), pool: makePool(), process: proc });

        expect(proc.once.mock.calls.map(([signal]) => signal)).toEqual(SHUTDOWN_SIGNALS);
    });

    // `once`, not `on`: a second SIGTERM arriving while the first is still
    // draining would start a concurrent shutdown and double-close the pool.
    it("registers each signal only once", () => {
        const proc = makeProcess();

        registerShutdownHandlers({ server: makeServer(), pool: makePool(), process: proc });

        expect(proc.once).toHaveBeenCalledTimes(SHUTDOWN_SIGNALS.length);
    });

    it("runs the shutdown sequence when a registered signal fires", async () => {
        const proc = makeProcess();
        const server = makeServer();
        const pool = makePool();
        const logger = makeLogger();

        registerShutdownHandlers({ server, pool, process: proc, logger });

        const [, handler] = proc.once.mock.calls.find(([signal]) => signal === "SIGTERM");
        await handler();
        await vi.waitFor(() => expect(proc.exit).toHaveBeenCalledWith(0));

        expect(server.close).toHaveBeenCalled();
        expect(pool.end).toHaveBeenCalled();
        expect(logger.log).toHaveBeenCalledWith("SIGTERM received, shutting down");
    });
});
