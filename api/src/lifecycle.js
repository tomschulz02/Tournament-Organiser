// Graceful shutdown.
//
// Render sends SIGTERM on every deploy and waits a short while before SIGKILL.
// Until now nothing handled it: the process died mid-request and left the pg
// pool's connections to time out server-side.
//
// The order matters. Stop accepting new connections first, let the requests
// already in flight finish, and only then close the pool — closing it first
// would fail those requests rather than completing them.
//
// This lives apart from server.js so it can be tested without spawning a
// listener. Everything it touches arrives as an argument; see
// test/unit/lifecycle.test.js.

// Long enough for a normal request to finish, comfortably inside the window a
// host allows between SIGTERM and SIGKILL.
export const SHUTDOWN_TIMEOUT_MS = 10_000;

export async function shutdown({
    server,
    pool,
    signal,
    logger = console,
    exit = process.exit,
    timeoutMs = SHUTDOWN_TIMEOUT_MS
}) {
    logger.log(`${signal} received, shutting down`);

    // A request that never completes must not hold the process open until the
    // host kills it, because that is the dropped connection we are avoiding.
    // unref so this timer alone cannot keep the event loop alive.
    const forceExit = setTimeout(() => {
        logger.error(`Shutdown timed out after ${timeoutMs}ms, exiting anyway`);
        exit(1);
    }, timeoutMs);
    forceExit.unref?.();

    try {
        await closeServer(server);
        await pool.end();

        clearTimeout(forceExit);
        logger.log("Shutdown complete");
        exit(0);
    } catch (error) {
        clearTimeout(forceExit);
        logger.error("Shutdown failed", error);
        exit(1);
    }
}

function closeServer(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
}

// SIGTERM is what a host sends to stop the process; SIGINT is Ctrl-C in
// development. Both mean the same thing here.
export const SHUTDOWN_SIGNALS = ["SIGTERM", "SIGINT"];

export function registerShutdownHandlers({ server, pool, process: proc = process, ...options }) {
    SHUTDOWN_SIGNALS.forEach((signal) => {
        // `once`: a second SIGTERM while the first is still draining would
        // otherwise start a concurrent shutdown and double-close the pool.
        proc.once(signal, () => {
            shutdown({ server, pool, signal, exit: proc.exit, ...options });
        });
    });
}
