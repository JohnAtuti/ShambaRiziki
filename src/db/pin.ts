import * as Crypto from "expo-crypto";

/**
 * PIN hashing.
 *
 * Threat model: another person picks up the unlocked-but-PIN-protected phone
 * and tries to guess the PIN. The DB is not extracted. Real-world protection
 * comes from the lockout policy (see UserRepo.recordFailedAttempt), not from
 * the hash strength.
 *
 * Iteration count is deliberately modest because every digest round-trips
 * through the JS↔native bridge on expo-crypto. 200 iterations is a
 * reasonable trade: ~100-200ms per verify on a mid-range Android device.
 *
 * We use SHA-256 (available in expo-crypto) because no bcrypt/argon2 is
 * available without adding native modules. If the app later gains a
 * development build, swap this for argon2 — the interface stays the same.
 */
const ITERATIONS = 200;

const digest = async (input: string): Promise<string> =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);

const iterate = async (seed: string): Promise<string> => {
  let current = seed;
  for (let i = 0; i < ITERATIONS; i++) {
    current = await digest(current);
  }
  return current;
};

export interface PinHash {
  hash: string;
  salt: string;
}

export const hashPin = async (pin: string): Promise<PinHash> => {
  if (!pin || pin.length < 4) {
    throw new Error("PIN must be at least 4 characters");
  }
  const salt = Crypto.randomUUID();
  const hash = await iterate(`${salt}:${pin}`);
  return { hash, salt };
};

export const verifyPin = async (
  pin: string,
  storedHash: string,
  storedSalt: string,
): Promise<boolean> => {
  const candidate = await iterate(`${storedSalt}:${pin}`);

  // Constant-time comparison to avoid timing leaks. Lengths must match first
  // because we can't XOR-compare across different lengths.
  if (candidate.length !== storedHash.length) return false;

  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
};
