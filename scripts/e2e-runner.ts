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
function runCommand(command: string, cwd: string, env = process.env): void {
  console.log(`\n▶️  Running: "${command}" (in ${cwd})`);
  execSync(command, { cwd, stdio: "inherit", env });
}

function checkNetworkUp(): boolean {
  console.log("🔎 Checking if Fabric network is already running...");
  const dockerPs = execSync('docker ps -f "name=peer0.org1.example.com" -q')
    .toString()
    .trim();
  const isUp = dockerPs !== "";
  if (isUp) {
    console.log("✅ Network is already up and running.");
  } else {
    console.log("🚧 Network is down.");
  }
  return isUp;
}

// --- Main Autonomous Orchestrator ---

async function main() {
  console.log("🚀 Starting Autonomous E2E Test Runner...");
  let networkWasBroughtUpByThisScript = false;

  try {
    // Phase 1: Intelligent Setup
    if (!checkNetworkUp()) {
      networkWasBroughtUpByThisScript = true;
      console.log("--- Executing Full Setup ---");

      console.log("🔎 Checking prerequisites (Docker, Git, Curl)...");
      // Using execSync here is fine as it's a synchronous check.
      if (
        !execSync("command -v docker && command -v git && command -v curl", {
          encoding: "utf8",
        }).trim()
      ) {
        throw new Error(
          "FATAL: Docker, Git, and Curl must be installed and in your PATH.",
        );
      }
      console.log("✅ Prerequisites met.");

      fs.mkdirSync(INFRA_DIR, { recursive: true });

      if (!fs.existsSync(SAMPLES_DIR)) {
        console.log(`📂 Setting up Fabric v${FABRIC_VERSION}...`);
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
      }

      console.log("🌐 Bringing up Hyperledger Fabric test-network...");
      runCommand(
        "./network.sh up createChannel -ca -s couchdb",
        TEST_NETWORK_DIR,
        TEST_ENV,
      );

      console.log('📦 Deploying "asset-transfer-basic" chaincode...');
      runCommand(
        "./network.sh deployCC -ccn basic -ccp ../asset-transfer-basic/chaincode-go -ccl go",
        TEST_NETWORK_DIR,
        TEST_ENV,
      );

      console.log("✅ Setup phase complete.");
    }

    // Phase 2: Test Execution (Always runs)
    console.log("--- Executing Test Suite ---");
    runCommand(
      "npx vitest run --config vitest.e2e.config.ts",
      path.resolve(__dirname, ".."),
    );
    console.log("✅ E2E tests finished.");
  } catch (error: any) {
    console.error(`\n\n❌ E2E process failed!`);
    console.error(error.message);
    // We want the process to exit with a failure code for CI environments.
    process.exitCode = 1;
  } finally {
    // Phase 3: Guaranteed Cleanup
    // We ONLY tear down the network if THIS VERY SCRIPT brought it up.
    // This respects a developer's manually-started network.
    if (networkWasBroughtUpByThisScript) {
      console.log("\n\n--- Executing Guaranteed Teardown ---");
      if (fs.existsSync(TEST_NETWORK_DIR)) {
        console.log(
          "🧹 Tearing down the test network that was started by this script...",
        );
        runCommand("./network.sh down", TEST_NETWORK_DIR, TEST_ENV);
        console.log("✅ Cleanup complete.");
      }
    } else {
      console.log("\n\n--- Skipping Teardown ---");
      console.log(
        "Network was not started by this script, leaving it running as requested.",
      );
    }

    // Ensure the process exits with the correct code if an error occurred.
    if (process.exitCode === 1) {
      console.log("Exiting with failure code.");
    } else {
      console.log("E2E run completed successfully.");
    }
  }
}

main();
