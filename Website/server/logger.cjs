// server/logger.js
const fs = require("fs");
const path = require("path");

const logFilePath = path.join(__dirname, "server.log");

function logger(req, res, next) {
	const startTime = Date.now();

	// Capture request details
	const { method, url, body, query } = req;

	// Save the original send method so we can intercept the response
	const originalSend = res.send;

	res.send = function (data) {
		const duration = Date.now() - startTime;
		const logEntry = {
			timestamp: new Date().toISOString(),
			method,
			url,
			body,
			query,
			statusCode: res.statusCode,
			duration: `${duration}ms`,
			response: tryParseJson(data),
		};

		// Append the log to the file
		fs.appendFile(logFilePath, JSON.stringify(logEntry) + "\n", (err) => {
			if (err) console.error("Failed to write to log:", err);
		});

		// Restore the original send method and continue
		return originalSend.call(this, data);
	};

	next();
}

// Utility to safely parse JSON from response string
function tryParseJson(data) {
	try {
		return JSON.parse(data);
	} catch {
		return data;
	}
}

module.exports = logger;
