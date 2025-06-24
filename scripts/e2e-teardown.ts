import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INFRA_DIR = path.resolve(__dirname, "..", "_test-infra");
const SAMPLES_DIR = path.resolve(INFRA_DIR, "fabric-samples");
const TEST_NETWORK_DIR = path.resolve(SAMPLES_DIR, "test-network");
const BIN_DIR = path.resolve(SAMPLES_DIR, "bin");
const TEST_ENV = { ...process.env, PATH: `${BIN_DIR}:${process.env.PATH}` };

function runCommand(command: string, cwd: string, env = process.env): void {
  console.log(`\n▶️  Running: "${command}" (in ${cwd})`);
  execSync(command, { cwd, stdio: "inherit", env });
}

async function teardown() {
  if (fs.existsSync(TEST_NETWORK_DIR)) {
    console.log("🧹 Tearing down the test network...");
    runCommand("./network.sh down", TEST_NETWORK_DIR, TEST_ENV);
    console.log("✅ Teardown complete.");
  } else {
    console.log("✅ Network seems to be already down. Nothing to do.");
  }
}

console.log("Executing dedicated teardown script...");
teardown().catch((error) => {
  console.error("Teardown script failed:", error.message);
  process.exit(1);
});
