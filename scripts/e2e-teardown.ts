import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INFRA_DIR = path.resolve(__dirname, "..", "_test-infra");
const SAMPLES_DIR = path.resolve(INFRA_DIR, "fabric-samples");
const TEST_NETWORK_DIR = path.resolve(SAMPLES_DIR, "test-network");

console.log("💣 Starting Total Teardown and Cleanup...");

// 1. Tear down the network
if (fs.existsSync(TEST_NETWORK_DIR)) {
  console.log("🧹 Tearing down the test network...");
  const testEnv = {
    ...process.env,
    PATH: `${path.resolve(SAMPLES_DIR, "bin")}:${process.env.PATH}`,
  };
  execSync("./network.sh down", {
    cwd: TEST_NETWORK_DIR,
    stdio: "inherit",
    env: testEnv,
  });
} else {
  console.log("✅ Network seems to be already down.");
}

// 2. Nuke the entire test infrastructure directory
if (fs.existsSync(INFRA_DIR)) {
  console.log(
    `🔥 Deleting the entire test infrastructure directory: ${INFRA_DIR}`,
  );
  console.warn("WARNING: This is a destructive operation.");
  fs.rmSync(INFRA_DIR, { recursive: true, force: true });
  console.log("✅ Infrastructure directory deleted.");
} else {
  console.log("✅ Infrastructure directory does not exist. Nothing to delete.");
}

console.log("🎉 Teardown complete. Project is in a pristine state.");
