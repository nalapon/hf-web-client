import { Client, createClient } from "@connectrpc/connect";
import {
  ChaincodeEventsRequestSchema,
  ChaincodeEventsResponse,
  Gateway,
  SignedChaincodeEventsRequest,
  SignedChaincodeEventsRequestSchema,
} from "../generated_protos/gateway/gateway_pb";
import { DeliverResponseSchema } from "../generated_protos/peer/events_pb";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import {
  AppIdentity,
  BlockEventParams,
  ChaincodeEventParams,
  FabricClientConfig,
  FilteredBlock,
} from "../models";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { EnvelopeSchema } from "../generated_protos/common/common_pb";
import { signProposal } from "../crypto/signing";
import { createSignedDeliverRequest } from "../protobuf/deliver-builder";
import { createSerializedIdentityBytes } from "../protobuf";

// --- Isomorphic WebSocket Helper ---
async function getWebSocketClass() {
  if (typeof window === "undefined") {
    const wsModule = await import("ws");
    return wsModule.default;
  } else {
    return self.WebSocket;
  }
}

export class EventService {
  private readonly gatewayClient: Client<typeof Gateway>;
  private readonly wsBaseUrl: string;

  constructor(config: FabricClientConfig) {
    if (!config.wsUrl) {
      throw new Error(
        "EventService requires a `wsUrl` in the client configuration.",
      );
    }
    const transport = createGrpcWebTransport({ baseUrl: config.gatewayUrl });
    this.gatewayClient = createClient(Gateway, transport);
    this.wsBaseUrl = config.wsUrl;
  }

  /**
   * Establece una conexión para escuchar eventos emitidos por un chaincode específico.
   * Devuelve un Generador Asíncrono que produce respuestas a medida que llegan.
   *
   * @param params Los detalles del canal y chaincode a escuchar.
   * @param identity La identidad del cliente para firmar la petición de eventos.
   * @param signal Un AbortSignal para cancelar la suscripción y cerrar el stream.
   * @yields {ChaincodeEventsResponse} Un objeto de respuesta por cada bloque que contenga eventos.
   */
  public async *listenToChaincodeEvents(
    params: ChaincodeEventParams,
    identity: AppIdentity,
    signal: AbortSignal,
  ): AsyncGenerator<ChaincodeEventsResponse> {
    try {
      const signedRequest = await this.createSignedChaincodeEventsRequest(
        params,
        identity,
      );

      const stream = this.gatewayClient.chaincodeEvents(signedRequest, {
        signal,
      });

      console.log(
        `[EventService] Escuchando eventos para ${params.chaincodeName} en ${params.channelName}...`,
      );

      for await (const response of stream) {
        if (signal.aborted) break;
        yield response;
      }
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        console.log(
          "[EventService] Stream de eventos de chaincode cancelado por el cliente.",
        );
      } else {
        console.error(
          "[EventService] Error en el stream de eventos de chaincode:",
          error,
        );
        throw error; // Propaga el error si no es una cancelación
      }
    } finally {
      console.log(
        `[EventService] Stream para ${params.chaincodeName} finalizado.`,
      );
    }
  }

  /**
   * Establece una conexión WebSocket para escuchar eventos de bloque filtrados de un canal.
   * Devuelve un Generador Asíncrono que produce bloques a medida que son commiteados.
   *
   * @param params Los detalles del canal y peer a escuchar.
   * @param identity La identidad del cliente para firmar la petición de deliver.
   * @param signal Un AbortSignal para cancelar la suscripción y cerrar el WebSocket.
   * @yields {FilteredBlock} Un bloque filtrado cada vez que se commitea uno nuevo.
   */
  public async *listenToBlockEvents(
    params: BlockEventParams,
    identity: AppIdentity,
    signal: AbortSignal,
  ): AsyncGenerator<FilteredBlock> {
    const wsUrl = new URL(this.wsBaseUrl);
    wsUrl.searchParams.append("target", params.targetPeer);
    wsUrl.searchParams.append("hostname", params.targetHostname);

    const signedRequestEnvelope = await createSignedDeliverRequest({
      ...params,
      identity,
    });
    const requestBytes = toBinary(EnvelopeSchema, signedRequestEnvelope);

    const WS = await getWebSocketClass();
    const socket: any = new WS(wsUrl.toString());
    socket.binaryType = "arraybuffer";

    try {
      await this.waitForSocketOpen(socket, signal);
      socket.send(requestBytes);
      console.log(
        `[EventService] Escuchando eventos de bloque en el canal ${params.channelName}...`,
      );

      while (!signal.aborted) {
        const message = await this.waitForSocketMessage(socket, signal);
        const deliverResponse = fromBinary(
          DeliverResponseSchema,
          new Uint8Array(message.data),
        );

        if (deliverResponse.Type.case === "filteredBlock") {
          yield deliverResponse.Type.value;
        } else if (deliverResponse.Type.case === "status") {
          console.warn(
            "[EventService] Mensaje de estado recibido del peer:",
            deliverResponse.Type.value,
          );
        }
      }
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        console.log(
          "[EventService] Stream de eventos de bloque cancelado por el cliente.",
        );
      } else {
        console.error(
          "[EventService] Error en el stream de eventos de bloque:",
          error,
        );
        throw error;
      }
    } finally {
      if (
        socket.readyState === WS.OPEN ||
        socket.readyState === WS.CONNECTING
      ) {
        socket.close(1000, "Stream finished by client");
      }
      console.log(
        `[EventService] Stream de bloques para ${params.channelName} finalizado.`,
      );
    }
  }

  // --- Métodos Privados de Soporte ---

  private async createSignedChaincodeEventsRequest(
    params: ChaincodeEventParams,
    identity: AppIdentity,
  ): Promise<SignedChaincodeEventsRequest> {
    const identityBytes = createSerializedIdentityBytes(
      params.mspId,
      identity.cert,
    );

    const eventsRequest = create(ChaincodeEventsRequestSchema, {
      channelId: params.channelName,
      chaincodeId: params.chaincodeName,
      identity: identityBytes,
    });

    const requestBytes = toBinary(ChaincodeEventsRequestSchema, eventsRequest);
    // Para una petición de eventos, la firma es sobre los bytes de la petición misma.
    const signature = await signProposal(requestBytes, identity);

    return create(SignedChaincodeEventsRequestSchema, {
      request: requestBytes,
      signature: signature,
    });
  }

  private async waitForSocketOpen(
    socket: any,
    signal: AbortSignal,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error("AbortError"));
      const abortHandler = () => {
        socket.close();
        reject(new Error("AbortError"));
      };
      signal.addEventListener("abort", abortHandler, { once: true });

      socket.addEventListener("open", (event: any) => {
        signal.removeEventListener("abort", abortHandler);
        resolve();
      });
      socket.onerror = () => {
        signal.removeEventListener("abort", abortHandler);
        reject(new Error("Fallo al establecer la conexión WebSocket."));
      };
    });
  }

  private async waitForSocketMessage(
    socket: any,
    signal: AbortSignal,
  ): Promise<MessageEvent<ArrayBuffer>> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error("AbortError"));
      const abortHandler = () => reject(new Error("AbortError"));
      signal.addEventListener("abort", abortHandler, { once: true });

      socket.addEventListener("message", (event: any) => {
        signal.removeEventListener("abort", abortHandler);
        resolve(event);
      });
      socket.onclose = (event: any) => {
        signal.removeEventListener("abort", abortHandler);
        reject(
          new Error(
            `WebSocket cerrado inesperadamente: ${event.code} ${event.reason}`,
          ),
        );
      };
      socket.onerror = () => {
        signal.removeEventListener("abort", abortHandler);
        reject(new Error("Error en la conexión WebSocket."));
      };
    });
  }
}
