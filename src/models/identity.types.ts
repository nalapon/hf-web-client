export type Success<T> = { success: true; data: T; error: null };
export type Failure<E = Error> = { success: false; data: null; error: E };
export type Result<T, E = Error> = Success<T> | Failure<E>;

/**
 * Represents an unlocked application identity.
 * This is the "magic wand" the application uses to interact with Fabric.
 * It contains the user's certificate and the CAPABILITY to sign data.
 */
export interface AppIdentity {
  readonly cert: string;
  readonly sign: (dataToSign: Uint8Array) => Promise<Uint8Array>;
}

export interface PasswordCreateOptions {
  certPem: string;
  keyPem: string;
  password?: string;
}

/**
 * The result of a successful identity creation.
 * It extends the AppIdentity with the recovery phrase and shares, which the
 * user MUST save securely.
 */
export interface PasswordCreateResult extends AppIdentity {
  readonly phrase: string;
  readonly recoveryShares: string[];
}

export interface PasswordUnlockOptions {
  password: string;
}
