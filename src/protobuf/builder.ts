import { create, toBinary, protoInt64 } from "@bufbuild/protobuf";
import { sha256 } from "@noble/hashes/sha2";

// --- Modelos ---
import type { AppIdentity, ProposalParams } from "../models";

// --- Esquemas de Protobuf ---
import {
  ChaincodeProposalPayloadSchema,
  ChaincodeHeaderExtensionSchema,
  ProposalSchema,
} from "../generated_protos/peer/proposal_pb";
import {
  ChaincodeSpec_Type,
  ChaincodeIDSchema,
  ChaincodeInputSchema,
  ChaincodeSpecSchema,
  ChaincodeInvocationSpecSchema,
} from "../generated_protos/peer/chaincode_pb";
import {
  HeaderType,
  ChannelHeaderSchema,
  SignatureHeaderSchema,
  HeaderSchema,
} from "../generated_protos/common/common_pb";
import { SerializedIdentitySchema } from "../generated_protos/msp/identities_pb";
import { getRandomValues } from "../crypto/crypto-provider";

// --- Funciones Helper ---
function stringToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}
function bytesToHexString(bytes: Uint8Array): string {
  return (bytes ?? new Uint8Array()).reduce(
    (s, byte) => s + byte.toString(16).padStart(2, "0"),
    "",
  );
}
function generateNonce(): Uint8Array {
  return getRandomValues(new Uint8Array(24));
}

function createSerializedIdentityBytes(
  mspId: string,
  certPem: string,
): Uint8Array {
  const si = create(SerializedIdentitySchema, {
    mspid: mspId,
    idBytes: stringToUint8Array(certPem),
  });
  return toBinary(SerializedIdentitySchema, si);
}

/**
 * Genera un ID de transacción y los bytes del creador.
 * Estos valores se reutilizan en varias partes de la construcción de la propuesta.
 */
export async function generateTransactionId(
  identity: AppIdentity,
  mspId: string,
) {
  const nonce = generateNonce();
  const creatorBytes = createSerializedIdentityBytes(mspId, identity.cert);

  const combined = new Uint8Array(nonce.length + creatorBytes.length);
  combined.set(nonce);
  combined.set(creatorBytes, nonce.length);

  const hashBytes = sha256(combined);
  const txId = bytesToHexString(hashBytes);

  return { txId, nonce, creatorBytes };
}

/**
 * Construye el payload de una propuesta de chaincode.
 * Este es el array de bytes que será firmado para crear un `SignedProposal`.
 */
export function buildProposalPayload(
  params: ProposalParams,
  txId: string,
  creatorBytes: Uint8Array,
  nonce: Uint8Array,
): Uint8Array {
  const ccId = create(ChaincodeIDSchema, { name: params.chaincodeName });

  const argsAsBytes: Uint8Array[] = [stringToUint8Array(params.functionName)];
  (params.args || []).forEach((arg) => {
    argsAsBytes.push(typeof arg === "string" ? stringToUint8Array(arg) : arg);
  });

  const ccInput = create(ChaincodeInputSchema, { args: argsAsBytes });
  const ccSpec = create(ChaincodeSpecSchema, {
    type: ChaincodeSpec_Type.GOLANG,
    chaincodeId: ccId,
    input: ccInput,
  });
  const ccInvocationSpec = create(ChaincodeInvocationSpecSchema, {
    chaincodeSpec: ccSpec,
  });

  const ccProposalPayload = create(ChaincodeProposalPayloadSchema, {
    input: toBinary(ChaincodeInvocationSpecSchema, ccInvocationSpec),
  });

  const ccHeaderExtension = create(ChaincodeHeaderExtensionSchema, {
    chaincodeId: ccId,
  });

  const channelHeader = create(ChannelHeaderSchema, {
    type: HeaderType.ENDORSER_TRANSACTION,
    version: 1,
    channelId: params.channelName,
    txId: txId,
    epoch: protoInt64.parse(0),
    extension: toBinary(ChaincodeHeaderExtensionSchema, ccHeaderExtension),
  });

  const signatureHeader = create(SignatureHeaderSchema, {
    creator: creatorBytes,
    nonce,
  });

  const header = create(HeaderSchema, {
    channelHeader: toBinary(ChannelHeaderSchema, channelHeader),
    signatureHeader: toBinary(SignatureHeaderSchema, signatureHeader),
  });

  const proposal = create(ProposalSchema, {
    header: toBinary(HeaderSchema, header),
    payload: toBinary(ChaincodeProposalPayloadSchema, ccProposalPayload),
  });

  return toBinary(ProposalSchema, proposal);
}
