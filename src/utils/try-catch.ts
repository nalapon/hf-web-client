import type { Result } from "../models";
import { getGroundedError } from "./error-parser";

/**
 * A higher-order function that wraps a promise-returning function in a try-catch
 * block. It's our standard way to handle errors gracefully across the library,
 * ensuring we always return a predictable `Result` object.
 * No more raw `throw`s escaping into the wild.
 *
 * @param promiseFn A function that returns a Promise. This is the core logic.
 * @param errorFn An optional, custom error parser. Defaults to our gRPC-aware parser.
 * @returns A Promise that always resolves to a `Result<T>` object.
 */
export async function tryCatch<T>(
  promiseFn: () => Promise<T>,
  errorFn: (error: any) => string = getGroundedError,
): Promise<Result<T>> {
  try {
    const data = await promiseFn();
    return { success: true, data, error: null };
  } catch (caughtError) {
    return {
      success: false,
      data: null,
      error: new Error(errorFn(caughtError)),
    };
  }
}

export function tryCatchSync<T>(fn: () => T): Result<T, Error> {
  try {
    const data = fn();
    return { success: true, data, error: null };
  } catch (caughtError) {
    if (caughtError instanceof Error) {
      return { success: false, data: null, error: caughtError };
    }
    return {
      success: false,
      data: null,
      error: new Error(String(caughtError)),
    };
  }
}
