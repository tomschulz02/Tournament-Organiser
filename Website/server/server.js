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
8. Add and view friends/other users

TODO:
 - add option for user to create separate brackets for male and female
    => User can indicate in tournament creation form if separate brackets are necessary
    => server will create two distinct tournaments with same details, one for male one for female
    => add flag on tournaments to show if tournament is gender specific so that when tournament details
        are fetched that both tournaments are returned
*/

// run with flag --watch to restart server on changes

// Importing required modules
import DBConnection from './config';
import express, { json } from 'express';
import cors from 'cors';
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.SECRET;
const app = express();

app.use(cors());
app.use(json());

// Database connection
const db = new DBConnection();

// Request handling
// TODO


// token verification
const verifyToken = (req, res, next) => {
    const token = req.cookies.authToken;

    console.log(token);

    if (!token) {
        return res.status(403).json({ error: 'A token is required for authentication' });
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Get tournament information
app.get('/tournament/:id', (req, res) => {
    // Get tournament information
    try {
        const tournamentId = req.params.id;
        console.log('Getting tournament information for tournament ID: ' + tournamentId);

        db.getTournament(tournamentId, (result) => {
            if (!result.success) {
                return res.status(500).json({ error: result.message });
            }

            // filter out specific tournament information depending on user request parameters
        });

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

        db.getResults(tournamentId, (result) => {
            if (!result.success) {
                return res.status(500).json({ error: result.message });
            } else {
                return res.status(200).json({ message: result.message });
            }
        });

        res.status(200).json({ message: 'Tournament results' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get friends
app.get('/user/:id/friends', verifyToken, (req, res) => {
    // Get friends
    try {
        const userId = req.params.id;
        console.log('Getting friends for user ID: ' + userId);

        db.getFriends(userId, (result) => {
            if (!result.success) {
                return res.status(500).json({ error: result.message });
            } else {
                return res.status(200).json({ message: result.message });
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// get saved tournaments
app.get('/user/:id/tournaments', verifyToken, (req, res) => {
    // Get saved tournaments
    try {
        const userId = req.params.id;
        console.log('Getting saved tournaments for user ID: ' + userId);

        db.getSavedTournaments(userId, (result) => {
            if (!result.success) {
                return res.status(500).json({ error: result.message });
            } else {
                return res.status(200).json({ message: result.message });
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// create account
app.post('/api/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        // Add logic to save user to database

        db.createUser(username, email, password, (result) => {
            if (!result.success) {
                if (result.object && result.message.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: 'Email already exists' });
                } else {
                    return res.status(500).json({ error: result.message });
                }
            }
        });
        
        return res.status(201).json({ message: 'User account created successfully' });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Failed to create account' });
    }
});

// sign in
app.post('/api/signin', async (req, res) => {
    try {
        const { email, password } = req.body;

        db.loginUser(email, password, (result) => {
            if (!result.success) {
                return res.status(400).json({ error: result.message });
            }

            const token = jwt.sign(
                {user: result.message.username, email: result.message.email}, 
                SECRET_KEY,
                {expiresIn: '24h'}
            );

            return res.status(200).cookie('authToken', token,  {httpOnly: true, secure: true, sameSite: 'strict', maxAge: (1000*60*60*24)}).json({ message: "User authenticated" });         
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to sign in user' });
    }
});

// logout
app.post('api/signout', verifyToken, async (req, res) => {
    res.clearCookie('authToken', {httpOnly: true, secure: true, sameSite: 'strict', maxAge: (1000*60*60*24)});
    res.json({ message: "User logged out"});
});

// Update tournament results
app.post('/tournament/:id/results', verifyToken, (req, res) => {
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
app.post('/user/:id/friends', verifyToken, (req, res) => {
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
app.post('/tournament/create', verifyToken, (req, res) => {
    try {
        const { name, date, location, format, created_by } = req.body; // Add more parameters as needed
        // Add logic to save tournament to database
        res.status(201).json({ message: 'Tournament created successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create tournament' });
    }
});

// Join tournament
app.post('/api/tournaments/:id/join', verifyToken, async (req, res) => {
    try {
        const { userId } = req.body;
        const { id } = req.params; // Access the tournament ID from the URL
        // Add logic to add user to tournament

        db.joinTournament(userId, id, (result) => {
            if (!result.success) {
                return res.status(400).json({ error: result.message });
            }
        });

        res.status(200).json({ message: 'User joined tournament successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to join tournament' });
    }
});



// Start the server
app.listen(3000, () => {
    console.log('Server is running on port 3000');
});