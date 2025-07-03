import type { Result } from "../models";
import { tryCatchSync } from "../utils/try-catch";

import type { EvaluateResponse } from "../generated_protos/gateway/gateway_pb";
import type { Response as PeerResponse } from "../generated_protos/peer/proposal_response_pb";

/**
 * Parses the payload of a chaincode (which is usually a string or JSON) to a useful format.
 */
export function decodeChaincodePayload(
  payloadBytes: Uint8Array | undefined,
): any {
  if (!payloadBytes || payloadBytes.length === 0) {
    return null;
  }
  try {
    const decodedString = new TextDecoder("utf-8", { fatal: true }).decode(
      payloadBytes,
    );
    try {
      // Try to parse as JSON, if it fails, return the string.
      return JSON.parse(decodedString);
    } catch {
      return decodedString;
    }
  } catch {
    // If it's not a valid UTF-8 string, return a hexadecimal representation.
    const hex = Array.from(payloadBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `(binary) 0x${hex}`;
  }
}

/**
 * Parses the response of a `evaluate` call from the gateway.
 */
export function parseEvaluateResponse(
  response: EvaluateResponse | undefined,
): Result<any> {
  return tryCatchSync(() => {
    if (!response || !response.result) {
      throw new Error(
        "The response of evaluate or its 'result' field is missing.",
      );
    }

    const finalResponse = response.result as PeerResponse;
    const parsedData = decodeChaincodePayload(finalResponse.payload);

    return {
      status: finalResponse.status,
      message: finalResponse.message,
      parsedData: parsedData,
    };
  });
}
