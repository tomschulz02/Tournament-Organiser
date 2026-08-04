import { userRepository } from "../repositories/users.repository.js"
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const saltRounds = 10;
const jwtSecret = process.env.JWT_SECRET;

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

        const token = jwt.sign(
            {id: user.id, username: user.username, email: user.email, admin: user.admin},
            jwtSecret,
            { expiresIn: "7d" }
        );

        return token;
    } catch (err) {
        console.error(err);
        throw new Error("USER_CREATION_ERROR");
    }
}

async function loginUser(email, password) {
    if (!email || !password) {
        throw new Error("MISSING_FIELDS");
    }

    try {
        const user = await userRepository.loginUser(email, password);

        const isMatch = await bcrypt.compare(password, user.password);
		
		if (!isMatch) {
			throw new Error("INCORRECT_PASSWORD");
		}

        const token = jwt.sign(
            {id: user.id, username: user.username, email: user.email, admin: user.admin},
            jwtSecret,
            { expiresIn: "7d" }
        );

        return token;
    } catch (err) {
        console.error(err);
        throw new Error("LOGIN_ERROR");
    }
}

export const userService = {
    createUser,
    loginUser
}