/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll } from "vitest";
import { FabricClient } from "../../src/client/fabric-client";
import { IdentityService } from "../../src/identity/identity-service";
import type { AppIdentity } from "../../src/models";
import * as fs from "fs";
import * as path from "path";

// Test configuration
const GATEWAY_URL = "http://localhost:8088";
const MSP_ID = "Org1MSP";
const CHANNEL_NAME = "mychannel";
const CHAINCODE_NAME = "asset-transfer-basic";

// Paths to crypto material
const CRYPTO_BASE_PATH = path.resolve(
  __dirname,
  "../",
  "../",
  "fabric-samples/test-network/organizations/peerOrganizations/org1.example.com",
);
const ADMIN_CERT_PATH = path.resolve(
  CRYPTO_BASE_PATH,
  "users/Admin@org1.example.com/msp/signcerts/cert.pem",
);
const ADMIN_KEYSTORE_PATH = path.resolve(
  CRYPTO_BASE_PATH,
  "users/Admin@org1.example.com/msp/keystore",
);
const PEER_TLS_CA_CERT_PATH = path.resolve(
  CRYPTO_BASE_PATH,
  "peers/peer0.org1.example.com/tls/ca.crt",
);

function findPrivateKeyFile(keystoreDir: string): string {
  const files = fs.readdirSync(keystoreDir);
  const keyFile = files.find((f) => f.endsWith("_sk"));
  if (!keyFile) {
    throw new Error(`No private key found in ${keystoreDir}`);
  }
  return path.join(keystoreDir, keyFile);
}

describe("FabricClient Integration Tests", () => {
  let client: FabricClient;
  let testIdentity: AppIdentity;

  beforeAll(async () => {
    // --- 1. Set up the client with TLS ---
    const tlsCaCert = fs.readFileSync(PEER_TLS_CA_CERT_PATH, "utf8");
    client = new FabricClient({
      gatewayUrl: GATEWAY_URL,
      wsUrl: "ws://localhost:8088/ws/deliver",
    });

    // --- 2. Load crypto material ---
 
    const certPem = fs.readFileSync(ADMIN_CERT_PATH, "utf8");
    const adminKeyPath = findPrivateKeyFile(ADMIN_KEYSTORE_PATH);
    const keyFileContent = fs.readFileSync(adminKeyPath, "utf8");

    // --- 3. Use IdentityService for onboarding ---
    const identityService = new IdentityService(MSP_ID);
    const password = "integration-test-password";
    const createResult = await identityService.createPasswordIdentity({
      certPem,
      keyPem: keyFileContent,
      password,
    });
    if (!createResult.success) throw createResult.error;
    testIdentity = createResult.data;
  }, 60000);

  it("should successfully evaluate a transaction (GetAllAssets)", async () => {
    const result = await client.evaluateTransaction(
      {
        mspId: MSP_ID,
        channelName: CHANNEL_NAME,
        chaincodeName: CHAINCODE_NAME,
        functionName: "GetAllAssets",
        args: [],
      },
      testIdentity,
    );
    if (!result.success) {
      console.error("[Test] GetAllAssets error:", result.error);
    }
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Array.isArray(result.data.parsedData)).toBe(true);
      // The basic asset-transfer sample chaincode initializes with 6 assets
      expect(result.data.parsedData.length).toBeGreaterThanOrEqual(6);
      console.log(`Found ${result.data.parsedData.length} assets`);
    }
  }, 60000);

  it("should successfully submit and commit a transaction (CreateAsset)", async () => {
    const assetId = `test-asset-${Date.now()}`;
    const color = "blue";
    const size = "10";
    const owner = "integration-test";
    const value = "500";

    const result = await client.submitAndCommit(
      {
        mspId: MSP_ID,
        channelName: CHANNEL_NAME,
        chaincodeName: CHAINCODE_NAME,
        functionName: "CreateAsset",
        args: [assetId, color, size, owner, value],
      },
      testIdentity,
    );
    if (!result.success) {
      console.error("[Test] CreateAsset error:", result.error);
    }
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.txId).toBeDefined();
      console.log(`Transaction submitted with ID: ${result.data.txId}`);
    }

    // Allow time for commit
    await new Promise((r) => setTimeout(r, 3000));

    // Read the asset back to verify commit
    const readResult = await client.evaluateTransaction(
      {
        mspId: MSP_ID,
        channelName: CHANNEL_NAME,
        chaincodeName: CHAINCODE_NAME,
        functionName: "ReadAsset",
        args: [assetId],
      },
      testIdentity,
    );
    if (!readResult.success) {
      console.error("[Test] ReadAsset error:", readResult.error);
    }
    expect(readResult.success).toBe(true);
    if (readResult.success) {
      const asset = readResult.data.parsedData;
      expect(asset.ID).toBe(assetId);
      expect(asset.Color).toBe(color);
      expect(asset.Size).toBe(parseInt(size));
      expect(asset.Owner).toBe(owner);
      expect(asset.AppraisedValue).toBe(parseInt(value));
    }
  }, 90000);

  it("should handle transaction errors gracefully", async () => {
    const result = await client.evaluateTransaction(
      {
        mspId: MSP_ID,
        channelName: CHANNEL_NAME,
        chaincodeName: CHAINCODE_NAME,
        functionName: "NonExistentFunction",
        args: [],
      },
      testIdentity,
    );
    if (result.success) {
      console.error("[Test] NonExistentFunction should have failed but succeeded:", result.data);
    } else {
      console.error("[Test] NonExistentFunction error:", result.error);
    }
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    // Ajusta la expresión regular para aceptar el mensaje real del peer
    expect(result.error?.message).toMatch(/Function NonExistentFunction not found/);
  }, 60000);
});