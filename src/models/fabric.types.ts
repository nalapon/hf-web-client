export interface FabricClientConfig {
  gatewayUrl: string;
  wsUrl?: string;
  tlsCaCert?: string;
  createTransport?: (opts: { baseUrl: string }) => unknown;
}

interface BaseChaincodeParams {
  mspId: string;
  channelName: string;
  chaincodeName: string;
}

export interface ProposalParams extends BaseChaincodeParams {
  functionName: string;
  args?: (string | Uint8Array)[];
}

export interface SubmitParams {
  channelName: string;
  txId: string;
  preparedTransaction: Uint8Array;
}

export interface EvaluatedTransaction {
  readonly txId: string;
  readonly status: number;
  readonly message: string;
  readonly parsedData: any;
}

export interface PreparedTransaction {
  readonly txId: string;
  readonly transactionEnvelope: Uint8Array;
}

export interface SubmittedTransaction {
  readonly txId: string;
  readonly status: string;
}

import type { ChaincodeEventsResponse } from "../generated_protos/gateway/gateway_pb";

import type { FilteredBlock } from "../generated_protos/peer/events_pb";

export interface EventService {
  mspId: string;
  channelName: string;
  chaincodeName: string;
}

export interface BlockEventParams {
  mspId: string;
  channelName: string;
  targetPeer: string;
  targetHostname: string;
  startBlock?: number;
  stopBlock?: number;
}

export interface ChaincodeEventParams {
  mspId: string;
  channelName: string;
  chaincodeName: string;
}

export type { ChaincodeEventsResponse, FilteredBlock };
