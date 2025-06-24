import { ConnectError } from "@connectrpc/connect";

/**
 * Digs into an error object to find the most useful, specific error message.
 * It's especially good at unpacking the gRPC ConnectError black box.
 *
 * @param error The error object, which could be anything.
 * @returns A user-friendly string with the best error message we could find.
 */
export function getGroundedError(error: any): string {
  if (error instanceof ConnectError) {
    if (error.details && error.details.length > 0) {
      const decodedDetails = error.details
        .map((detail) => {
          if (
            detail &&
            "value" in detail &&
            detail.value instanceof Uint8Array
          ) {
            try {
              return new TextDecoder().decode(detail.value);
            } catch (e) {
              return null;
            }
          }
          return null;
        })
        .filter((msg): msg is string => msg !== null);

      if (decodedDetails.length > 0) {
        return decodedDetails.join("; \n");
      }
    }
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
