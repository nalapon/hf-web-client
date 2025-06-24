let cryptoModule: Crypto;
if (typeof window === "undefined") {
  cryptoModule = (await import("crypto")).webcrypto as Crypto;
}
/**
Provides a universal, environment-agnostic way to get the SubtleCrypto interface.
This is the cornerstone of our isomorphic strategy. It "just works" everywhere.
*/
export function getSubtleCrypto(): SubtleCrypto {
  if (typeof window !== "undefined" && window.crypto) {
    return window.crypto.subtle;
  }
  if (cryptoModule) {
    return cryptoModule.subtle;
  }
  throw new Error(
    "Unsupported environment: A Web Crypto API implementation is required.",
  );
}
/**
Provides a universal way to get random values.
@param array The array to fill with random bytes.
*/
export function getRandomValues<T extends Uint8Array>(array: T): T {
  if (typeof window !== "undefined" && window.crypto) {
    return window.crypto.getRandomValues(array);
  }
  if (cryptoModule) {
    return cryptoModule.getRandomValues(array);
  }
  throw new Error(
    "Unsupported environment: A Web Crypto API implementation is required.",
  );
}
