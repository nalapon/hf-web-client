import type { Result } from "../models";
import { tryCatchSync } from "../utils/try-catch";

import type { EvaluateResponse } from "../generated_protos/gateway/gateway_pb";
import type { Response as PeerResponse } from "../generated_protos/peer/proposal_response_pb";

/**
 * Parsea el payload de un chaincode (que suele ser un string o JSON) a un formato útil.
 */
function decodeChaincodePayload(payloadBytes: Uint8Array | undefined): any {
  if (!payloadBytes || payloadBytes.length === 0) {
    return "(payload vacío)";
  }
  try {
    const decodedString = new TextDecoder("utf-8", { fatal: true }).decode(
      payloadBytes,
    );
    try {
      // Intenta parsear como JSON, si falla, devuelve el string.
      return JSON.parse(decodedString);
    } catch {
      return decodedString;
    }
  } catch {
    // Si no es un string UTF-8 válido, devuelve una representación hexadecimal.
    const hex = Array.from(payloadBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `(binary) 0x${hex}`;
  }
}

/**
 * Parsea la respuesta de una llamada `evaluate` del gateway.
 */
export function parseEvaluateResponse(
  response: EvaluateResponse | undefined,
): Result<any> {
  return tryCatchSync(() => {
    if (!response || !response.result) {
      throw new Error(
        "La respuesta de evaluate o su campo 'result' están ausentes.",
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
