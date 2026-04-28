import pkg from pg;
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

    query(sql, params, callback) {
		const values = params || [];
		this.pool.query(sql, values, (err, result) => {
			if (err) return callback({ success: false, object: true, message: err });
			return callback({ success: true, object: true, message: result.rows });
		});
	}
}