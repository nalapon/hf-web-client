import { IdentityService, FabricClient } from "../src";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Fabric test network paths
const CRYPTO_BASE_PATH = path.resolve(
  __dirname,
  "..",
  "fabric-samples/test-network/organizations/peerOrganizations/org1.example.com"
);
const ADMIN_CERT_PATH = path.resolve(
  CRYPTO_BASE_PATH,
  "users/Admin@org1.example.com/msp/signcerts/cert.pem"
);
const ADMIN_KEYSTORE_PATH = path.resolve(
  CRYPTO_BASE_PATH,
  "users/Admin@org1.example.com/msp/keystore"
);

function findPrivateKeyFile(keystoreDir: string): string {
  const files = fs.readdirSync(keystoreDir);
  const keyFile = files.find((f) => f.endsWith("_sk"));
  if (!keyFile) throw new Error(`No private key found in ${keystoreDir}`);
  return path.join(keystoreDir, keyFile);
}

const CHANNEL_NAME = "mychannel";
const CHAINCODE_NAME = "basic";
const MSP_ID = "Org1MSP";
const GATEWAY_URL = "http://localhost:8088";

async function main() {
  console.log("--- Fabric Web Client Hello World Example ---");

  // 1. Load credentials from the test network
  const certPem = fs.readFileSync(ADMIN_CERT_PATH, "utf8");
  const adminKeyPath = findPrivateKeyFile(ADMIN_KEYSTORE_PATH);
  const keyFileContent = fs.readFileSync(adminKeyPath, "utf8");
  const keyPem = `-----BEGIN PRIVATE KEY-----\n${keyFileContent}\n-----END PRIVATE KEY-----`;

  // 2. Create an identity service and unlock an identity
  const identityService = new IdentityService();
  const password = "password123"; // In a real app, get this from the user

  const createResult = await identityService.createPasswordIdentity({
    certPem,
    keyPem,
    password,
  });

  if (!createResult.success) {
    throw new Error(`Failed to create identity: ${createResult.error.message}`);
  }
  const appIdentity = createResult.data;
  console.log("Successfully created and unlocked a password-based identity.");

  // 3. Create a Fabric client
  const client = new FabricClient({ 
    gatewayUrl: GATEWAY_URL,
    wsUrl: "ws://localhost:8088/ws/deliver", // Required for event service
  });

  // 4. Evaluate a transaction
  console.log("Evaluating transaction: GetAllAssets...");
  const evaluateResult = await client.evaluateTransaction(
    {
      channelName: CHANNEL_NAME,
      chaincodeName: CHAINCODE_NAME,
      functionName: "GetAllAssets",
      mspId: MSP_ID,
    },
    appIdentity,
  );

  if (!evaluateResult.success) {
    throw new Error(
      `Failed to evaluate transaction: ${evaluateResult.error.message}`,
    );
  }

  console.log("--- Transaction Result ---");
  console.log(JSON.stringify(evaluateResult.data, null, 2));
  console.log("--------------------------");

  console.log("--- Example Complete ---");
}

main().catch((error) => {
  console.error("An error occurred:", error);
  process.exit(1);
});
