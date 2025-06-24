import { describe, it, expect, beforeAll } from "vitest";
import { FabricClient } from "../../src/client/fabric-client";
import type { AppIdentity } from "../../src/models";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { webcrypto } from "crypto";

// --- Test Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CRYPTO_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "_test-infra",
  "fabric-samples",
  "test-network",
  "organizations",
  "peerOrganizations",
  "org1.example.com",
);
const CERT_PATH = path.resolve(
  CRYPTO_PATH,
  "users",
  "User1@org1.example.com",
  "msp",
  "signcerts",
  "cert.pem",
);
const KEY_DIR = path.resolve(
  CRYPTO_PATH,
  "users",
  "User1@org1.example.com",
  "msp",
  "keystore",
);
const KEY_FILE = fs.readdirSync(KEY_DIR)[0];
const KEY_PATH = path.resolve(KEY_DIR, KEY_FILE);

const GATEWAY_URL = "http://localhost:8088";

const MSP_ID = "Org1MSP";
const CHANNEL_NAME = "mychannel";
const CHAINCODE_NAME = "basic";

describe("E2E: FabricClient against a live Gateway", () => {
  let testIdentity: AppIdentity;

  beforeAll(async () => {
    const certPem = fs.readFileSync(CERT_PATH, "utf8");
    const keyPem = fs.readFileSync(KEY_PATH, "utf8");

    const subtle = webcrypto.subtle;
    const privateKey = await subtle.importKey(
      "pkcs8",
      Buffer.from(
        keyPem.replace(
          /-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g,
          "",
        ),
        "base64",
      ),
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign"],
    );

    testIdentity = {
      cert: certPem,
      sign: async (dataToSign: Uint8Array): Promise<Uint8Array> => {
        const signature = await subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          privateKey,
          dataToSign,
        );
        return new Uint8Array(signature);
      },
    };
  });

  it("should correctly extract the specific error message from the gateway response", async () => {
    const client = new FabricClient({ gatewayUrl: GATEWAY_URL });
    const expectedErrorMessage =
      "chaincode response 500, Function FunctionThatAbsolutelyDoesNotExist not found in contract SmartContract";

    const result = await client.evaluateTransaction(
      {
        mspId: MSP_ID,
        channelName: CHANNEL_NAME,
        chaincodeName: CHAINCODE_NAME,
        functionName: "FunctionThatAbsolutelyDoesNotExist",
      },
      testIdentity,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(Error);

    expect(result.error?.message).toContain(expectedErrorMessage);
  }, 90000);

  it("should successfully evaluate a valid transaction (GetAllAssets)", async () => {
    const client = new FabricClient({ gatewayUrl: GATEWAY_URL });
    const result = await client.evaluateTransaction(
      {
        mspId: MSP_ID,
        channelName: CHANNEL_NAME,
        chaincodeName: "basic",
        functionName: "GetAllAssets",
        args: [],
      },
      testIdentity,
    );

    expect(
      result.success,
      `GetAllAssets failed with: ${result.error?.message}`,
    ).toBe(true);

    if (result.success) {
      expect(Array.isArray(result.data.parsedData)).toBe(true);
      expect(result.data.parsedData.length).toBeGreaterThan(0);
    }
  });

  it("should successfully prepare, submit, and evaluate a full transaction cycle", async () => {
    const client = new FabricClient({ gatewayUrl: GATEWAY_URL });
    const assetId = `asset_${Date.now()}`;
    const assetValue = "430";

    const prepareResult = await client.prepareTransaction(
      {
        mspId: MSP_ID,
        channelName: CHANNEL_NAME,
        chaincodeName: "basic",
        functionName: "CreateAsset",
        args: [assetId, "blue", "10", "test-owner", assetValue],
      },
      testIdentity,
    );

    expect(
      prepareResult.success,
      `prepareTransaction failed: ${prepareResult.error?.message}`,
    ).toBe(true);
    if (!prepareResult.success) return;
    expect(prepareResult.data?.transactionEnvelope).toBeInstanceOf(Uint8Array);

    const submitResult = await client.submitSignedTransaction(
      {
        channelName: CHANNEL_NAME,
        txId: prepareResult.data!.txId,
        preparedTransaction: prepareResult.data!.transactionEnvelope,
      },
      testIdentity,
    );

    expect(submitResult.success, "submitSignedTransaction should succeed").toBe(
      true,
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const evaluateResult = await client.evaluateTransaction(
      {
        mspId: MSP_ID,
        channelName: CHANNEL_NAME,
        chaincodeName: "basic",
        functionName: "ReadAsset",
        args: [assetId],
      },
      testIdentity,
    );

    expect(
      evaluateResult.success,
      `Final evaluation failed: ${evaluateResult.error?.message}`,
    ).toBe(true);
    if (!evaluateResult.success) return; // Type guard

    expect(evaluateResult.data.parsedData.ID).toBe(assetId);
    expect(evaluateResult.data.parsedData.AppraisedValue).toBe(
      Number(assetValue),
    );
  }, 90000);
});
