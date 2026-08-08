import { vi } from "vitest";

// Stand-in for src/config/db.js.
//
// The real module exports a factory returning a singleton whose two access styles
// have DIFFERENT return shapes, and the repositories depend on that difference:
//
//   db.query(sql, params)        -> res.rows          (a plain array)
//   (await db.pool.connect())    -> a pg client whose
//     client.query(sql, params)  -> { rows, rowCount } (the full pg result)
//
// Getting this wrong silently breaks the repository tests, so the mock reproduces
// both shapes exactly.
//
// Usage in a test file — the factory must be async so it can import this module,
// because vi.mock is hoisted above ordinary imports:
//
//   vi.mock("../../../src/config/db.js", async () => {
//       const { dbMock } = await import("../../helpers/dbMock.js");
//       return { default: () => dbMock.instance };
//   });

function defaultClientQuery() {
    return { rows: [], rowCount: 0 };
}

export const dbMock = {
    client: {
        query: vi.fn(async () => defaultClientQuery()),
        release: vi.fn()
    },
    instance: null
};

dbMock.instance = {
    query: vi.fn(async () => []),
    pool: {
        connect: vi.fn(async () => dbMock.client)
    },
    // Mirrors DBConnection.withTransaction, so a suite can assert the
    // BEGIN/COMMIT sequencing and the release through clientSql() exactly as it
    // does for a repository that opens its own transaction. Kept faithful to the
    // real implementation on purpose: if one changes, change both.
    withTransaction: vi.fn(async (fn) => {
        const client = dbMock.client;

        try {
            await client.query("BEGIN");
            const result = await fn(client);
            await client.query("COMMIT");

            return result;
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    })
};

const defaultWithTransaction = dbMock.instance.withTransaction.getMockImplementation();

// Wipes call history AND any leftover one-shot implementations, then reinstalls
// the defaults. Call from beforeEach in any suite that touches the database.
export function resetDbMock() {
    dbMock.client.query.mockReset();
    dbMock.client.query.mockImplementation(async () => defaultClientQuery());
    dbMock.client.release.mockReset();

    dbMock.instance.query.mockReset();
    dbMock.instance.query.mockImplementation(async () => []);
    dbMock.instance.pool.connect.mockReset();
    dbMock.instance.pool.connect.mockImplementation(async () => dbMock.client);
    dbMock.instance.withTransaction.mockReset();
    dbMock.instance.withTransaction.mockImplementation(defaultWithTransaction);
}

// The SQL text of every call made on the transaction client, in order. Used to
// assert BEGIN/COMMIT/ROLLBACK sequencing.
export function clientSql() {
    return dbMock.client.query.mock.calls.map(([sql]) => sql);
}

// Collapses whitespace so assertions survive reformatting of multi-line SQL.
export function squash(sql) {
    return String(sql).replace(/\s+/g, " ").trim();
}
