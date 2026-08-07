import { userService } from "../services/users.service.js";
import { SESSION_TTL_MS, sessionCookieOptions } from "../config/auth.js";

async function signup(req, res) {
    try {
        const { username, email, password, confirmPassword } = req.body;
        const token = await userService.createUser(username, email, password, confirmPassword);

        res.cookie('token', token, { ...sessionCookieOptions(), maxAge: SESSION_TTL_MS });
		res.status(201).json({ success: true, message: 'User registered successfully', user: { username } });
    } catch (err) {
        if (err.message === "PASSWORDS_DO_NOT_MATCH"){
            res.status(400).json({ error: "Passwords do not match" });
        } else if (err.message === "MISSING_FIELDS") {
            res.status(400).json({ error: "Missing required fields" });
        } else if (err.message === "USER_CREATION_ERROR") {
            res.status(500).json({ error: "Failed to create account" });
        } else {
            res.status(500).json({ error: "Internal server error" });
        }
    }
}

async function login(req, res) {
    try {
        const { email, password } = req.body;
        const token = await userService.loginUser(email, password);

        res.cookie('token', token, { ...sessionCookieOptions(), maxAge: SESSION_TTL_MS });
        res.status(200).json({ success: true, message: 'Login successful'});
    } catch (err) {
        console.error(err);
        if (err.message === "MISSING_FIELDS") {
            res.status(400).json({ error: "Missing required fields" });
        } else if (err.message === "INVALID_CREDENTIALS") {
            // One message for both an unknown email and a wrong password, so the
            // response cannot be used to discover which accounts exist.
            res.status(401).json({ error: "Invalid email or password" });
        } else {
            res.status(500).json({ error: "Internal server error" });
        }
    }
}

async function logout(req, res) {
    try {
        res.clearCookie('token', sessionCookieOptions());
        res.json({ success: true, message: 'User logged out' });
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
}

async function getUserProfile(req, res) {
    try {

    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
}

async function checkLogin(req, res) {
    try {
        if (req.user) {
            res.json({ loggedIn: true, user: req.user.username });
        } else {
            res.json({ loggedIn: false });
        }
        
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
}

export const userController = {
    signup,
    login,
    logout,
    getUserProfile,
    checkLogin
}
