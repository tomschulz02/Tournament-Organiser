import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pkg;

class DBConnection {
    constructor () {
        if (DBConnection.instance) return DBConnection.instance;

		this.pool = new Pool({
			connectionString: process.env.DATABASE_URL,
			ssl: {
				rejectUnauthorized: false,
			},
			max: 20, // max number of clients in the pool
		});

		this.pool
			.connect()
			.then((client) => {
				console.log("PostgreSQL pool connected successfully.");
				client.release();
			})
			.catch((err) => console.error("Error connecting to PostgreSQL pool:", err));

		DBConnection.instance = this;
    }

    async query(sql, params = []) {
		try {
			const res = await this.pool.query(sql, params);
			return res.rows;
		} catch (err) {
			// Keep the pg error as the cause. Stringifying it here discarded the
			// error code and constraint name before any repository could see them,
			// which is why a unique-constraint violation surfaced as a 500.
			throw new Error(err.message, { cause: err });
		}
	}

	// One transaction on one client. The callback receives the client; a
	// rejection rolls back and rethrows, and the client is released either way.
	//
	// The service decides what belongs in a transaction, because "these things
	// must all succeed together" is business logic. The repository keeps owning
	// the SQL. See docs/architecture.md.
	async withTransaction(fn) {
		const client = await this.pool.connect();

		try {
			await client.query("BEGIN");
			const result = await fn(client);
			await client.query("COMMIT");

			return result;
		} catch (err) {
			await client.query("ROLLBACK");
			throw err;
			/* v8 ignore next -- finally-block coverage artifact; see vitest.config.js */
		} finally {
			client.release();
		}
	}
}

export default () => new DBConnection();