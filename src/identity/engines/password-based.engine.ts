import { zxcvbn } from "@zxcvbn-ts/core";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { split } from "shamir-secret-sharing";

import * as jose from "jose";
import type {
  CreatedIdentityData,
  ISecurityEngine,
  UnlockedIdentityData,
} from "../interfaces";
import type {
  PasswordCreateOptions,
  PasswordUnlockOptions,
  Result,
} from "../../models";
import { tryCatch } from "../../utils/try-catch";
import { getSubtleCrypto, getRandomValues } from "../../crypto/crypto-provider";
import type { IKeyValueStore } from "../storage/ikeystore";
import { isomorphicBtoa } from "../../utils/isomorphic-helpers";

const DB_KEYS = {
  ENCRYPTED_KEY: "pbe-fabric-encrypted-private-key",
  CERTIFICATE: "pbe-fabric-user-certificate",
  SALT: "pbe-fabric-key-derivation-salt",
  IV: "pbe-fabric-encryption-iv",
};

export class PasswordBasedEngine implements ISecurityEngine {
  private readonly store: IKeyValueStore;

  constructor(store: IKeyValueStore) {
    this.store = store;
  }

  public async doesIdentityExist(): Promise<Result<boolean>> {
    return tryCatch(async () => {
      const allKeys = await this.store.keys();
      return allKeys.includes(DB_KEYS.ENCRYPTED_KEY);
    });
  }

  /**
   * This method creates a new identity using a password.
   * @param options The user's certificate and private key.
   * @returns The created identity data.
   */
  public async createIdentity(
    options: PasswordCreateOptions,
  ): Promise<Result<CreatedIdentityData>> {
    return tryCatch(async () => {
      const secretToUse = options.password || generateMnemonic(wordlist, 128);

      if (options.password) {
        const strength = zxcvbn(options.password);
        if (strength.score < 3) {
          throw new Error(
            "Password is too weak. Please choose a stronger one.",
          );
        }
        if (options.password.length < 8) {
          throw new Error("The password must be at least 8 characters long.");
        }
      }

      const salt = getRandomValues(new Uint8Array(16));
      const iv = getRandomValues(new Uint8Array(12));
      const crypto = getSubtleCrypto();
      const keyMaterial = await this.deriveKeyMaterial(secretToUse, salt);
      const encryptionKey = await crypto.importKey(
        "raw",
        keyMaterial,
        "AES-GCM",
        false,
        ["encrypt"],
      );

      const keyPemBytes = new TextEncoder().encode(options.keyPem);
      const encryptedKeyPem = await crypto.encrypt(
        { name: "AES-GCM", iv },
        encryptionKey,
        keyPemBytes,
      );

      // Guardar los datos de la identidad
      if (
        typeof window === "undefined" &&
        typeof (this.store as any).setMany === "function"
      ) {
        // Node.js: usa setMany para una sola escritura
        await (this.store as any).setMany({
          [DB_KEYS.ENCRYPTED_KEY]: encryptedKeyPem,
          [DB_KEYS.CERTIFICATE]: options.certPem,
          [DB_KEYS.SALT]: salt,
          [DB_KEYS.IV]: iv,
        });
      } else {
        // Navegador: múltiples sets en paralelo
        await Promise.all([
          this.store.set(DB_KEYS.ENCRYPTED_KEY, encryptedKeyPem),
          this.store.set(DB_KEYS.CERTIFICATE, options.certPem),
          this.store.set(DB_KEYS.SALT, salt),
          this.store.set(DB_KEYS.IV, iv),
        ]);
      }

      const signingKey = await jose.importPKCS8(options.keyPem, "ES256");
      const secretBytes = new TextEncoder().encode(secretToUse);
      const shares = await split(secretBytes, 5, 3);
      const sharesAsBase64 = shares.map((share) =>
        isomorphicBtoa(String.fromCharCode.apply(null, Array.from(share))),
      );

      return {
        key: signingKey as CryptoKey,
        cert: options.certPem,
        phrase: secretToUse,
        recoveryShares: sharesAsBase64,
      };
    });
  }

  /**
   * This method unlocks an identity using a password.
   * @param options The password to unlock the identity.
   * @returns The unlocked identity data.
   */
  public async unlockIdentity(
    options: PasswordUnlockOptions,
  ): Promise<Result<UnlockedIdentityData>> {
    return tryCatch(async () => {
      const [encryptedKey, salt, iv, cert] = await Promise.all([
        this.store.get<ArrayBuffer>(DB_KEYS.ENCRYPTED_KEY),
        this.store.get<Uint8Array>(DB_KEYS.SALT),
        this.store.get<Uint8Array>(DB_KEYS.IV),
        this.store.get<string>(DB_KEYS.CERTIFICATE),
      ]);

      if (!encryptedKey || !salt || !iv || !cert) {
        throw new Error(
          "Stored identity not found or is incomplete. Cannot unlock.",
        );
      }

      const keyMaterial = await this.deriveKeyMaterial(options.password, salt);
      const crypto = getSubtleCrypto();
      const decryptionKey = await crypto.importKey(
        "raw",
        keyMaterial,
        "AES-GCM",
        true,
        ["decrypt"],
      );
      const keyPemBytes = await crypto.decrypt(
        { name: "AES-GCM", iv },
        decryptionKey,
        encryptedKey,
      );
      const keyPem = new TextDecoder().decode(keyPemBytes);
      const signingKey = await jose.importPKCS8(keyPem, "ES256");

      return { key: signingKey as CryptoKey, cert };
    });
  }

  /**
   * This method deletes an identity from the store.
   * @returns A Result indicating success or failure.
   */
  public async deleteIdentity(): Promise<Result<void>> {
    return tryCatch(async () => {
      if (this.store.clear) {
        await this.store.clear();
      } else {
        await Promise.all([
          this.store.del(DB_KEYS.ENCRYPTED_KEY),
          this.store.del(DB_KEYS.CERTIFICATE),
          this.store.del(DB_KEYS.SALT),
          this.store.del(DB_KEYS.IV),
        ]);
      }
      console.log("Password-based identity successfully deleted from storage.");
    });
  }

  /**
   * This method derives key material from a password and a salt.
   * @param password The password to derive the key material from.
   * @param salt The salt to use for the key derivation.
   * @returns The derived key material.
   */
  private async deriveKeyMaterial(
    password: string,
    salt: Uint8Array,
  ): Promise<ArrayBuffer> {
    const crypto = getSubtleCrypto();
    const baseKey = await crypto.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    return crypto.deriveBits(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 250000,
        hash: "SHA-256",
      },
      baseKey,
      256,
    );
  }
}
