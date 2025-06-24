import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FABRIC_VERSION = "2.5.5";
const CA_VERSION = "1.5.7";
const INFRA_DIR = path.resolve(__dirname, "..", "_test-infra");
const SAMPLES_DIR = path.resolve(INFRA_DIR, "fabric-samples");
const TEST_NETWORK_DIR = path.resolve(SAMPLES_DIR, "test-network");
const BIN_DIR = path.resolve(SAMPLES_DIR, "bin");
const TEST_ENV = { ...process.env, PATH: `${BIN_DIR}:${process.env.PATH}` };

// --- Helper Functions ---
function runCommand(command: string, cwd: string): void {
  console.log(`\n▶️  Running: "${command}" (in ${cwd})`);
  execSync(command, { cwd, stdio: "inherit", env: TEST_ENV });
}

function checkNetworkUp(): boolean {
  console.log("🔎 Checking if Fabric network is already running...");
  try {
    const dockerPs = execSync('docker ps -f "name=peer0.org1.example.com" -q')
      .toString()
      .trim();
    if (dockerPs !== "") {
      console.log("✅ Network is already up.");
      return true;
    }
  } catch (e) {
    console.warn("Could not check docker status. Assuming network is down.");
  }
  console.log("🚧 Network is down.");
  return false;
}

// --- Main Orchestrator ---
async function main() {
  console.log("🚀 Starting Utopian E2E Test Runner...");

  try {
    if (!fs.existsSync(SAMPLES_DIR)) {
      console.log("--- Phase 1: Setting up fabric-samples ---");
      fs.mkdirSync(INFRA_DIR, { recursive: true });
      const installScriptUrl =
        "https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh";
      runCommand(
        `curl -sSLO ${installScriptUrl} && chmod +x install-fabric.sh`,
        INFRA_DIR,
      );
      runCommand(
        `./install-fabric.sh -f ${FABRIC_VERSION} -c ${CA_VERSION} docker binary samples`,
        INFRA_DIR,
      );
    } else {
      console.log(
        "✅ Step 1: fabric-samples directory already exists. Skipping.",
      );
    }

    if (!checkNetworkUp()) {
      console.log(
        "--- Phase 2: Starting Fabric network and deploying chaincode ---",
      );
      runCommand(
        "./network.sh up createChannel -ca -s couchdb",
        TEST_NETWORK_DIR,
      );
      runCommand(
        "./network.sh deployCC -ccn basic -ccp ../asset-transfer-basic/chaincode-go -ccl go",
        TEST_NETWORK_DIR,
      );

      console.log("--- Phase 3: Initializing the ledger with data ---");
      const invokeCmd = `./peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile \${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem -C mychannel -n basic --peerAddresses localhost:7051 --tlsRootCertFiles \${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt --peerAddresses localhost:9051 --tlsRootCertFiles \${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt -c '{"function":"InitLedger","Args":[]}'`;

      const peerOrg1Env =
        'export CORE_PEER_LOCALMSPID="Org1MSP" && export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt && export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp && export CORE_PEER_ADDRESS=localhost:7051';

      runCommand(`${peerOrg1Env} && ${invokeCmd}`, TEST_NETWORK_DIR);
      console.log("✅ Ledger initialized.");
    } else {
      console.log(
        "✅ Steps 2 & 3: Network is already running. Skipping setup and initialization.",
      );
    }

    console.log("--- Phase 4: Running E2E tests ---");
    runCommand(
      "npx vitest run --config vitest.e2e.config.ts",
      path.resolve(__dirname, ".."),
    );
    console.log("🎉 E2E tests completed!");
  } catch (error: any) {
    console.error(`\n\n❌ E2E process failed!`);
    console.error(error.message);
    process.exit(1);
  }
}

main();
