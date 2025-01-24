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
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Request handling
// TODO

// Get tournament information
app.get('/tournament/:id', (req, res) => {
    // Get tournament information
    try {
        const tournamentId = req.params.id;
        console.log('Getting tournament information for tournament ID: ' + tournamentId);
        res.status(200).json({ message: 'Tournament information' });
    } catch (error) {
        console.log('Error: ' + error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user information
app.get('/user/:id', (req, res) => {
    // Get user information
    try {
        const userId = req.params.id;
        console.log('Getting user information for user ID: ' + userId);
        res.status(200).json({ message: 'User information' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get tournament results
app.get('/tournament/:id/results', (req, res) => {
    // Get tournament results
    try {
        const tournamentId = req.params.id;
        console.log('Getting tournament results for tournament ID: ' + tournamentId);
        res.status(200).json({ message: 'Tournament results' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get friends
app.get('/user/:id/friends', (req, res) => {
    // Get friends
    try {
        const userId = req.params.id;
        console.log('Getting friends for user ID: ' + userId);
        res.status(200).json({ message: 'Friends' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// create account
app.post('/api/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        // Add logic to save user to database
        res.status(201).json({ message: 'User signed up successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to sign up user' });
    }
});

// sign in
app.post('/api/signin', async (req, res) => {
    try {
        const { email, password } = req.body;
        // Add logic to authenticate user
        res.status(200).json({ message: 'User signed in successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to sign in user' });
    }
});

// Update tournament results
app.post('/tournament/:id/results', (req, res) => {
    // Update tournament results
    try {
        const tournamentId = req.params.id;
        console.log('Updating tournament results for tournament ID: ' + tournamentId);
        res.status(200).json({ message: 'Tournament results updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update tournament results' });
    }
});

// Add friend
app.post('/user/:id/friends', (req, res) => {
    // Add friend
    try {
        const userId = req.params.id;
        console.log('Adding friend for user ID: ' + userId);
        res.status(200).json({ message: 'Friend added successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add friend' });
    }
});

// Create tournament
app.post('/tournament/create', (req, res) => {
    try {
        const { name, date, location, format, created_by } = req.body; // Add more parameters as needed
        // Add logic to save tournament to database
        res.status(201).json({ message: 'Tournament created successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create tournament' });
    }
});

// Join tournament
app.post('/api/tournaments/:id/join', async (req, res) => {
    try {
        const { userId } = req.body;
        const { id } = req.params; // Access the tournament ID from the URL
        // Add logic to add user to tournament
        res.status(200).json({ message: 'User joined tournament successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to join tournament' });
    }
});



// Start the server
app.listen(3000, () => {
    console.log('Server is running on port 3000');
});