import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { get, set } from "idb-keyval";
import { WorkerAction } from "./interfaces";
import {
  AppIdentity,
  PasswordCreateOptions,
  PasswordCreateResult,
  PasswordUnlockOptions,
  Result,
} from "../models";

function uint8ArrayToBase64Url(array: Uint8Array): string {
  return btoa(String.fromCharCode.apply(null, Array.from(array)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export class IdentityService {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(new URL("./crypto-worker.js", import.meta.url), {
      type: "module",
    });
  }

  private request<T>(
    action: WorkerAction,
    payload: any,
    engineType: "password-base" | "hardware-base",
  ): Promise<Result<T>> {
    return new Promise((resolve) => {
      const handleResponse = (event: MessageEvent) => {
        this.worker.removeEventListener("message", handleResponse);
        resolve(event.data as Result<T>);
      };

      this.worker.addEventListener("message", handleResponse);

      this.worker.postMessage({ action, payload, engineType });
    });
  }

  /**
   * Constructs the active AppIdentity object.
   * @param cert The user's certificate PEM.
   * @returns An AppIdentity object with a live `sign` method.
   */
  private buildActiveIdentity(cert: string): AppIdentity {
    // The `this` here refers to the IdentityService instance.
    const serviceInstance = this;

    return {
      cert: cert,
      // We create the sign method using an arrow function to capture `serviceInstance`.
      // This is the core of the magic. When the user calls `identity.sign()`,
      // it's actually calling back into this service instance.
      sign: async (dataToSign: Uint8Array): Promise<Uint8Array> => {
        const signResult = await serviceInstance.request<Uint8Array>(
          WorkerAction.SignPayload,
          dataToSign,
          // The engineType here doesn't matter for signing, as the key is already
          // unlocked. But we'll just pick one to satisfy the contract.
          "password-base",
        );

        if (!signResult.success) {
          throw signResult.error;
        }
        return signResult.data;
      },
    };
  }

  public doesHardwareIdentityExist(): Promise<Result<boolean>> {
    return this.request(WorkerAction.DoesIdentityExist, null, "hardware-base");
  }

  public doesPasswordIdentityExist(): Promise<Result<boolean>> {
    return this.request(WorkerAction.DoesIdentityExist, null, "password-base");
  }

  public async createPasswordIdentity(
    options: PasswordCreateOptions,
  ): Promise<Result<PasswordCreateResult>> {
    const result = await this.request<any>(
      WorkerAction.CreateIdentity,
      options,
      "password-base",
    );

    if (!result.success) {
      return result;
    }

    // On success, the worker returns the cert, phrase, and shares.
    // We use them to build the complete, active result object.
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

  public async createHardwareIdentity(options: {
    certPem: string;
    keyPem: string;
  }): Promise<Result<PasswordCreateResult>> {
    const cryptoResult = await this.request<PasswordCreateResult>(
      WorkerAction.CreateHardwareIdentityCrypto,
      options,
      "hardware-base",
    );

    if (!cryptoResult.success) {
      return cryptoResult;
    }

    try {
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
        pubKeyCredParams: [{ alg: -7, type: "public-key" as const }], // ES256
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
      await set("hw-fabric-credential-id", attestation.id);

      return cryptoResult;
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: new Error(`WebAuthn registration failed: ${error.message}`),
      };
    }
  }

  public async unlockIdentity(
    options: PasswordUnlockOptions,
    mode: "password-base" | "hardware-base",
  ): Promise<Result<AppIdentity>> {
    // Para el desbloqueo de hardware, primero verificamos la biometría.
    if (mode === "hardware-base") {
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

    // The worker only needs to give us back the certificate. We build the
    // active identity object here in the main thread.
    const activeIdentity = this.buildActiveIdentity(result.data.cert);

    return { success: true, data: activeIdentity, error: null };
  }

  public async verifyBiometrics(): Promise<Result<boolean>> {
    try {
      const rpID = window.location.hostname;
      const credentialId = await get<string>("hw-fabric-credential-id");
      if (!credentialId)
        throw new Error("No hardware credential ID found in storage.");

      const authOptions = {
        challenge: uint8ArrayToBase64Url(
          window.crypto.getRandomValues(new Uint8Array(16)),
        ),
        allowCredentials: [{ id: credentialId, type: "public-key" as const }],
        userVerification: "required" as const,
        rpId: rpID,
      };

      await startAuthentication({ optionsJSON: authOptions });
      return { success: true, data: true, error: null };
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: new Error(`Biometric verification failed: ${error.message}`),
      };
    }
  }
  public deleteIdentity(
    mode: "password-base" | "hardware-base",
  ): Promise<Result<void>> {
    return this.request<void>(WorkerAction.DeleteIdentity, null, mode);
  }
}
