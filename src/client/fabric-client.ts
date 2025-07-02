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
import { signFabricSignature } from "../crypto/signing";
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
import { EventCallbacks } from "../models/events.types";

export class FabricClient {
  private readonly gatewayClient: Client<typeof Gateway>;
  private readonly eventService: EventService;

  /**
   * This constructor checks where it's running (`typeof window === "undefined"`) and picks the right tool for the job.
   */
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
   * This is the method for when you just want to submit a transaction and be done with it.
   * It wraps the entire Fabric transaction flow (Endorse -> Submit -> Wait for Commit) into a single call.
   * You give it a proposal, and it gives you back the final result or an error.
   * It's doing a lot of heavy lifting (see `prepareTransaction`, `submitSignedTransaction`, `_waitForCommit`) so you don't have to.
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
   * This function polls the Gateway's `commitStatus` endpoint to see if our transaction made it into a block.
   * If the transaction doesn't get a `VALID` status, this is where we throw the error that tells the user something went wrong on the ledger.
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
   * Use this for any read-only operation. If your chaincode function just queries the ledger and doesn't change anything,
   * `evaluate` is your best friend. It sends the proposal to a peer for execution but skips the whole ordering and committing process.
   * It's faster, more efficient, and doesn't clutter the blockchain with unnecessary transactions.
   * Think of it as asking a question, not making a statement.
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

      const signature = await signFabricSignature(proposalPayloadBytes, identity);
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
   * Q: What's the point of `prepareTransaction`? Why not just submit?
   * A: This is the first, crucial step of the Fabric transaction flow: Endorsement.
   *    This method sends the transaction proposal to the peers defined by the endorsement policy.
   *    The peers run the chaincode, simulate the transaction, and send back a signed response (the "endorsement").
   *    You'd use this if you want to inspect the peer responses or collect endorsements manually before sending the transaction to the orderer.
   *    For most cases, `submitAndCommit` is easier, but this gives you more control.
   */
  public async prepareTransaction(
    params: ProposalParams,
    identity: AppIdentity,
  ): Promise<Result<PreparedTransaction>> {
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

      const signature = await signFabricSignature(proposalPayloadBytes, identity);
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
          "The Endorse response did not contain a valid prepared transaction.",
        );
      }

      return {
        txId,
        transactionEnvelope: endorseResponse.preparedTransaction.payload,
      };
    }, getGroundedError);
  }

  /**
   * Q: So I've `prepare`d a transaction. Now what?
   * A: Now you `submit` it! This is the second major step in the flow.
   *    This method takes the `transactionEnvelope` you got from `prepareTransaction`,
   *    signs it one more time with the client's identity, and sends it to the Gateway.
   *    The Gateway then forwards it to the Ordering Service, which will eventually put it in a block.
   *    Note: This method returns as soon as the orderer accepts the transaction; it does NOT wait for it to be committed.
   */
  public async submitSignedTransaction(
    params: SubmitParams,
    identity: AppIdentity,
  ): Promise<Result<SubmittedTransaction>> {
    return tryCatch(async () => {
      const envelopeSignature = await signFabricSignature(
        params.preparedTransaction,
        identity,
      );

      const clientSignedEnvelope = create(EnvelopeSchema, {
        payload: params.preparedTransaction,
        signature: envelopeSignature,
      });

      const submitRequest = create(SubmitRequestSchema, {
        channelId: params.channelName,
        transactionId: params.txId,
        preparedTransaction: clientSignedEnvelope,
      });

      await this.gatewayClient.submit(submitRequest);

      return {
        txId: params.txId,
        status: "Transaction successfully submitted to the gateway.",
      };
    }, getGroundedError);
  }


  // --- Event Methods ---

  /**
   * Q: Why does this exist if we already have `listenToChaincodeEvents`?
   * A: Because `for await...of` loops are cool, but sometimes you just want to say:
   *    "Here's a function for the data, here's one for errors. Call them when you need to."
   *    This method provides that classic, friendly callback pattern. It uses the `AsyncGenerator`
   *    under the hood but gives you a simpler API to work with.
   *
   * @returns A function that you can call to stop listening. The ultimate "unsubscribe" button.
   */
  public onChaincodeEvent(
    params: ChaincodeEventParams,
    identity: AppIdentity,
    callbacks: EventCallbacks<ChaincodeEventsResponse>,
  ): () => void {
    return this.eventService.onChaincodeEvent(params, identity, callbacks);
  }

  /**
   * Q: Same question as above, but for block events.
   * A: Exactly the same answer! This is the callback-friendly version of `listenToBlockEvents`.
   *    It wraps the `AsyncGenerator` and gives you a simple `onData`/`onError` interface.
   *
   * @returns An "unsubscribe" function. Click it to make the data stop.
   */
  public onBlockEvent(
    params: BlockEventParams,
    identity: AppIdentity,
    callbacks: EventCallbacks<FilteredBlock>,
  ): () => void {
    return this.eventService.onBlockEvent(params, identity, callbacks);
  }
}

