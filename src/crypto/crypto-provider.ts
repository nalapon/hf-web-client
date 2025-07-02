import { createRequire } from "module";
const require = createRequire(import.meta.url);

let crypto: Crypto;

/**
 * This function provides SubtleCrypto in any environment (Browser, Worker, or Node).
 */
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
  * Q: How do I get a SubtleCrypto instance, no matter where my code runs?
  * A: This function provides SubtleCrypto in any environment (Browser, Worker, or Node).
  */

export function getSubtleCrypto(): SubtleCrypto {
  return crypto.subtle;
}

/**
 * Provides getRandomValues in any environment (Browser, Worker, or Node).
 */
export function getRandomValues<T extends Uint8Array>(array: T): T {
  return crypto.getRandomValues(array);
}
