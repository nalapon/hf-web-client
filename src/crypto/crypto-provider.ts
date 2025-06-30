import { createRequire } from "module";
const require = createRequire(import.meta.url);

let crypto: Crypto;

if (typeof self !== "undefined" && self.crypto) {
  crypto = self.crypto;
} else if (typeof window !== "undefined" && window.crypto) {
  crypto = window.crypto;
} else {
  const { webcrypto } = require("crypto") as { webcrypto: Crypto };
  crypto = webcrypto;
}

if (!crypto) {
  throw new Error(
    "Unsupported environment: A Web Crypto API implementation is required.",
  );
}

/**
 * Proporciona SubtleCrypto en cualquier entorno (Browser, Worker, o Node).
 */
export function getSubtleCrypto(): SubtleCrypto {
  return crypto.subtle;
}

/**
 * Proporciona getRandomValues en cualquier entorno (Browser, Worker, o Node).
 */
export function getRandomValues<T extends Uint8Array>(array: T): T {
  return crypto.getRandomValues(array);
}
