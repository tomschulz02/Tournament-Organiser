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

    async query(sql, params) {
		const values = params || [];
		
		try {
			const res = await this.pool.query(sql, values);
			return { success: true, message: res.rows };
		} catch (err) {
			return { success: false, error: "DATABASE_ERROR", message: err };
		}
	}
}

export default () => new DBConnection();