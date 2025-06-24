import { set, get, del, keys } from "idb-keyval";
import * as jose from "jose";
import { zxcvbn } from "@zxcvbn-ts/core";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { split } from "shamir-secret-sharing";

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

const DB_KEYS = {
  ENCRYPTED_KEY: "pbe-fabric-encrypted-private-key",
  CERTIFICATE: "pbe-fabric-user-certificate",
  SALT: "pbe-fabric-key-derivation-salt",
  IV: "pbe-fabric-encryption-iv",
};

export class PasswordBasedEngine implements ISecurityEngine {
  public async doesIdentityExist(): Promise<Result<boolean>> {
    return tryCatch(async () => {
      const allKeys = await keys();
      return allKeys.includes(DB_KEYS.ENCRYPTED_KEY);
    });
  }

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
      }

      const salt = self.crypto.getRandomValues(new Uint8Array(16));
      const iv = self.crypto.getRandomValues(new Uint8Array(12));
      const keyMaterial = await this.deriveKeyMaterial(secretToUse, salt);
      const encryptionKey = await self.crypto.subtle.importKey(
        "raw",
        keyMaterial,
        "AES-GCM",
        false,
        ["encrypt"],
      );

      const keyPemBytes = new TextEncoder().encode(options.keyPem);
      const encryptedKeyPem = await self.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        encryptionKey,
        keyPemBytes,
      );

      await Promise.all([
        set(DB_KEYS.ENCRYPTED_KEY, encryptedKeyPem),
        set(DB_KEYS.CERTIFICATE, options.certPem),
        set(DB_KEYS.SALT, salt),
        set(DB_KEYS.IV, iv),
      ]);

      const signingKey = await jose.importPKCS8(options.keyPem, "ES256");
      const secretBytes = new TextEncoder().encode(secretToUse);
      const shares = await split(secretBytes, 5, 3);
      const sharesAsBase64 = shares.map((share) =>
        btoa(String.fromCharCode.apply(null, Array.from(share))),
      );

      return {
        key: signingKey as CryptoKey,
        cert: options.certPem,
        phrase: secretToUse,
        recoveryShares: sharesAsBase64,
      };
    });
  }

  public async unlockIdentity(
    options: PasswordUnlockOptions,
  ): Promise<Result<UnlockedIdentityData>> {
    return tryCatch(async () => {
      const [encryptedKey, salt, iv, cert] = await Promise.all([
        get<ArrayBuffer>(DB_KEYS.ENCRYPTED_KEY),
        get<Uint8Array>(DB_KEYS.SALT),
        get<Uint8Array>(DB_KEYS.IV),
        get<string>(DB_KEYS.CERTIFICATE),
      ]);

      if (!encryptedKey || !salt || !iv || !cert) {
        throw new Error(
          "Stored identity not found or is incomplete. Cannot unlock.",
        );
      }

      const keyMaterial = await this.deriveKeyMaterial(options.password, salt);
      const decryptionKey = await self.crypto.subtle.importKey(
        "raw",
        keyMaterial,
        "AES-GCM",
        true,
        ["decrypt"],
      );
      const keyPemBytes = await self.crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        decryptionKey,
        encryptedKey,
      );
      const keyPem = new TextDecoder().decode(keyPemBytes);
      const signingKey = await jose.importPKCS8(keyPem, "ES256");

      return { key: signingKey as CryptoKey, cert };
    });
  }

  public async deleteIdentity(): Promise<Result<void>> {
    return tryCatch(async () => {
      await Promise.all([
        del(DB_KEYS.ENCRYPTED_KEY),
        del(DB_KEYS.CERTIFICATE),
        del(DB_KEYS.SALT),
        del(DB_KEYS.IV),
      ]);
      console.log(
        "Password-based identity successfully deleted from IndexedDB.",
      );
    });
  }

  private async deriveKeyMaterial(
    password: string,
    salt: Uint8Array,
  ): Promise<ArrayBuffer> {
    const baseKey = await self.crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    return self.crypto.subtle.deriveBits(
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
