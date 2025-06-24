import {
  EndorseRequestSchema,
  EvaluateRequestSchema,
  Gateway,
  SubmitRequestSchema,
} from "../generated_protos/gateway/gateway_pb";
import { createClient, type Client } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import {
  AppIdentity,
  EvaluatedTransaction,
  FabricClientConfig,
  PreparedTransaction,
  ProposalParams,
  Result,
  SubmitParams,
  SubmittedTransaction,
} from "../models";
import { parseEvaluateResponse } from "../protobuf/parser";
import { create } from "@bufbuild/protobuf";
import { SignedProposalSchema } from "../generated_protos/peer/proposal_pb";
import { signEnvelope, signProposal } from "../crypto/signing";
import {
  buildProposalPayload,
  generateTransactionId,
} from "../protobuf/builder";
import { tryCatch } from "../utils/try-catch";
import { EnvelopeSchema } from "../generated_protos/common/common_pb";
import { getGroundedError } from "../utils/error-parser";

export class FabricClient {
  private readonly gatewayClient: Client<typeof Gateway>;

  constructor(config: FabricClientConfig) {
    const transport = createGrpcWebTransport({ baseUrl: config.gatewayUrl });
    this.gatewayClient = createClient(Gateway, transport);
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
      const envelopeSignature = await signEnvelope(
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
}
