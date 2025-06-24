import { ConnectError } from "@connectrpc/connect";

/**
 * Inspecciona un objeto de error y devuelve el mensaje de error más específico y útil.
 * Está diseñado para "desempaquetar" los detalles de un ConnectError de gRPC.
 *
 * @param error El objeto de error, que puede ser de cualquier tipo.
 * @returns Un string con el mensaje de error más útil que se pudo encontrar.
 */
export function getGroundedError(error: any): string {
  if (error instanceof ConnectError) {
    if (error.details.length === 0) {
      return error.message;
    }

    const specificDetails = error.details
      .map((detail: any) => {
        if (
          detail &&
          typeof detail.value === "object" &&
          detail.value instanceof Uint8Array
        ) {
          try {
            return new TextDecoder().decode(detail.value);
          } catch (e) {
            return "(no se pudo decodificar el detalle en bytes)";
          }
        }
        return null;
      })
      .filter((msg): msg is string => msg !== null)
      .join("; \n");

    return specificDetails || error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
