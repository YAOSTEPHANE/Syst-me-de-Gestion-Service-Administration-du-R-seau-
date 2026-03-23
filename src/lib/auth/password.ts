import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plainPassword: string) {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

export async function verifyPassword(plainPassword: string, passwordHash: string) {
  return bcrypt.compare(plainPassword, passwordHash);
}
