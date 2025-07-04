// --- Engine Imports ---
import { HardwareBasedEngine } from "./engines/hardware-based.engine";
import { PasswordBasedEngine } from "./engines/password-based.engine";

// --- Storage Imports ---
import { IndexedDBStore } from "./storage/indexeddb-store";
import { FileStore } from "./storage/filestore";
import type { IKeyValueStore } from "./storage/ikeystore";

// --- Type and Interface Imports ---
import { WorkerAction } from "./interfaces";
import type { Result } from "../models";
import * as jose from "jose";
import { getSubtleCrypto } from "../crypto/crypto-provider";
import * as path from "path";

const isNode = typeof window === "undefined";

/**
 * An isomorphic engine that encapsulates all cryptographic operations.
 * It can be run directly in Node.js or wrapped in a Web Worker for the browser.
 */
export class CryptoEngine {
  private unlockedKey: CryptoKey | null = null;
  private unlockedCert: string | null = null;

  // We instantiate the engines and their storage dependencies.
  private readonly passwordEngine: PasswordBasedEngine;
  private readonly hardwareEngine: HardwareBasedEngine;

  constructor() {
    let store: IKeyValueStore;
    if (isNode) {
      // In Node.js, we use a file-based store in the current working directory for persistence.
      const filePath = path.join(
        process.cwd(),
        "fabric-web-client-identity.json",
      );
      store = new FileStore(filePath);
    } else {
      // In the browser, we use IndexedDB.
      store = new IndexedDBStore();
    }
    this.passwordEngine = new PasswordBasedEngine(store);
    this.hardwareEngine = new HardwareBasedEngine(store, this.passwordEngine);
  }

  /**
   * The main entry point for the engine. This method directs requests to the
   * correct internal engine or action based on the message from the service.
   * @param action The operation to perform (e.g., CreateIdentity, SignPayload).
   * @param payload The data required for the action.
   * @param engineType The type of security engine to use ('password-based' or 'hardware-based').
   * @returns A promise that resolves to a Result object.
   */
  public async performAction(
    action: WorkerAction,
    payload: any,
    engineType: "password-based" | "hardware-based",
  ): Promise<Result<any>> {
    try {
      let result: Result<any>;

      // Select the correct engine based on the request.
      const engine =
        engineType === "hardware-based"
          ? this.hardwareEngine
          : this.passwordEngine;

      switch (action) {
        case WorkerAction.DoesIdentityExist:
          result = await engine.doesIdentityExist();
          break;

        case WorkerAction.CreateIdentity:
          // The hardware engine has a slightly different signature for createIdentity
          if (engineType === "hardware-based") {
            const { options, webAuthnCredentialId } = payload;
            result = await (engine as HardwareBasedEngine).createIdentity(
              options,
              webAuthnCredentialId,
            );
          } else {
            result = await (engine as PasswordBasedEngine).createIdentity(
              payload,
            );
          }

          if (result.success) {
            this.unlockedKey = result.data.key;
            this.unlockedCert = result.data.cert;
          }
          break;

        case WorkerAction.ImportIdentity: {
          const { keyPem, certPem } = payload;
          if (!keyPem || !certPem) {
            throw new Error("ImportIdentity requires keyPem and certPem.");
          }
          this.unlockedKey = await jose.importPKCS8(keyPem, "ES256");
          this.unlockedCert = certPem;
          result = { success: true, data: { cert: certPem }, error: null };
          break;
        }

        case WorkerAction.UnlockIdentity:
          result = await engine.unlockIdentity(payload);
          if (result.success) {
            this.unlockedKey = result.data.key;
            this.unlockedCert = result.data.cert;
          } else {
            this.unlockedKey = null;
            this.unlockedCert = null;
          }
          break;

        case WorkerAction.DeleteIdentity:
          result = await engine.deleteIdentity();
          this.unlockedKey = null;
          break;

        case WorkerAction.SignPayload: {
          if (!this.unlockedKey) {
            throw new Error("Cannot sign: No identity is currently unlocked.");
          }
          if (!(payload instanceof Uint8Array)) {
            throw new Error("Payload for signing must be a Uint8Array.");
          }
          const crypto = getSubtleCrypto();
          const signature = await crypto.sign(
            { name: "ECDSA", hash: { name: "SHA-256" } },
            this.unlockedKey,
            payload,
          );
          result = {
            success: true,
            data: new Uint8Array(signature),
            error: null,
          };
          break;
        }

        case WorkerAction.GetHardwareCredentialId:
          if (engineType !== "hardware-based") {
            throw new Error(
              "GetHardwareCredentialId is only valid for hardware-based engines.",
            );
          }
          result = await (engine as HardwareBasedEngine).getCredentialId();
          break;

        case WorkerAction.GetUnlockedIdentity:
          if (!this.unlockedKey || !this.unlockedCert) {
            throw new Error(
              "Cannot get unlocked identity: No identity is currently unlocked.",
            );
          }
          result = {
            success: true,
            data: { key: this.unlockedKey, cert: this.unlockedCert },
            error: null,
          };
          break;

        default:
          throw new Error(`Unknown action received by CryptoEngine: ${action}`);
      }

      return result;
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: new Error(`CryptoEngineError: ${error.message}`),
      };
    }
  }
}
