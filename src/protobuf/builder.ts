import { create, toBinary, protoInt64 } from "@bufbuild/protobuf";
import { sha256 } from "@noble/hashes/sha2";

import type { AppIdentity, ProposalParams } from "../models";

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

// --- Helper Functions ---

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

/**
 * Q: What is a "Serialized Identity" and why do I need to create it?
 * A: In Fabric, you don't just send your name, you send your entire digital identity.
 *    This function takes your MSP ID (like "Org1MSP") and your public certificate,
 *    and packs them into a standardized Protobuf format. This `SerializedIdentity` structure
 *    is the standard way to represent a user in almost every Fabric transaction.
 */
export function createSerializedIdentityBytes(
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
 * Q: What's the deal with generating a transaction ID? Can't I just use a UUID?
 * A: You could, but you'd miss out on some of Fabric's built-in security features.
 *    A Fabric transaction ID is traditionally a hash of the creator's identity combined with a random "nonce" (a number used once).
 *    This does two things:
 *    1. It guarantees the transaction ID is unique.
 *    2. It cryptographically links the transaction ID to the user who created it.
 *    This function follows that best practice, giving you a secure and standard `txId`.
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
 * Q: This function looks... big. What is all this nesting and serializing?
 * A: Welcome to the hellish world of a Fabric transaction! This is where we build the `Proposal` message.
 *    Think of it like packing a shipping container. You have to pack smaller boxes (like `ChaincodeSpec`)
 *    inside bigger boxes (like `Header`), and then put all those inside the main container (`Proposal`).
 *    And because computers talk in binary, every box needs to be sealed (`toBinary`) before it's put inside the next one.
 *    It's complicated, but this precise structure is what every peer and orderer in the network expects to see.
 *    This function is the master packer, ensuring everything is in the right place and sealed up tight.
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
    // Q: Why is the chaincode type hardcoded to GOLANG?
    // A: Great question. While Fabric supports multiple chaincode languages (Go, Node, Java),
    //    the `ChaincodeSpec` requires us to pick one for the type field. GOLANG is the most common
    //    and is a safe default. In the future, we could make this configurable if needed,
    //    but for now, it has no negative impact on running chaincode in other languages.
    //    For many years we had a type called FABCAR, but it was removed in 2.5.0.
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
    epoch: protoInt64.parse(0), // Epoch is a legacy field, typically 0.
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
