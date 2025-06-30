/** @vitest-environment node */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { IdentityService } from "../src";
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import { testCredentials } from "./test-credentials";

describe("Isomorphic Library Tests (Node.js Environment)", () => {
  const identityFilePath = path.join(
    os.tmpdir(),
    "fabric-web-client-identity.json",
  );

  // Clean up the identity file before and after the test run
  beforeAll(async () => {
    await fs.rm(identityFilePath, { force: true });
  });

  afterAll(async () => {
    await fs.rm(identityFilePath, { force: true });
  });

  it("should confirm it is running in a Node.js environment", () => {
    expect(typeof window).toBe("undefined");
  });

  it("should gracefully fail when calling browser-only hardware identity methods", async () => {
    const identityService = new IdentityService();
    const result = await identityService.createHardwareIdentity(
      testCredentials,
    );
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain(
      "Hardware identity is not supported",
    );
  });

  it("should run the full password-based identity lifecycle using FileStore", async () => {
    const identityService = new IdentityService();
    const password = "my-strong-password-123";

    // 1. Check that identity does not exist initially
    let existsResult = await identityService.doesPasswordIdentityExist();
    expect(existsResult.success).toBe(true);
    expect(existsResult.data).toBe(false);

    // 2. Create a new password-based identity
    const createResult = await identityService.createPasswordIdentity({
      ...testCredentials,
      password,
    });

    expect(createResult.success).toBe(true);
    expect(createResult.data?.cert).toBe(testCredentials.certPem);
    expect(createResult.data?.phrase).toBe(password);
    expect(typeof createResult.data?.sign).toBe("function");

    // 3. Check that the identity file was created
    const fileStats = await fs.stat(identityFilePath);
    expect(fileStats.isFile()).toBe(true);

    // 4. Check that identity now exists
    existsResult = await identityService.doesPasswordIdentityExist();
    expect(existsResult.success).toBe(true);
    expect(existsResult.data).toBe(true);

    // 5. Unlock the identity
    const unlockResult = await identityService.unlockIdentity(
      { password },
      "password-based",
    );
    expect(unlockResult.success).toBe(true);
    expect(unlockResult.data?.cert).toBe(testCredentials.certPem);
    expect(typeof unlockResult.data?.sign).toBe("function");

    // 6. Delete the identity
    const deleteResult = await identityService.deleteIdentity("password-based");
    expect(deleteResult.success).toBe(true);

    // 7. Check that identity no longer exists
    existsResult = await identityService.doesPasswordIdentityExist();
    expect(existsResult.success).toBe(true);
    expect(existsResult.data).toBe(false);

    // 8. Check that the identity file was deleted (is now empty)
    const fileContent = await fs.readFile(identityFilePath, "utf-8");
    expect(fileContent.trim()).toBe("");
  });
}); 