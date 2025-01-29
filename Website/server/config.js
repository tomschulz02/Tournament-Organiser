// import env variables and necessary modules
require('dotenv').config();
const mysql = require('mysql');
const bcrypt = require('bcrypt');
const saltRounds = 10;

function DBConnection() {
    // create connection to database using a pool
    this.pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        connectionLimit: 50
    });

    this.exampleQuery = function() {
        // Example of how to query the database
        // connect to database and display errors if any occur
        this.pool.getConnection(function(err, connection) {
            // throw an error if connection fails
            if (err) throw err;

            // queries go here
            console.log('Connected to database as ID ' + connection.threadId);

            // close the connection
            connection.release();

            // handle error after the release
            if (err) throw err;
            console.log('Connection closed');
        });
    }

    // query to insert a new user into the database with username, email, and hashed password
    this.createUser = function(username, password, email, callback) {
        this.pool.getConnection(function(err, connection) {
            // connection error
            if (err) return callback([false, err]);

            // hash password
            bcrypt.hash(password, saltRounds, function(err, hash) {
                // hash error
                if (err) {
                    connection.release();
                    return callback([false, err]);
                }

                var query = 'INSERT INTO users (username, password, email) VALUES (?, ?, ?)';

                // insert user into database
                connection.query(query, [username, hash, email], function(err, result) {
                    // query error
                    if (err) {
                        connection.release();
                        return callback([false, err]);
                    }

                    console.log('User created');

                    connection.release();

                    if (err) return callback([false, err]);

                    callback([true, result]);
                });
            });
        });
    }

    this.loginUser = function(username, password) {
        this.pool.getConnection(function(err, connection) {
            if (err) return [false, err];

            var query = 'SELECT * FROM users WHERE username = ?';

            connection.query(query, [username], function(err, result) {
                if (err) return [false, err];

                // check if user exists
                if (result.length === 0) {
                    return [false, 'User does not exist'];
                }

                // check if password is correct
                bcrypt.compare(password, result[0].password, function(err, res) {
                    if (err) return [false, err];

                    if (res) {
                        return [true, res];
                    } else {
                        return [false, 'Incorrect password'];
                    }
                });

                connection.release();

                if (err) return [false, err];
            });
        });
    }
}

// export the module
module.exports = DBConnection;