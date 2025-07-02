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
  EventCallbacks,
  FabricClientConfig,
  FilteredBlock,
} from "../models";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { EnvelopeSchema } from "../generated_protos/common/common_pb";
import { signFabricSignature } from "../crypto/signing";
import { createSignedDeliverRequest } from "../protobuf/deliver-builder";
import { createSerializedIdentityBytes } from "../protobuf";

/**
 * Q: So, what's the deal with this `consumeAsyncGenerator` function?
 * A: Think of it as a universal adapter. We have these cool, modern `AsyncGenerator` things that spit out data whenever they feel like it.
 *    But lots of people just want a simple, old-school callback (`onData`, `onError`). This function is the bridge.
 *    It takes a generator, runs it in the background, and calls the right callback at the right time.
 *    It's the unsung hero that makes our new `onChaincodeEvent` and `onBlockEvent` methods possible.
 */
async function consumeAsyncGenerator<T>(
  generator: AsyncGenerator<T>,
  callbacks: EventCallbacks<T>,
  signal: AbortSignal,
): Promise<void> {
  try {
    for await (const data of generator) {
      if (signal.aborted) break;
      callbacks.onData(data);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
    } else {
      callbacks.onError(error as Error);
    }
  } finally {
    if (callbacks.onClose) {
      callbacks.onClose();
    }
  }
}

/**
 * Q: What's this `getWebSocketClass` thing?
 * A: In a browser, the WebSocket class is just there, living on the `window` object.
 *    But in Node.js, it doesn't exist. We have to import it from the 'ws' library.
 *    This function is a neat little trick to dynamically grab the right WebSocket implementation depending on where the code is running.
 */
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
   * Q: What is this function doing? And why is it an `async *` thing?
   * A: This is our chaincode event listener. The `async *` syntax creates an AsyncGenerator,
   *    which is a fancy way of saying "a stream of data that you can loop over as it arrives".
   *    It connects to the Fabric Gateway and says, "tell me every time chaincode 'X' does something interesting."
   *    For a simpler, callback-based version, see `onChaincodeEvent`.
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

      for await (const response of stream) {
        if (signal.aborted) break;
        yield response;
      }
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        // This is expected on cancellation, so we don't log an error.
      } else {
        console.error(
          `[EventService] Error in chaincode event stream for ${params.chaincodeName}:`,
          error,
        );
        throw error;
      }
    } finally {
      // The stream is done, either by cancellation, error, or natural completion.
    }
  }

  /**
   * Q: Another `async *` generator? What's different about this one?
   * A: This one is for block events. Instead of talking to the Gateway's gRPC-Web endpoint,
   *    it opens a direct WebSocket connection to a peer's "deliver" service.
   *    The deliver service is the original, canonical way to get blocks from a peer.
   *    This gives us a raw, unfiltered stream of every block as it's committed to the ledger.
   *    It's lower-level and more direct than the Gateway's chaincode event stream.
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
            "[EventService] Status message received from peer:",
            deliverResponse.Type.value,
          );
        }
      }
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        // Expected on cancellation.
      } else {
        console.error(
          `[EventService] Error in block event stream for ${params.channelName}:`,
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
    }
  }

  // --- Callback-based Methods ---

  /**
   * Q: Why does this exist if we already have `listenToChaincodeEvents`?
   * A: Because `for await...of` loops are cool, but sometimes you just want to say:
   *    "Here's a function for the data, here's one for errors. Call them when you need to."
   *    This method provides that classic, friendly callback pattern.
   *
   * @returns A function that you can call to stop listening. The ultimate "unsubscribe" button.
   */
  public onChaincodeEvent(
    params: ChaincodeEventParams,
    identity: AppIdentity,
    callbacks: EventCallbacks<ChaincodeEventsResponse>,
  ): () => void {
    const abortController = new AbortController();

    const generator = this.listenToChaincodeEvents(
      params,
      identity,
      abortController.signal,
    );

    consumeAsyncGenerator(generator, callbacks, abortController.signal);

    return () => {
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
    };
  }

  /**
   * Q: Same question as above, but for block events.
   * A: Exactly the same answer! This is the callback-friendly version of `listenToBlockEvents`.
   *
   * @returns An "unsubscribe" function. Click it to make the data stop.
   */
  public onBlockEvent(
    params: BlockEventParams,
    identity: AppIdentity,
    callbacks: EventCallbacks<FilteredBlock>,
  ): () => void {
    const abortController = new AbortController();

    const generator = this.listenToBlockEvents(
      params,
      identity,
      abortController.signal,
    );

    consumeAsyncGenerator(generator, callbacks, abortController.signal);

    return () => {
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
    };
  }

  // --- Private Support Methods ---

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

    const signature = await signFabricSignature(requestBytes, identity);

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
        reject(new Error("Failed to establish WebSocket connection."));
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
            `WebSocket closed unexpectedly: ${event.code} ${event.reason}`,
          ),
        );
      };
      socket.onerror = () => {
        signal.removeEventListener("abort", abortHandler);
        reject(new Error("Error in WebSocket connection."));
      };
    });
  }
}
