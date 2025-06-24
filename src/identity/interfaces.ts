/** The raw, unlocked materials produced by a security engine. INTERNAL USE ONLY. */
export interface UnlockedIdentityData {
  key: CryptoKey;
  cert: string;
}

/** The result of a successful creation, including recovery data. INTERNAL USE ONLY. */
export interface CreatedIdentityData extends UnlockedIdentityData {
  phrase: string;
  recoveryShares: string[];
}

/**
 * The list of secret handshakes our main thread can use to ask the
 * CryptoWorker to do stuff. This is an internal contract.
 * Don't show it to strangers.
 */
export const enum WorkerAction {
  CreateIdentity = "CREATE_IDENTITY",
  CreateHardwareIdentityCrypto = "CREATE_IDENTITY_HW_CRYPTO",
  UnlockIdentity = "UNLOCK_IDENTITY",
  DoesIdentityExist = "DOES_IDENTITY_EXIST",
  DeleteIdentity = "DELETE_IDENTITY",
  SignPayload = "SIGN_PAYLOAD",
}

/**
 * Define la estructura del mensaje enviado desde el servicio al worker.
 */
export interface WorkerRequest {
  action: WorkerAction;
  payload: any;
  engineType: "password-based" | "hardware-based";
}

import type {
  Result,
  PasswordCreateOptions,
  PasswordUnlockOptions,
} from "../models";

export interface ISecurityEngine {
  doesIdentityExist(): Promise<Result<boolean>>;

  createIdentity?(
    options: PasswordCreateOptions,
  ): Promise<Result<CreatedIdentityData>>;

  unlockIdentity(
    options: PasswordUnlockOptions,
  ): Promise<Result<UnlockedIdentityData>>;

  deleteIdentity(): Promise<Result<void>>;
}
