// scripts/generate-protos.mjs
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const PROTOS_SOURCE_DIR = path.join(projectRoot, "fabric-protos");
const PROTOS_REPO_URL = "https://github.com/hyperledger/fabric-protos.git";
const PROTOS_BRANCH = "main";

try {
  console.log("🚀 Starting Protobuf generation. The Buf Schema Registry way.");

  if (!fs.existsSync(PROTOS_SOURCE_DIR)) {
    console.log(
      `📂 Proto source directory not found. Cloning from ${PROTOS_REPO_URL}...`,
    );
    execSync(
      `git clone --depth 1 -b ${PROTOS_BRANCH} ${PROTOS_REPO_URL} "${PROTOS_SOURCE_DIR}"`,
      {
        cwd: projectRoot,
        stdio: "inherit",
      },
    );
  } else {
    console.log("✅ Proto source directory found.");
  }

  console.log(
    "🛠️  Running 'buf generate'. It will download and run the plugins itself...",
  );
  execSync("npx buf generate", {
    cwd: projectRoot,
    stdio: "inherit",
  });

  console.log("\n🎉 The build process can now proceed. Finally.");
} catch (error) {
  console.error("\n❌ Buf generation failed. The error from buf is above.");
  process.exit(1);
}
