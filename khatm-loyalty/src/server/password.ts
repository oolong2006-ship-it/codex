import bcrypt from "bcryptjs";

export const hashPassword = (pw: string) => bcrypt.hash(pw, 11);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
export const hashPin = (pin: string) => bcrypt.hash(pin, 10);
export const verifyPin = (pin: string, hash: string) => bcrypt.compare(pin, hash);
