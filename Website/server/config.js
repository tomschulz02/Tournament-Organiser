// import env variables and necessary modules
require("dotenv").config();
const mysql = require("mysql");
const bcrypt = require("bcrypt");
const saltRounds = 10;

class DBConnection {
	constructor() {
		// create connection to database using a pool
		this.pool = mysql.createPool({
			host: process.env.DB_HOST,
			user: process.env.DB_USER,
			password: process.env.DB_PASSWORD,
			port: process.env.DB_PORT,
			database: process.env.DB_DATABASE,
			connectionLimit: 50,
		});
	}

	exampleQuery() {
		// Example of how to query the database
		// connect to database and display errors if any occur
		this.pool.getConnection(function (err, connection) {
			// throw an error if connection fails
			if (err) throw err;

			// queries go here
			console.log("Connected to database as ID " + connection.threadId);

			// close the connection
			connection.release();

			// handle error after the release
			if (err) throw err;
			console.log("Connection closed");
		});
	}

	createUser(username, email, password, callback) {
		// query to insert a new user into the database with username, email, and hashed password
		this.pool.getConnection(function (err, connection) {
			// connection error
			if (err) {
				console.log(err);
				return callback({ success: false, object: true, message: err });
			}

			// hash password
			bcrypt.hash(password, saltRounds, function (err, hash) {
				// hash error
				if (err) {
					connection.release();
					return callback({ success: false, object: true, message: err });
				}

				var query =
					"INSERT INTO users (username, password, email) VALUES (?, ?, ?)";

				// insert user into database
				connection.query(
					query,
					[username, hash, email],
					function (err, result) {
						// query error
						if (err) {
							connection.release();
							return callback({ success: false, object: true, message: err });
						}

						console.log("User created");

						connection.release();

						if (err) callback({ success: false, object: true, message: err });
						else callback({ success: true, object: true, message: result });
					}
				);
			});
		});
	}

	loginUser(username, password, callback) {
		this.pool.getConnection(function (err, connection) {
			if (err) return callback({ success: false, object: true, message: err });

			var query = "SELECT * FROM users WHERE username = ?";

			connection.query(query, [username], function (err, result) {
				if (err) {
					connection.release();
					return callback({ success: false, object: true, message: err });
				}

				// check if user exists
				if (result.length === 0) {
					connection.release();
					return callback({
						success: false,
						object: false,
						message: "User does not exist",
					});
				}

				// check if password is correct
				bcrypt.compare(password, result[0].password, function (err, res) {
					if (err) {
						connection.release();
						return callback({ success: false, object: true, message: err });
					}

                    console.log(res);

					if (res) {
						callback({ success: true, object: true, message: res });
					} else {
						callback({
							success: false,
							object: false,
							message: "Incorrect password",
						});
					}
				});

				connection.release();

				if (err)
					return callback({ success: false, object: true, message: err });
			});
		});
	}

    addFriend(userId, friendId, callback) {
        this.pool.getConnection(function(err, connection) {
            if (err) return callback({ success: false, object: true, message: err });

            var query = "INSERT INTO friends (user_id, friend_id) VALUES (?, ?)";

            connection.query(query, [userId, friendId], function(err, result) {
                if (err) {
                    connection.release();
                    return callback({ success: false, object: true, message: err });
                }

                console.log("Friend added");

                connection.release();

                if (err) return callback({ success: false, object: true, message: err });
                else return callback({ success: true, object: true, message: result });
            });
        });
    }

    getFriends(userId, callback) {
        this.pool.getConnection(function(err, connection) {
            if (err) return callback({ success: false, object: true, message: err });

            var query = "SELECT * FROM friends WHERE user_id = ?";

            connection.query(query, [userId], function(err, result) {
                if (err) {
                    connection.release();
                    return callback({ success: false, object: true, message: err });
                }

                console.log("Friends retrieved");

                connection.release();

                if (err) return callback({ success: false, object: true, message: err });
                else return callback({ success: true, object: true, message: result });
            });
        });
    }

    createTournament(name, date, location, desc, format, teams, groups, knockout, state, created_by, callback) {
        this.pool.getConnection(function(err, connection) {
            if (err) return callback({ success: false, object: true, message: err });

            var query = "INSERT INTO tournaments (name, date, location, description, format, num_teams, num_groups, knockout, state, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
            var id = null;

            connection.query(query, [name, date, location, desc, format, teams, groups, knockout, state, created_by], function(err, result) {
                if (err) {
                    connection.release();
                    return callback({ success: false, object: true, message: err });
                }

                id = result.insertId;

                console.log("Tournament created");
            });

            query = "INSERT INTO saved_tournaments (user_id, tournament_id) VALUES (?, ?)";

            connection.query(query, [created_by, id], function(err, result) {
                if (err) {
                    connection.release();
                    return callback({ success: false, object: true, message: err });
                }

                console.log("Tournament saved");
            });

            connection.release();

            if (err) return callback({ success: false, object: true, message: err });
            else return callback({ success: true, object: false, message: "Tournament created" });
        });
    }

	test() {
		console.log("test");
	}
}

// export the module
module.exports = DBConnection;
