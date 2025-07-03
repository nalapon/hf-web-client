import { describe, it, expect, vi, beforeEach } from "vitest";
import { IdentityService } from "./identity-service";
import type { ExportedIdentity } from "./interfaces";

// Mocked dependencies
const mockPasswordEngine = {
  encryptData: vi.fn(),
  decryptData: vi.fn(),
};

const mockUnlockedIdentity = {
  key: {} as CryptoKey,
  cert: "mock-cert",
};

const mockPrivateKeyPem = "mock-private-key-pem";
const mockExported: ExportedIdentity = {
  label: "TestLabel",
  mspId: "TestMSP",
  certificate: "mock-cert",
  privateKey: "mock-private-key-pem",
};

// Patch IdentityService to inject mocks
class TestIdentityService extends IdentityService {
  constructor(mspId: string) {
    super(mspId);
    // @ts-ignore
    this.passwordEngine = mockPasswordEngine;
  }
  // @ts-ignore
  async getUnlockedIdentity() { return mockUnlockedIdentity; }
  // @ts-ignore
  async getPrivateKeyPem(_key: CryptoKey) { return mockPrivateKeyPem; }
  // @ts-ignore
  async createPasswordIdentity(_opts: any) { return { success: true, data: {}, error: null }; }
}

describe("IdentityService (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exportIdentity should serialize and encrypt the identity", async () => {
    mockPasswordEngine.encryptData.mockResolvedValue({ success: true, data: "encrypted-string" });
    const service = new TestIdentityService("TestMSP");
    const result = await service.exportIdentity("TestLabel", "pw");
    expect(result.success).toBe(true);
    expect(result.data).toBe("encrypted-string");
    expect(mockPasswordEngine.encryptData).toHaveBeenCalled();
  });

  it("importExportedIdentity should decrypt, validate, and store the identity", async () => {
    mockPasswordEngine.decryptData.mockResolvedValue({ success: true, data: JSON.stringify(mockExported) });
    const service = new TestIdentityService("TestMSP");
    const result = await service.importExportedIdentity("encrypted-string", "pw");
    expect(result.success).toBe(true);
    expect(mockPasswordEngine.decryptData).toHaveBeenCalled();
  });
}); 