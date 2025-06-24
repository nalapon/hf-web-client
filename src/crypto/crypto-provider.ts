import { createRequire } from "module";
const require = createRequire(import.meta.url);

let nodeCrypto: Crypto | undefined;

if (typeof window === "undefined") {
  const { webcrypto } = require("crypto") as { webcrypto: Crypto };
  nodeCrypto = webcrypto;
}

/**
 * Proporciona SubtleCrypto en Browser o Node (síncrono).
 */
export function getSubtleCrypto(): SubtleCrypto {
  if (typeof window !== "undefined" && window.crypto) {
    return window.crypto.subtle;
  }
  if (nodeCrypto) {
    return nodeCrypto.subtle;
  }
  throw new Error(
    "Unsupported environment: A Web Crypto API implementation is required.",
  );
}

/**
 * Proporciona getRandomValues en Browser o Node (síncrono).
 */
export function getRandomValues<T extends Uint8Array>(array: T): T {
  if (typeof window !== "undefined" && window.crypto) {
    return window.crypto.getRandomValues(array);
  }
  if (nodeCrypto) {
    return nodeCrypto.getRandomValues(array);
  }
  throw new Error(
    "Unsupported environment: A Web Crypto API implementation is required.",
  );
}
