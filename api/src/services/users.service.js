import { userRepository } from "../repositories/users.repository"
import bcrypt from "bcrypt";

const saltRounds = 10;

async function createUser(username, email, password) {
    const hash = await bcrypt.hash(password, saltRounds);
    return await userRepository.createUser(username, email, hash);
}