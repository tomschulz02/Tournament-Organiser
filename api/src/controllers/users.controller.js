import { userService } from "../services/users.service.js";
import { tournamentService } from "../services/tournaments.service.js";
import { SESSION_TTL_MS, sessionCookieOptions } from "../config/auth.js";

// Controllers do not catch. Express 5 forwards a rejected promise from an async
// handler to the error middleware, which is the single place that maps a failure
// to a status, builds the envelope and logs.

async function signup(req, res) {
    const { username, email, password, confirmPassword } = req.body;
    const created = await userService.createUser(username, email, password, confirmPassword);

    res.cookie('token', created.token, { ...sessionCookieOptions(), maxAge: SESSION_TTL_MS });
    res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: { username: created.username }
    });
}

async function login(req, res) {
    const { email: identifier, password } = req.body;
    const session = await userService.loginUser(identifier, password);

    res.cookie('token', session.token, { ...sessionCookieOptions(), maxAge: SESSION_TTL_MS });
    res.status(200).json({
        success: true,
        message: 'Login successful',
        data: { username: session.username }
    });
}

async function changePassword(req, res) {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    await userService.changePassword(req.user.id, currentPassword, newPassword, confirmNewPassword);

    res.status(200).json({ success: true, message: 'Password updated', data: null });
}

async function logout(req, res) {
    res.clearCookie('token', sessionCookieOptions());
    res.status(200).json({ success: true, message: 'User logged out', data: null });
}

// Self-scoped only — see docs/decisions.md. req.user already carries
// everything a basic profile needs, decoded from the JWT by the global auth
// middleware, so this needs no service or repository call of its own.
async function getUserProfile(req, res) {
    res.status(200).json({
        success: true,
        message: 'Profile fetched',
        data: { id: req.user.id, username: req.user.username, email: req.user.email, admin: req.user.admin }
    });
}

async function getMyTournaments(req, res) {
    const tournaments = await tournamentService.getMyTournaments(req.user.id);

    res.status(200).json({ success: true, message: 'Tournaments fetched', data: tournaments });
}

async function getMySavedTournaments(req, res) {
    const tournaments = await tournamentService.getSavedTournaments(req.user.id);

    res.status(200).json({ success: true, message: 'Saved tournaments fetched', data: tournaments });
}

async function checkLogin(req, res) {
    const loggedIn = Boolean(req.user);

    res.status(200).json({
        success: true,
        message: loggedIn ? 'Logged in' : 'Not logged in',
        data: { loggedIn, username: loggedIn ? req.user.username : null }
    });
}

export const userController = {
    signup,
    login,
    logout,
    changePassword,
    getUserProfile,
    getMyTournaments,
    getMySavedTournaments,
    checkLogin
}
