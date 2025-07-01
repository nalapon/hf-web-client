const isNode = typeof window === "undefined";

/**
 * An isomorphic Base64 encoding function.
 * Uses the browser's built-in `btoa` or Node.js's `Buffer` for server-side encoding.
 * @param str The string to encode.
 */
export function isomorphicBtoa(str: string): string {
  if (isNode) {
    return Buffer.from(str, "binary").toString("base64");
  }
  return btoa(str);
} 