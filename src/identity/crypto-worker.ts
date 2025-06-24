// --- Engine Imports ---
import { HardwareBasedEngine } from "./engines/hardware-based.engine";
import { PasswordBasedEngine } from "./engines/password-based.engine";

// --- Type and Interface Imports ---
import { WorkerAction, type ISecurityEngine } from "./interfaces";
import type { AppIdentity, Result } from "../models";

// --- Worker State ---
// This is where we hold the user's unlocked key during a session.
// It's the most precious thing in this worker. It's null until a successful unlock.
let unlockedKey: CryptoKey | null = null;
let unlockedIdentity: AppIdentity | null = null;

// --- Engine Instantiation ---
const passwordEngine = new PasswordBasedEngine();
const hardwareEngine = new HardwareBasedEngine();

/**
 * The main entry point for the worker. This function listens for messages from the
 * main thread and acts as a router, directing requests to the correct engine or action.
 */
self.onmessage = async (event: MessageEvent) => {
  const { action, payload, engineType } = event.data;

  try {
    let result: Result<any>;

    // A map to select the correct engine. Clean and simple.
    const engine: ISecurityEngine =
      engineType === "hardware-based" ? hardwareEngine : passwordEngine;

    switch (action) {
      case WorkerAction.DoesIdentityExist:
        result = await engine.doesIdentityExist();
        break;

      case WorkerAction.CreateIdentity:
        result = await (engine as PasswordBasedEngine).createIdentity(payload);
        if (result.success) {
          unlockedKey = result.data.key;
          unlockedIdentity = result.data;
        }
        break;

      case WorkerAction.UnlockIdentity:
        result = await engine.unlockIdentity(payload);
        if (result.success) {
          unlockedKey = result.data.key;
          unlockedIdentity = result.data;
        } else {
          unlockedKey = null;
          unlockedIdentity = null;
        }
        break;

      case WorkerAction.DeleteIdentity:
        result = await engine.deleteIdentity();
        unlockedKey = null;
        unlockedIdentity = null;
        break;

      case WorkerAction.SignPayload:
        if (!unlockedKey) {
          throw new Error("Cannot sign: No identity is currently unlocked.");
        }
        if (!(payload instanceof Uint8Array)) {
          throw new Error("Payload for signing must be a Uint8Array.");
        }

        const signature = await self.crypto.subtle.sign(
          { name: "ECDSA", hash: { name: "SHA-256" } },
          unlockedKey,
          payload,
        );

        result = {
          success: true,
          data: new Uint8Array(signature),
          error: null,
        };
        break;

      // This case was from the old PoC and is now handled by CreateIdentity
      // We keep it here commented as a reference of what was removed.
      // case WorkerAction.CreateHardwareIdentityCrypto:
      //   result = await hardwareEngine.createIdentity(payload);
      //   break;

      default:
        throw new Error(`Unknown action received by CryptoWorker: ${action}`);
    }

    // Send the result back to the main thread, all wrapped up.
    self.postMessage(result);
  } catch (error: any) {
    self.postMessage({
      success: false,
      data: null,
      error: { name: "CryptoWorkerError", message: error.message },
    });
  }
};
