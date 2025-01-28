// import env variables and necessary modules
require('dotenv').config();
var mysql = require('mysql');

function DBConnection() {
    // create connection to database using a pool
    this.pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        connectionLimit: 10
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
}

// export the module
module.exports = DBConnection;