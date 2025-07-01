import {
  CommitStatusRequestSchema,
  EndorseRequestSchema,
  EvaluateRequestSchema,
  Gateway,
  SignedCommitStatusRequestSchema,
  SubmitRequestSchema,
} from "../generated_protos/gateway/gateway_pb";
import { createClient, type Client } from "@connectrpc/connect";
import { createGrpcWebTransport as createBrowserTransport } from "@connectrpc/connect-web";
import { createGrpcWebTransport as createNodeTransport } from "@connectrpc/connect-node";
import {
  AppIdentity,
  BlockEventParams,
  ChaincodeEventParams,
  EvaluatedTransaction,
  FabricClientConfig,
  PreparedTransaction,
  ProposalParams,
  Result,
  SubmitParams,
  SubmittedTransaction,
} from "../models";
import {
  decodeChaincodePayload,
  parseEvaluateResponse,
} from "../protobuf/parser";
import { create, toBinary } from "@bufbuild/protobuf";
import { SignedProposalSchema } from "../generated_protos/peer/proposal_pb";
import { signFabricSignature, signProposal } from "../crypto/signing";
import {
  buildProposalPayload,
  generateTransactionId,
} from "../protobuf/builder";
import { tryCatch } from "../utils/try-catch";
import { EnvelopeSchema } from "../generated_protos/common/common_pb";
import { getGroundedError } from "../utils/error-parser";
import { EventService } from "../events/event-service";
import { ChaincodeEventsResponse, FilteredBlock } from "../models";

import { createSerializedIdentityBytes } from "../protobuf";
import { TxValidationCode } from "../generated_protos/peer/transaction_pb";

export class FabricClient {
  private readonly gatewayClient: Client<typeof Gateway>;
  private readonly eventService: EventService;

  constructor(config: FabricClientConfig) {
    const isNode = typeof window === "undefined";

    const transport = isNode
      ? createNodeTransport({
          baseUrl: config.gatewayUrl,
          httpVersion: "1.1",
          nodeOptions: {
            ca: config.tlsCaCert ? [config.tlsCaCert] : undefined,
          },
        })
      : createBrowserTransport({
          baseUrl: config.gatewayUrl,
        });

    this.gatewayClient = createClient(Gateway, transport);
    this.eventService = new EventService(config);
  }

  /**
   * Submits a transaction and waits for it to be committed to the ledger.
   * This method abstracts the entire transaction lifecycle (endorse, submit, commit)
   * into a single, synchronous-like call.
   *
   * @param params The details of the transaction proposal.
   * @param identity The client identity to sign the proposal.
   * @returns A Result containing the transaction ID and the payload returned by the chaincode, or an error if the transaction fails at any stage.
   */
  /**
   * Submits a transaction and waits for it to be committed to the ledger.
   * This method abstracts the entire transaction lifecycle (endorse, submit, commit)
   * into a single, synchronous-like call.
   *
   * @param params The details of the transaction proposal.
   * @param identity The client identity to sign the proposal.
   * @returns A Result containing the transaction ID and the payload returned by the chaincode, or an error if the transaction fails at any stage.
   */
  public async submitAndCommit(
    params: ProposalParams,
    identity: AppIdentity,
  ): Promise<Result<{ txId: string; result: any }>> {
    return tryCatch(async () => {
      // --- 1. ENDORSEMENT ---
      const preparedTx = await this.prepareTransaction(params, identity);
      if (!preparedTx.success) {
        throw preparedTx.error;
      }
      const { txId, transactionEnvelope } = preparedTx.data;
      const simulatedResult = decodeChaincodePayload(transactionEnvelope);

      // --- 2. SUBMISSION ---
      await this.submitSignedTransaction(
        {
          txId,
          channelName: params.channelName,
          preparedTransaction: transactionEnvelope,
        },
        identity,
      );

      // --- 3. WAIT FOR COMMIT ---
      await this._waitForCommit(
        params.channelName,
        txId,
        identity,
        params.mspId,
      );

      // --- 4. SUCCESS ---
      return { txId, result: simulatedResult };
    }, getGroundedError);
  }

  /**
   * Waits for a transaction to be committed by the gateway.
   * @private
   */
  private async _waitForCommit(
    channelId: string,
    txId: string,
    identity: AppIdentity,
    mspId: string,
  ): Promise<void> {
    const creator = createSerializedIdentityBytes(mspId, identity.cert);
    const request = create(CommitStatusRequestSchema, {
      channelId,
      transactionId: txId,
      identity: creator,
    });

    const requestBytes = toBinary(CommitStatusRequestSchema, request);
    const signature = await signFabricSignature(requestBytes, identity);

    const signedRequest = create(SignedCommitStatusRequestSchema, {
      request: requestBytes,
      signature,
    });

    const status = await this.gatewayClient.commitStatus(signedRequest);

    if (status.result !== TxValidationCode.VALID) {
      throw new Error(
        `Transaction ${txId} failed to commit with status: ${
          TxValidationCode[status.result]
        } (${status.result})`,
      );
    }
  }

  /**
   * Evalúa una transacción de solo lectura. La propuesta se envía a un peer,
   * pero no se envía al servicio de ordenamiento.
   *
   * @param params Los detalles de la propuesta de transacción.
   * @param identity La identidad del cliente para firmar la propuesta.
   * @returns Un Result con los datos de la transacción evaluada o un error.
   */
  public async evaluateTransaction(
    params: ProposalParams,
    identity: AppIdentity,
  ): Promise<Result<EvaluatedTransaction>> {
    return tryCatch(async () => {
      const { txId, nonce, creatorBytes } = await generateTransactionId(
        identity,
        params.mspId,
      );
      const proposalPayloadBytes = buildProposalPayload(
        params,
        txId,
        creatorBytes,
        nonce,
      );

      const signature = await signProposal(proposalPayloadBytes, identity);
      const signedProposal = create(SignedProposalSchema, {
        proposalBytes: proposalPayloadBytes,
        signature,
      });

      const evaluateRequest = create(EvaluateRequestSchema, {
        channelId: params.channelName,
        transactionId: txId,
        proposedTransaction: signedProposal,
      });

      const evaluateResponse =
        await this.gatewayClient.evaluate(evaluateRequest);

      const parsedResult = parseEvaluateResponse(evaluateResponse);
      if (!parsedResult.success) {
        throw parsedResult.error;
      }

      return { txId, ...parsedResult.data };
    }, getGroundedError);
  }

  /**
   * Prepara (endorsa) una transacción para su posterior envío al orderer.
   * La propuesta se envía a los peers para su endoso según la política.
   *
   * @param params Los detalles de la propuesta de transacción.
   * @param identity La identidad del cliente para firmar la propuesta.
   * @returns Un Result con la transacción preparada (el envelope de la transacción) o un error.
   */
  public async prepareTransaction(
    params: ProposalParams,
    identity: AppIdentity,
  ): Promise<Result<PreparedTransaction>> {
    return tryCatch(async () => {
      // 1. Generar ID, nonce y bytes del creador
      const { txId, nonce, creatorBytes } = await generateTransactionId(
        identity,
        params.mspId,
      );
      const proposalPayloadBytes = buildProposalPayload(
        params,
        txId,
        creatorBytes,
        nonce,
      );

      const signature = await signProposal(proposalPayloadBytes, identity);
      const signedProposal = create(SignedProposalSchema, {
        proposalBytes: proposalPayloadBytes,
        signature,
      });

      const endorseRequest = create(EndorseRequestSchema, {
        channelId: params.channelName,
        transactionId: txId,
        proposedTransaction: signedProposal,
      });

      const endorseResponse = await this.gatewayClient.endorse(endorseRequest);

      if (!endorseResponse.preparedTransaction?.payload) {
        throw new Error(
          "La respuesta del Endorse no contenía una transacción preparada válida.",
        );
      }

      // 4. Devolver la transacción lista para ser firmada y enviada
      return {
        txId,
        transactionEnvelope: endorseResponse.preparedTransaction.payload,
      };
    }, getGroundedError);
  }

  /**
   * Envía una transacción previamente preparada y firmada al orderer para su commit en el ledger.
   *
   * @param params Los detalles de la transacción a enviar, incluyendo el envelope de `prepareTransaction`.
   * @param identity La identidad del cliente para firmar el envelope final.
   * @returns Un Result confirmando el envío exitoso o un error.
   */
  public async submitSignedTransaction(
    params: SubmitParams,
    identity: AppIdentity,
  ): Promise<Result<SubmittedTransaction>> {
    return tryCatch(async () => {
      // 1. Firmar el payload del envelope (el resultado de prepareTransaction)
      const envelopeSignature = await signFabricSignature(
        params.preparedTransaction,
        identity,
      );

      // 2. Construir el envelope final firmado por el cliente
      const clientSignedEnvelope = create(EnvelopeSchema, {
        payload: params.preparedTransaction,
        signature: envelopeSignature,
      });

      // 3. Crear y enviar la petición de submit
      const submitRequest = create(SubmitRequestSchema, {
        channelId: params.channelName,
        transactionId: params.txId,
        preparedTransaction: clientSignedEnvelope,
      });

      await this.gatewayClient.submit(submitRequest);

      return {
        txId: params.txId,
        status: "Transacción enviada con éxito al gateway.",
      };
    }, getGroundedError);
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
  public listenToChaincodeEvents(
    params: ChaincodeEventParams,
    identity: AppIdentity,
    signal: AbortSignal,
  ): AsyncGenerator<ChaincodeEventsResponse> {
    return this.eventService.listenToChaincodeEvents(params, identity, signal);
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
  public listenToBlockEvents(
    params: BlockEventParams,
    identity: AppIdentity,
    signal: AbortSignal,
  ): AsyncGenerator<FilteredBlock> {
    return this.eventService.listenToBlockEvents(params, identity, signal);
  }
}
