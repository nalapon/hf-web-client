import * as jspb from 'google-protobuf'

import * as peer_chaincode_event_pb from '../peer/chaincode_event_pb'; // proto import: "peer/chaincode_event.proto"
import * as peer_proposal_pb from '../peer/proposal_pb'; // proto import: "peer/proposal.proto"
import * as peer_proposal_response_pb from '../peer/proposal_response_pb'; // proto import: "peer/proposal_response.proto"
import * as peer_transaction_pb from '../peer/transaction_pb'; // proto import: "peer/transaction.proto"
import * as common_common_pb from '../common/common_pb'; // proto import: "common/common.proto"
import * as orderer_ab_pb from '../orderer/ab_pb'; // proto import: "orderer/ab.proto"


export class EndorseRequest extends jspb.Message {
  getTransactionId(): string;
  setTransactionId(value: string): EndorseRequest;

  getChannelId(): string;
  setChannelId(value: string): EndorseRequest;

  getProposedTransaction(): peer_proposal_pb.SignedProposal | undefined;
  setProposedTransaction(value?: peer_proposal_pb.SignedProposal): EndorseRequest;
  hasProposedTransaction(): boolean;
  clearProposedTransaction(): EndorseRequest;

  getEndorsingOrganizationsList(): Array<string>;
  setEndorsingOrganizationsList(value: Array<string>): EndorseRequest;
  clearEndorsingOrganizationsList(): EndorseRequest;
  addEndorsingOrganizations(value: string, index?: number): EndorseRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): EndorseRequest.AsObject;
  static toObject(includeInstance: boolean, msg: EndorseRequest): EndorseRequest.AsObject;
  static serializeBinaryToWriter(message: EndorseRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): EndorseRequest;
  static deserializeBinaryFromReader(message: EndorseRequest, reader: jspb.BinaryReader): EndorseRequest;
}

export namespace EndorseRequest {
  export type AsObject = {
    transactionId: string,
    channelId: string,
    proposedTransaction?: peer_proposal_pb.SignedProposal.AsObject,
    endorsingOrganizationsList: Array<string>,
  }
}

export class EndorseResponse extends jspb.Message {
  getPreparedTransaction(): common_common_pb.Envelope | undefined;
  setPreparedTransaction(value?: common_common_pb.Envelope): EndorseResponse;
  hasPreparedTransaction(): boolean;
  clearPreparedTransaction(): EndorseResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): EndorseResponse.AsObject;
  static toObject(includeInstance: boolean, msg: EndorseResponse): EndorseResponse.AsObject;
  static serializeBinaryToWriter(message: EndorseResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): EndorseResponse;
  static deserializeBinaryFromReader(message: EndorseResponse, reader: jspb.BinaryReader): EndorseResponse;
}

export namespace EndorseResponse {
  export type AsObject = {
    preparedTransaction?: common_common_pb.Envelope.AsObject,
  }
}

export class SubmitRequest extends jspb.Message {
  getTransactionId(): string;
  setTransactionId(value: string): SubmitRequest;

  getChannelId(): string;
  setChannelId(value: string): SubmitRequest;

  getPreparedTransaction(): common_common_pb.Envelope | undefined;
  setPreparedTransaction(value?: common_common_pb.Envelope): SubmitRequest;
  hasPreparedTransaction(): boolean;
  clearPreparedTransaction(): SubmitRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): SubmitRequest.AsObject;
  static toObject(includeInstance: boolean, msg: SubmitRequest): SubmitRequest.AsObject;
  static serializeBinaryToWriter(message: SubmitRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): SubmitRequest;
  static deserializeBinaryFromReader(message: SubmitRequest, reader: jspb.BinaryReader): SubmitRequest;
}

export namespace SubmitRequest {
  export type AsObject = {
    transactionId: string,
    channelId: string,
    preparedTransaction?: common_common_pb.Envelope.AsObject,
  }
}

export class SubmitResponse extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): SubmitResponse.AsObject;
  static toObject(includeInstance: boolean, msg: SubmitResponse): SubmitResponse.AsObject;
  static serializeBinaryToWriter(message: SubmitResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): SubmitResponse;
  static deserializeBinaryFromReader(message: SubmitResponse, reader: jspb.BinaryReader): SubmitResponse;
}

export namespace SubmitResponse {
  export type AsObject = {
  }
}

export class SignedCommitStatusRequest extends jspb.Message {
  getRequest(): Uint8Array | string;
  getRequest_asU8(): Uint8Array;
  getRequest_asB64(): string;
  setRequest(value: Uint8Array | string): SignedCommitStatusRequest;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): SignedCommitStatusRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): SignedCommitStatusRequest.AsObject;
  static toObject(includeInstance: boolean, msg: SignedCommitStatusRequest): SignedCommitStatusRequest.AsObject;
  static serializeBinaryToWriter(message: SignedCommitStatusRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): SignedCommitStatusRequest;
  static deserializeBinaryFromReader(message: SignedCommitStatusRequest, reader: jspb.BinaryReader): SignedCommitStatusRequest;
}

export namespace SignedCommitStatusRequest {
  export type AsObject = {
    request: Uint8Array | string,
    signature: Uint8Array | string,
  }
}

export class CommitStatusRequest extends jspb.Message {
  getTransactionId(): string;
  setTransactionId(value: string): CommitStatusRequest;

  getChannelId(): string;
  setChannelId(value: string): CommitStatusRequest;

  getIdentity(): Uint8Array | string;
  getIdentity_asU8(): Uint8Array;
  getIdentity_asB64(): string;
  setIdentity(value: Uint8Array | string): CommitStatusRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): CommitStatusRequest.AsObject;
  static toObject(includeInstance: boolean, msg: CommitStatusRequest): CommitStatusRequest.AsObject;
  static serializeBinaryToWriter(message: CommitStatusRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): CommitStatusRequest;
  static deserializeBinaryFromReader(message: CommitStatusRequest, reader: jspb.BinaryReader): CommitStatusRequest;
}

export namespace CommitStatusRequest {
  export type AsObject = {
    transactionId: string,
    channelId: string,
    identity: Uint8Array | string,
  }
}

export class CommitStatusResponse extends jspb.Message {
  getResult(): peer_transaction_pb.TxValidationCode;
  setResult(value: peer_transaction_pb.TxValidationCode): CommitStatusResponse;

  getBlockNumber(): number;
  setBlockNumber(value: number): CommitStatusResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): CommitStatusResponse.AsObject;
  static toObject(includeInstance: boolean, msg: CommitStatusResponse): CommitStatusResponse.AsObject;
  static serializeBinaryToWriter(message: CommitStatusResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): CommitStatusResponse;
  static deserializeBinaryFromReader(message: CommitStatusResponse, reader: jspb.BinaryReader): CommitStatusResponse;
}

export namespace CommitStatusResponse {
  export type AsObject = {
    result: peer_transaction_pb.TxValidationCode,
    blockNumber: number,
  }
}

export class EvaluateRequest extends jspb.Message {
  getTransactionId(): string;
  setTransactionId(value: string): EvaluateRequest;

  getChannelId(): string;
  setChannelId(value: string): EvaluateRequest;

  getProposedTransaction(): peer_proposal_pb.SignedProposal | undefined;
  setProposedTransaction(value?: peer_proposal_pb.SignedProposal): EvaluateRequest;
  hasProposedTransaction(): boolean;
  clearProposedTransaction(): EvaluateRequest;

  getTargetOrganizationsList(): Array<string>;
  setTargetOrganizationsList(value: Array<string>): EvaluateRequest;
  clearTargetOrganizationsList(): EvaluateRequest;
  addTargetOrganizations(value: string, index?: number): EvaluateRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): EvaluateRequest.AsObject;
  static toObject(includeInstance: boolean, msg: EvaluateRequest): EvaluateRequest.AsObject;
  static serializeBinaryToWriter(message: EvaluateRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): EvaluateRequest;
  static deserializeBinaryFromReader(message: EvaluateRequest, reader: jspb.BinaryReader): EvaluateRequest;
}

export namespace EvaluateRequest {
  export type AsObject = {
    transactionId: string,
    channelId: string,
    proposedTransaction?: peer_proposal_pb.SignedProposal.AsObject,
    targetOrganizationsList: Array<string>,
  }
}

export class EvaluateResponse extends jspb.Message {
  getResult(): peer_proposal_response_pb.Response | undefined;
  setResult(value?: peer_proposal_response_pb.Response): EvaluateResponse;
  hasResult(): boolean;
  clearResult(): EvaluateResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): EvaluateResponse.AsObject;
  static toObject(includeInstance: boolean, msg: EvaluateResponse): EvaluateResponse.AsObject;
  static serializeBinaryToWriter(message: EvaluateResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): EvaluateResponse;
  static deserializeBinaryFromReader(message: EvaluateResponse, reader: jspb.BinaryReader): EvaluateResponse;
}

export namespace EvaluateResponse {
  export type AsObject = {
    result?: peer_proposal_response_pb.Response.AsObject,
  }
}

export class SignedChaincodeEventsRequest extends jspb.Message {
  getRequest(): Uint8Array | string;
  getRequest_asU8(): Uint8Array;
  getRequest_asB64(): string;
  setRequest(value: Uint8Array | string): SignedChaincodeEventsRequest;

  getSignature(): Uint8Array | string;
  getSignature_asU8(): Uint8Array;
  getSignature_asB64(): string;
  setSignature(value: Uint8Array | string): SignedChaincodeEventsRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): SignedChaincodeEventsRequest.AsObject;
  static toObject(includeInstance: boolean, msg: SignedChaincodeEventsRequest): SignedChaincodeEventsRequest.AsObject;
  static serializeBinaryToWriter(message: SignedChaincodeEventsRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): SignedChaincodeEventsRequest;
  static deserializeBinaryFromReader(message: SignedChaincodeEventsRequest, reader: jspb.BinaryReader): SignedChaincodeEventsRequest;
}

export namespace SignedChaincodeEventsRequest {
  export type AsObject = {
    request: Uint8Array | string,
    signature: Uint8Array | string,
  }
}

export class ChaincodeEventsRequest extends jspb.Message {
  getChannelId(): string;
  setChannelId(value: string): ChaincodeEventsRequest;

  getChaincodeId(): string;
  setChaincodeId(value: string): ChaincodeEventsRequest;

  getIdentity(): Uint8Array | string;
  getIdentity_asU8(): Uint8Array;
  getIdentity_asB64(): string;
  setIdentity(value: Uint8Array | string): ChaincodeEventsRequest;

  getStartPosition(): orderer_ab_pb.SeekPosition | undefined;
  setStartPosition(value?: orderer_ab_pb.SeekPosition): ChaincodeEventsRequest;
  hasStartPosition(): boolean;
  clearStartPosition(): ChaincodeEventsRequest;

  getAfterTransactionId(): string;
  setAfterTransactionId(value: string): ChaincodeEventsRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ChaincodeEventsRequest.AsObject;
  static toObject(includeInstance: boolean, msg: ChaincodeEventsRequest): ChaincodeEventsRequest.AsObject;
  static serializeBinaryToWriter(message: ChaincodeEventsRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ChaincodeEventsRequest;
  static deserializeBinaryFromReader(message: ChaincodeEventsRequest, reader: jspb.BinaryReader): ChaincodeEventsRequest;
}

export namespace ChaincodeEventsRequest {
  export type AsObject = {
    channelId: string,
    chaincodeId: string,
    identity: Uint8Array | string,
    startPosition?: orderer_ab_pb.SeekPosition.AsObject,
    afterTransactionId: string,
  }
}

export class ChaincodeEventsResponse extends jspb.Message {
  getEventsList(): Array<peer_chaincode_event_pb.ChaincodeEvent>;
  setEventsList(value: Array<peer_chaincode_event_pb.ChaincodeEvent>): ChaincodeEventsResponse;
  clearEventsList(): ChaincodeEventsResponse;
  addEvents(value?: peer_chaincode_event_pb.ChaincodeEvent, index?: number): peer_chaincode_event_pb.ChaincodeEvent;

  getBlockNumber(): number;
  setBlockNumber(value: number): ChaincodeEventsResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ChaincodeEventsResponse.AsObject;
  static toObject(includeInstance: boolean, msg: ChaincodeEventsResponse): ChaincodeEventsResponse.AsObject;
  static serializeBinaryToWriter(message: ChaincodeEventsResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ChaincodeEventsResponse;
  static deserializeBinaryFromReader(message: ChaincodeEventsResponse, reader: jspb.BinaryReader): ChaincodeEventsResponse;
}

export namespace ChaincodeEventsResponse {
  export type AsObject = {
    eventsList: Array<peer_chaincode_event_pb.ChaincodeEvent.AsObject>,
    blockNumber: number,
  }
}

export class ErrorDetail extends jspb.Message {
  getAddress(): string;
  setAddress(value: string): ErrorDetail;

  getMspId(): string;
  setMspId(value: string): ErrorDetail;

  getMessage(): string;
  setMessage(value: string): ErrorDetail;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ErrorDetail.AsObject;
  static toObject(includeInstance: boolean, msg: ErrorDetail): ErrorDetail.AsObject;
  static serializeBinaryToWriter(message: ErrorDetail, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ErrorDetail;
  static deserializeBinaryFromReader(message: ErrorDetail, reader: jspb.BinaryReader): ErrorDetail;
}

export namespace ErrorDetail {
  export type AsObject = {
    address: string,
    mspId: string,
    message: string,
  }
}

export class ProposedTransaction extends jspb.Message {
  getTransactionId(): string;
  setTransactionId(value: string): ProposedTransaction;

  getProposal(): peer_proposal_pb.SignedProposal | undefined;
  setProposal(value?: peer_proposal_pb.SignedProposal): ProposedTransaction;
  hasProposal(): boolean;
  clearProposal(): ProposedTransaction;

  getEndorsingOrganizationsList(): Array<string>;
  setEndorsingOrganizationsList(value: Array<string>): ProposedTransaction;
  clearEndorsingOrganizationsList(): ProposedTransaction;
  addEndorsingOrganizations(value: string, index?: number): ProposedTransaction;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ProposedTransaction.AsObject;
  static toObject(includeInstance: boolean, msg: ProposedTransaction): ProposedTransaction.AsObject;
  static serializeBinaryToWriter(message: ProposedTransaction, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ProposedTransaction;
  static deserializeBinaryFromReader(message: ProposedTransaction, reader: jspb.BinaryReader): ProposedTransaction;
}

export namespace ProposedTransaction {
  export type AsObject = {
    transactionId: string,
    proposal?: peer_proposal_pb.SignedProposal.AsObject,
    endorsingOrganizationsList: Array<string>,
  }
}

export class PreparedTransaction extends jspb.Message {
  getTransactionId(): string;
  setTransactionId(value: string): PreparedTransaction;

  getEnvelope(): common_common_pb.Envelope | undefined;
  setEnvelope(value?: common_common_pb.Envelope): PreparedTransaction;
  hasEnvelope(): boolean;
  clearEnvelope(): PreparedTransaction;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PreparedTransaction.AsObject;
  static toObject(includeInstance: boolean, msg: PreparedTransaction): PreparedTransaction.AsObject;
  static serializeBinaryToWriter(message: PreparedTransaction, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): PreparedTransaction;
  static deserializeBinaryFromReader(message: PreparedTransaction, reader: jspb.BinaryReader): PreparedTransaction;
}

export namespace PreparedTransaction {
  export type AsObject = {
    transactionId: string,
    envelope?: common_common_pb.Envelope.AsObject,
  }
}

