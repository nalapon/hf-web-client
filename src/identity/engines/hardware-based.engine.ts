import { get, del } from "idb-keyval";
import type {
  CreatedIdentityData,
  ISecurityEngine,
  UnlockedIdentityData,
} from "../interfaces";
import type { Result, PasswordUnlockOptions } from "../../models";
import { tryCatch } from "../../utils/try-catch";
import { PasswordBasedEngine } from "./password-based.engine";

// --- Constants ---
const WEBAUTHN_CREDENTIAL_ID_KEY = "hw-fabric-credential-id";

/**
 * An ISecurityEngine implementation for hardware-backed credentials (like Touch ID, Windows Hello).
 * It's a clever wrapper around the PasswordBasedEngine. It uses the same encrypted
 * storage, but the "password" to unlock it is effectively the user's biometrics,
 * managed by the browser (WebAuthn).
 */
export class HardwareBasedEngine implements ISecurityEngine {
  // Why reinvent the wheel? PasswordEngine has this stuff.
  private passwordEngine = new PasswordBasedEngine();

  /**
   * Creates the cryptographic part of the identity.
   * It just calls the password engine's create method, but without a password,
   * so it will generate a strong mnemonic internally. This mnemonic will be the
   * secret that the hardware key effectively "unlocks".
   */
  public async createIdentity(options: {
    certPem: string;
    keyPem: string;
  }): Promise<Result<CreatedIdentityData>> {
    // We don't pass a password, so the engine will create a strong random one.
    return this.passwordEngine.createIdentity({
      certPem: options.certPem,
      keyPem: options.keyPem,
    });
  }

  /**
   * Checks if a hardware-based identity exists by looking for the WebAuthn credential ID.
   */
  public async doesIdentityExist(): Promise<Result<boolean>> {
    return tryCatch(async () => {
      const credId = await get(WEBAUTHN_CREDENTIAL_ID_KEY);
      return !!credId;
    });
  }

  /**
   * "Unlocks" the identity. This is a bit of a misnomer. The biometric verification
   * happens in the `IdentityService` *before* this is called. This method's job
   * is to use the now-verified "password" (which is actually the recovery phrase)
   * to decrypt the key from storage.
   */
  public async unlockIdentity(
    options: PasswordUnlockOptions,
  ): Promise<Result<UnlockedIdentityData>> {
    // It's just a pass-through to the password engine's unlock method.
    // The `IdentityService` is responsible for getting the correct password (the mnemonic) first.
    return this.passwordEngine.unlockIdentity(options);
  }

  /**
   * Deletes the hardware identity. This involves deleting both the WebAuthn credential ID
   * and the underlying encrypted data managed by the password engine.
   */
  public async deleteIdentity(): Promise<Result<void>> {
    return tryCatch(async () => {
      await del(WEBAUTHN_CREDENTIAL_ID_KEY);

      const deleteResult = await this.passwordEngine.deleteIdentity();
      if (!deleteResult.success) {
        throw deleteResult.error;
      }

      console.log(
        "Hardware-based identity and associated data successfully deleted.",
      );
    });
  }
}
