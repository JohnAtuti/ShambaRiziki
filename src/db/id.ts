import * as Crypto from "expo-crypto";

/**
 * RFC 4122 v4 UUID. Cryptographically secure via expo-crypto.
 * All entity IDs across the app are generated through this function so
 * that offline-created records never collide on future merge.
 */
export const newId = (): string => Crypto.randomUUID();
