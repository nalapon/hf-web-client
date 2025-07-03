
import { describe, it, expect } from "vitest";
import { buildProposalPayload } from "./builder";
import type { ProposalParams } from "../models";
import { fromBinary } from "@bufbuild/protobuf";
import { ProposalSchema, ChaincodeProposalPayloadSchema, ChaincodeHeaderExtensionSchema } from "../generated_protos/peer/proposal_pb";
import { HeaderSchema, ChannelHeaderSchema, SignatureHeaderSchema } from "../generated_protos/common/common_pb";
import { ChaincodeInvocationSpecSchema } from "../generated_protos/peer/chaincode_pb";

// Helper to convert string to Uint8Array for consistency in tests
const utf8Encoder = new TextEncoder();

/**
 * Test Suite for: buildProposalPayload
 * 
 * Purpose: 
 * To verify that the `buildProposalPayload` function correctly serializes a standard JavaScript object
 * (`ProposalParams`) into the specific binary format required by Hyperledger Fabric for a transaction proposal.
 * 
 * Method:
 * We use a "round-trip" testing strategy. 
 * 1. Serialize: We call our function to create the binary payload.
 * 2. Deserialize: We use the official Protobuf schemas to parse the binary payload back into a structured object.
 * 3. Assert: We check that the fields of the deserialized object match our original inputs.
 * 
 * This confirms that our serialization logic is perfectly aligned with the Fabric Protobuf definitions.
 */
describe("buildProposalPayload", () => {

  it("should correctly serialize a standard transaction proposal with string arguments", () => {
    // --- 1. ARRANGE ---
    // We define a standard set of inputs that represent a typical chaincode invocation.
    const params: ProposalParams = {
      mspId: "Org1MSP",
      channelName: "mychannel",
      chaincodeName: "mychaincode",
      functionName: "invoke",
      args: ["arg1", "arg2"],
    };
    const txId = "a_mock_transaction_id";
    const nonce = utf8Encoder.encode("a_mock_nonce");
    const creatorBytes = utf8Encoder.encode("a_mock_creator_identity");

    // --- 2. ACT ---
    // We call the function under test to get the binary output.
    const proposalPayloadBytes = buildProposalPayload(params, txId, creatorBytes, nonce);

    // --- 3. ASSERT ---
    // We perform a series of checks to validate the serialized output.

    // Basic sanity check: The output should be a non-empty byte array.
    expect(proposalPayloadBytes).toBeInstanceOf(Uint8Array);
    expect(proposalPayloadBytes.length).toBeGreaterThan(0);

    // --- Round-Trip Deserialization ---
    // This is the core of our test. We parse the binary data back into a structured object.
    const proposal = fromBinary(ProposalSchema, proposalPayloadBytes);

    // Correctly deserialize the nested byte arrays
    const header = fromBinary(HeaderSchema, proposal.header);
    const signatureHeader = fromBinary(SignatureHeaderSchema, header.signatureHeader);
    const channelHeader = fromBinary(ChannelHeaderSchema, header.channelHeader);
    const chaincodeHeaderExtension = fromBinary(ChaincodeHeaderExtensionSchema, channelHeader.extension);
    
    const chaincodeProposalPayload = fromBinary(ChaincodeProposalPayloadSchema, proposal.payload);
    const chaincodeInvocationSpec = fromBinary(ChaincodeInvocationSpecSchema, chaincodeProposalPayload.input);
    const chaincodeSpec = chaincodeInvocationSpec.chaincodeSpec;
    const input = chaincodeSpec?.input;

    // Assertions
    expect(Array.from(signatureHeader.nonce)).toEqual(Array.from(nonce));
    expect(Array.from(signatureHeader.creator)).toEqual(Array.from(creatorBytes));
    expect(channelHeader.channelId).toBe(params.channelName);
    expect(channelHeader.txId).toBe(txId);
    expect(chaincodeHeaderExtension.chaincodeId?.name).toBe(params.chaincodeName);
    expect(chaincodeSpec?.chaincodeId?.name).toBe(params.chaincodeName);
    expect(input).toBeDefined();
    expect(new TextDecoder().decode(input!.args[0])).toBe(params.functionName);
    expect(new TextDecoder().decode(input!.args[1])).toBe(params.args?.[0] ?? "");
    expect(new TextDecoder().decode(input!.args[2])).toBe(params.args?.[1] ?? "");
  });

  it("should correctly serialize a proposal with Uint8Array arguments", () => {
    // --- 1. ARRANGE ---
    // Create arguments as Uint8Arrays, simulating binary data.
    const arg1 = utf8Encoder.encode("binary_arg_one");
    const arg2 = new Uint8Array([0, 1, 2, 3, 4, 5]);

    const params: ProposalParams = {
      mspId: "Org1MSP",
      channelName: "mychannel",
      chaincodeName: "mychaincode",
      functionName: "invokeWithBinary",
      args: [arg1, arg2],
    };
    const txId = "a_second_mock_tx_id";
    const nonce = utf8Encoder.encode("a_second_mock_nonce");
    const creatorBytes = utf8Encoder.encode("a_second_mock_creator");

    // --- 2. ACT ---
    const proposalPayloadBytes = buildProposalPayload(params, txId, creatorBytes, nonce);

    // --- 3. ASSERT ---
    const proposal = fromBinary(ProposalSchema, proposalPayloadBytes);
    const chaincodeProposalPayload = fromBinary(ChaincodeProposalPayloadSchema, proposal.payload);
    const chaincodeInvocationSpec = fromBinary(ChaincodeInvocationSpecSchema, chaincodeProposalPayload.input);
    const input = chaincodeInvocationSpec.chaincodeSpec?.input;

    expect(input).toBeDefined();
    // The first argument is always the function name
    expect(new TextDecoder().decode(input!.args[0])).toBe(params.functionName);
    // The rest of the arguments should be the raw byte arrays we passed in.
    expect(Array.from(input!.args[1])).toEqual(Array.from(arg1));
    expect(Array.from(input!.args[2])).toEqual(Array.from(arg2));
  });
});
