import { IdentityService } from "../src/identity/identity-service";

// --- Example: Export and Import Identity ---
async function exampleExportImportIdentity() {
  const mspId = "TestMSP";
  const password = "test-password";
  const label = "Test Identity";

  // Create a test instance (in real usage, unlock or create an identity first)
  const service = new IdentityService(mspId);

  // Mock: Patch service to simulate an unlocked identity and password engine
  (service as any).getUnlockedIdentity = async () => ({
    key: {} as CryptoKey,
    cert: "mock-cert",
  });
  (service as any).getPrivateKeyPem = async () => "mock-private-key-pem";
  (service as any).passwordEngine = {
    encryptData: async (data: string, _pw: string) => ({ success: true, data: Buffer.from(data).toString("base64") }),
    decryptData: async (data: string, _pw: string) => ({ success: true, data: Buffer.from(data, "base64").toString("utf8") }),
  };
  (service as any).createPasswordIdentity = async () => ({ success: true, data: {}, error: null });

  // Export identity
  const exportResult = await service.exportIdentity(label, password);
  console.log("Exported Identity:", exportResult);

  // Import identity
  if (exportResult.success) {
    const importResult = await service.importExportedIdentity(exportResult.data, password);
    console.log("Import Result:", importResult);
  }
}

exampleExportImportIdentity().catch(console.error);

// --- Example: Production-like Export and Import Identity Flow ---
// This example assumes you have already created and unlocked an identity using IdentityService.
// It demonstrates how to export and import an identity in a real application scenario.

async function productionExportImportIdentity() {
  // Replace these with your actual MSP ID, label, and password
  const mspId = process.env.MSP_ID || "YourMSP";
  const password = process.env.IDENTITY_PASSWORD || "your-secure-password";
  const label = "My Production Identity";

  // Create the IdentityService instance
  const identityService = new IdentityService(mspId);

  // --- Export the currently unlocked identity ---
  // In a real app, ensure the identity is unlocked (e.g., after login or unlock flow)
  try {
    const exportResult = await identityService.exportIdentity(label, password);
    if (!exportResult.success) {
      console.error("Failed to export identity:", exportResult.error);
      return;
    }
    console.log("[Production] Exported Identity (encrypted):", exportResult.data);

    // --- Import the exported identity ---
    // This could be in a different session, device, or after a reset
    const importResult = await identityService.importExportedIdentity(exportResult.data, password);
    if (!importResult.success) {
      console.error("Failed to import identity:", importResult.error);
      return;
    }
    console.log("[Production] Successfully imported identity.");
  } catch (err) {
    console.error("[Production] Error during export/import flow:", err);
  }
}

// Uncomment to run the production-like example
// productionExportImportIdentity().catch(console.error); 