import { userRepository } from "../repositories/users.repository.js"
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { SESSION_TTL_JWT } from "../config/auth.js";

const saltRounds = 10;
const jwtSecret = process.env.JWT_SECRET;

function issueToken(user) {
    return jwt.sign(
        { id: user.id, username: user.username, email: user.email, admin: user.admin },
        jwtSecret,
        { expiresIn: SESSION_TTL_JWT }
    );
}

async function createUser(username, email, password, confirmPassword) {
    if (password !== confirmPassword) {
        throw new Error("PASSWORDS_DO_NOT_MATCH");
    }
    if (!username || !email || !password) {
        throw new Error("MISSING_FIELDS");
    }
    
    try {
        const hash = await bcrypt.hash(password, saltRounds);
        const user = await userRepository.createUser(username, email, hash);

        return issueToken(user);
    } catch (err) {
        console.error(err);
        throw new Error("USER_CREATION_ERROR");
    }
}

async function loginUser(email, password) {
    if (!email || !password) {
        throw new Error("MISSING_FIELDS");
    }

    let user;
    try {
        user = await userRepository.findUserByEmail(email);
    } catch (err) {
        console.error(err);
        throw new Error("LOGIN_ERROR");
    }

    // Deliberately identical outcomes for "no such user" and "wrong password".
    // Distinguishing them lets an attacker enumerate registered accounts.
    if (!user) {
        throw new Error("INVALID_CREDENTIALS");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        throw new Error("INVALID_CREDENTIALS");
    }

    return issueToken(user);
}

export const userService = {
    createUser,
    loginUser
}