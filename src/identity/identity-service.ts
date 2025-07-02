import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { WorkerAction } from "./interfaces";
import {
  AppIdentity,
  PasswordCreateOptions,
  PasswordCreateResult,
  PasswordUnlockOptions,
  Result,
} from "../models";
import { CryptoEngine } from "./crypto-engine";
import { tryCatch } from "../utils/try-catch";

function uint8ArrayToBase64Url(array: Uint8Array): string {
  return btoa(String.fromCharCode.apply(null, Array.from(array)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const isNode = typeof window === "undefined";

export class IdentityService {
  private worker: Worker | null = null;
  private engine: CryptoEngine | null = null;

  constructor() {
    if (isNode) {
      this.engine = new CryptoEngine();
    } else {
      this.worker = new Worker(new URL("./crypto-worker.js", import.meta.url), {
        type: "module",
      });
    }
  }

  private request<T>(
    action: WorkerAction,
    payload: any,
    engineType: "password-based" | "hardware-based",
  ): Promise<Result<T>> {
    if (this.engine) {
      // Node.js path: direct engine call
      return this.engine.performAction(action, payload, engineType);
    }
    if (this.worker) {
      // Browser path: use the worker
      return new Promise((resolve) => {
        const handleResponse = (event: MessageEvent) => {
          this.worker!.removeEventListener("message", handleResponse);
          resolve(event.data as Result<T>);
        };
        this.worker!.addEventListener("message", handleResponse);
        this.worker!.postMessage({ action, payload, engineType });
      });
    }
    throw new Error("IdentityService is not initialized correctly.");
  }

  /**
   * Constructs the active AppIdentity object.
   * @param cert The user's certificate PEM.
   * @returns An AppIdentity object with a live `sign` method.
   */
  private buildActiveIdentity(cert: string): AppIdentity {
    const serviceInstance = this;
    return {
      cert: cert,
      sign: async (dataToSign: Uint8Array): Promise<Uint8Array> => {
        const signResult = await serviceInstance.request<Uint8Array>(
          WorkerAction.SignPayload,
          dataToSign,
          "password-based",
        );
        if (!signResult.success) {
          throw signResult.error;
        }
        return signResult.data;
      },
    };
  }

  public doesHardwareIdentityExist(): Promise<Result<boolean>> {
    return this.request(WorkerAction.DoesIdentityExist, null, "hardware-based");
  }

  public doesPasswordIdentityExist(): Promise<Result<boolean>> {
    return this.request(WorkerAction.DoesIdentityExist, null, "password-based");
  }

  public async createPasswordIdentity(
    options: PasswordCreateOptions,
  ): Promise<Result<PasswordCreateResult>> {
    const result = await this.request<any>(
      WorkerAction.CreateIdentity,
      options,
      "password-based",
    );
    if (!result.success) {
      return result;
    }
    const activeIdentity = this.buildActiveIdentity(result.data.cert);
    return {
      success: true,
      data: {
        ...activeIdentity,
        phrase: result.data.phrase,
        recoveryShares: result.data.recoveryShares,
      },
      error: null,
    };
  }

  public async importIdentity(options: {
    keyPem: string;
    certPem: string;
  }): Promise<Result<AppIdentity>> {
    const result = await this.request<{ cert: string }>(
      WorkerAction.ImportIdentity,
      options,
      "password-based",
    );
    if (!result.success) {
      return result;
    }
    const activeIdentity = this.buildActiveIdentity(result.data.cert);
    return { success: true, data: activeIdentity, error: null };
  }

  public async createHardwareIdentity(options: {
    certPem: string;
    keyPem: string;
  }): Promise<Result<PasswordCreateResult>> {
    if (isNode) {
      return {
        success: false,
        data: null,
        error: new Error(
          "Hardware identity is not supported in this environment.",
        ),
      };
    }
    return tryCatch(async () => {
      console.log("REMEMBER: You should use a trusted browser.");
      const rpName = "Fabric Client App";
      const rpID = window.location.hostname;
      const registrationOptions = {
        rp: { name: rpName, id: rpID },
        user: {
          id: uint8ArrayToBase64Url(
            new TextEncoder().encode(`user-${Date.now()}`),
          ),
          name: `user@${rpID}`,
          displayName: "Fabric User",
        },
        challenge: uint8ArrayToBase64Url(
          window.crypto.getRandomValues(new Uint8Array(32)),
        ),
        pubKeyCredParams: [{ alg: -7, type: "public-key" as const }],
        authenticatorSelection: {
          residentKey: "required" as const,
          userVerification: "required" as const,
          authenticatorAttachment: "platform" as const,
        },
        attestation: "none" as const,
      };

      const attestation = await startRegistration({
        optionsJSON: registrationOptions,
      });

      // Now, call the worker to create the identity and store the credential ID.
      const cryptoResult = await this.request<PasswordCreateResult>(
        WorkerAction.CreateIdentity,
        { options, webAuthnCredentialId: attestation.id },
        "hardware-based",
      );

      if (!cryptoResult.success) {
        throw cryptoResult.error;
      }

      // Build the active identity from the successful result.
      const activeIdentity = this.buildActiveIdentity(cryptoResult.data.cert);
      return {
        ...activeIdentity,
        ...cryptoResult.data,
      };
    }, (error) => `WebAuthn registration failed: ${error.message}`);
  }

  public async unlockIdentity(
    options: PasswordUnlockOptions,
    mode: "password-based" | "hardware-based",
  ): Promise<Result<AppIdentity>> {
    if (mode === "hardware-based") {
      const bioResult = await this.verifyBiometrics();
      if (!bioResult.success) {
        return { success: false, data: null, error: bioResult.error };
      }
    }

    const result = await this.request<{ cert: string }>(
      WorkerAction.UnlockIdentity,
      options,
      mode,
    );
    if (!result.success) {
      return result;
    }
    const activeIdentity = this.buildActiveIdentity(result.data.cert);
    return { success: true, data: activeIdentity, error: null };
  }

  public async verifyBiometrics(): Promise<Result<boolean>> {
    if (isNode) {
      return {
        success: false,
        data: null,
        error: new Error(
          "Hardware identity is not supported in this environment.",
        ),
      };
    }
    return tryCatch(async () => {
      const rpID = window.location.hostname;

      // Get the credential ID from the secure engine instead of local storage.
      const credIdResult = await this.request<string>(
        WorkerAction.GetHardwareCredentialId,
        null,
        "hardware-based",
      );
      if (!credIdResult.success) throw credIdResult.error;

      const authOptions = {
        challenge: uint8ArrayToBase64Url(
          window.crypto.getRandomValues(new Uint8Array(16)),
        ),
        allowCredentials: [
          { id: credIdResult.data, type: "public-key" as const },
        ],
        userVerification: "required" as const,
        rpId: rpID,
      };

      await startAuthentication({ optionsJSON: authOptions });
      return true;
    }, (error) => `Biometric verification failed: ${error.message}`);
  }

  public deleteIdentity(
    mode: "password-based" | "hardware-based",
  ): Promise<Result<void>> {
    return this.request<void>(WorkerAction.DeleteIdentity, null, mode);
  }
}
