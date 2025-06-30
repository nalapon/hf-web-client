import type {
  CreatedIdentityData,
  ISecurityEngine,
  UnlockedIdentityData,
} from "../interfaces";
import type { Result, PasswordUnlockOptions } from "../../models";
import { tryCatch } from "../../utils/try-catch";
import { PasswordBasedEngine } from "./password-based.engine";
import type { IKeyValueStore } from "../storage/ikeystore";

// --- Constants ---
const WEBAUTHN_CREDENTIAL_ID_KEY = "hw-fabric-credential-id";

/**
 * An ISecurityEngine implementation for hardware-backed credentials. It wraps
 * the PasswordBasedEngine, using its encryption logic but unlocking it with a
 * secret derived from a WebAuthn ceremony.
 */
export class HardwareBasedEngine implements ISecurityEngine {
  private readonly store: IKeyValueStore;
  private readonly passwordEngine: PasswordBasedEngine;

  constructor(store: IKeyValueStore, passwordEngine: PasswordBasedEngine) {
    this.store = store;
    this.passwordEngine = passwordEngine;
  }

  /**
   * Creates the cryptographic part of the identity.
   * This method generates a strong mnemonic which will be protected by the
   * hardware key, then delegates the actual encryption and storage to the
   * password-based engine.
   * @param options The user's certificate and private key.
   * @param webAuthnCredentialId The ID from the WebAuthn ceremony, which we now store here.
   */
  public async createIdentity(
    options: { certPem: string; keyPem: string },
    webAuthnCredentialId: string,
  ): Promise<Result<CreatedIdentityData>> {
    // We pass no password, so the underlying engine will create a strong mnemonic.
    const createResult = await this.passwordEngine.createIdentity(options);

    // After successful creation, also store the WebAuthn credential ID.
    if (createResult.success) {
      await this.store.set(WEBAUTHN_CREDENTIAL_ID_KEY, webAuthnCredentialId);
    }
    return createResult;
  }

  /**
   * Checks if a hardware-based identity exists by looking for the WebAuthn credential ID.
   */
  public async doesIdentityExist(): Promise<Result<boolean>> {
    return tryCatch(async () => {
      const credId = await this.store.get(WEBAUTHN_CREDENTIAL_ID_KEY);
      return !!credId;
    });
  }

  /**
   * Retrieves the stored WebAuthn credential ID needed to initiate an authentication ceremony.
   */
  public async getCredentialId(): Promise<Result<string>> {
    return tryCatch(async () => {
      const credId = await this.store.get<string>(WEBAUTHN_CREDENTIAL_ID_KEY);
      if (!credId) {
        throw new Error("Hardware credential ID not found in storage.");
      }
      return credId;
    });
  }

  /**
   * "Unlocks" the identity. This is a pass-through to the password engine's unlock
   * method. The `IdentityService` is responsible for getting the correct
   * "password" (the recovery phrase) via a WebAuthn ceremony *before* calling this.
   */
  public async unlockIdentity(
    options: PasswordUnlockOptions,
  ): Promise<Result<UnlockedIdentityData>> {
    return this.passwordEngine.unlockIdentity(options);
  }

  /**
   * Deletes the hardware identity. This involves deleting both the WebAuthn credential ID
   * and the underlying encrypted data managed by the password engine.
   */
  public async deleteIdentity(): Promise<Result<void>> {
    return tryCatch(async () => {
      await this.store.del(WEBAUTHN_CREDENTIAL_ID_KEY);

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
