import { describe, it, expect } from "vitest";
import { IdentityService } from "../../src/identity/identity-service";
import * as fs from "fs";
import * as path from "path";

// Set MSP_ID from environment or test config as needed
const envMspId = process.env.MSP_ID;
if (!envMspId) {
  throw new Error("MSP_ID must be set in the environment to run this test.");
}
const MSP_ID: string = envMspId;

const CRYPTO_BASE_PATH = path.resolve(
  __dirname,
  "../../fabric-samples/test-network/organizations/peerOrganizations/org1.example.com"
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

describe("IdentityService import/export (integration)", () => {
  it("should export and import a password-based identity end-to-end", async () => {
    const identityService = new IdentityService(MSP_ID);
    const certPem = fs.readFileSync(ADMIN_CERT_PATH, "utf8");
    const adminKeyPath = findPrivateKeyFile(ADMIN_KEYSTORE_PATH);
    const keyFileContent = fs.readFileSync(adminKeyPath, "utf8");
    const keyPem = `-----BEGIN PRIVATE KEY-----\n${keyFileContent}\n-----END PRIVATE KEY-----`;
    const password = "testpassword123";

    // 1. Create identity
    const createResult = await identityService.createPasswordIdentity({
      certPem,
      keyPem,
      password,
    });
    expect(createResult.success).toBe(true);
    const appIdentity = createResult.data;

    // 2. Export identity
    const exportResult = await identityService.exportIdentity("TestLabel", password);
    expect(exportResult.success).toBe(true);
    const exported = exportResult.data;
    expect(typeof exported).toBe("string");

    // 3. Delete identity
    const deleteResult = await identityService.deleteIdentity("password-based");
    expect(deleteResult.success).toBe(true);

    // 4. Import identity
    expect(exported).not.toBeNull();
    const importResult = await identityService.importExportedIdentity(exported!, password);
    expect(importResult.success).toBe(true);

    // 5. Unlock imported identity and verify
    const unlockResult = await identityService.unlockIdentity({ password }, "password-based");
    expect(unlockResult.success).toBe(true);
    expect(unlockResult.data && unlockResult.data.cert).toBe(certPem);
  });
}); 