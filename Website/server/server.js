/* 
Back-end functions for the server
=================================
1. Handle sign-up and sign-in requests
2. Handle requests to create tournaments
3. Handle requests to join tournaments
4. Handle requests to get tournament information
5. Handle requests to get user information
6. Handle requests to get tournament results
7. Update tournament results
8. Add and view freinds/other users
*/

// Importing required modules
const express = require('express');
const http = require('http');


http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.write('Hello World!');
    res.end();
}).listen(3000);