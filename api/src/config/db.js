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
			throw new Error(err);
		}
	}
}

export default () => new DBConnection();