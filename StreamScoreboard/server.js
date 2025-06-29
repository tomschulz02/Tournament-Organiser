const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

io.on('connection', (socket) => {
	// console.log('a user connected');

	socket.on('updateScore', (data) => {
		io.emit('scoreUpdated', data); // send to all connected clients
	});
});

http.listen(3000, () => {
	console.log('Scoreboard server running on http://localhost:3000');
});
