/**
 * Vault crypto — error model.
 *
 * A single typed error carries a machine-readable code so callers (and the
 * tests) can assert fail-closed behaviour precisely. There is deliberately no
 * "maybe" state: an ambiguous failure is reported as the worst matching code.
 */

import type { CryptoProvider } from "./types";

export type VaultErrorCode =
  | "WEBCRYPTO_UNAVAILABLE"
  | "MALFORMED_BLOB"
  | "UNSUPPORTED_VERSION"
  | "INVALID_ARGUMENT"
  | "AUTH_FAILED";

export class VaultCryptoError extends Error {
  readonly code: VaultErrorCode;

  constructor(code: VaultErrorCode, message: string) {
    super(message);
    this.name = "VaultCryptoError";
    this.code = code;
  }
}

export function isVaultCryptoError(value: unknown): value is VaultCryptoError {
  return value instanceof VaultCryptoError;
}

/**
 * Fail closed when Web Crypto is absent. Called at the top of every public
 * operation, *before* any randomness is drawn or anything is written, so an
 * environment without `crypto.subtle` can never silently produce weak output.
 */
export function assertWebCrypto(provider: CryptoProvider): asserts provider is Crypto {
  if (!provider || !provider.subtle) {
    throw new VaultCryptoError(
      "WEBCRYPTO_UNAVAILABLE",
      "Web Crypto is unavailable in this environment; the vault refuses to operate without it.",
    );
  }
}

/**
 * Storage-layer error codes (P4). Kept separate from `VaultErrorCode` because
 * these describe persistence failures, not crypto failures.
 */
export type VaultStoreErrorCode =
  | "STORAGE_UNAVAILABLE"
  | "QUOTA_EXCEEDED"
  | "INVALID_RECORD"
  | "NOT_FOUND"
  | "CORRUPT_EXPORT"
  | "VAULT_NOT_EMPTY";

export class VaultStoreError extends Error {
  readonly code: VaultStoreErrorCode;

  constructor(code: VaultStoreErrorCode, message: string) {
    super(message);
    this.name = "VaultStoreError";
    this.code = code;
  }
}

export function isVaultStoreError(value: unknown): value is VaultStoreError {
  return value instanceof VaultStoreError;
}

/**
 * Plain-language text for a failure, for screens the user reads. Deliberately
 * free of error codes and stack names; the code stays available to callers that
 * branch on it.
 */
export function describeVaultFailure(error: unknown): string {
  if (isVaultCryptoError(error)) {
    switch (error.code) {
      case "AUTH_FAILED":
        return "This could not be opened. The saved copy may have been changed.";
      case "WEBCRYPTO_UNAVAILABLE":
        return "This browser cannot do the scrambling this app needs.";
      default:
        return "That saved data could not be read.";
    }
  }
  if (isVaultStoreError(error)) {
    switch (error.code) {
      case "QUOTA_EXCEEDED":
        return "There is no room left on this device. Remove something, then try again.";
      case "STORAGE_UNAVAILABLE":
        return "This browser will not let the app store data on this device.";
      case "VAULT_NOT_EMPTY":
        return "There is already a vault on this device.";
      case "CORRUPT_EXPORT":
        return "That backup file could not be read. It may be damaged, or from a different app.";
      case "NOT_FOUND":
        return "That document is no longer in this vault.";
      default:
        return "That could not be completed.";
    }
  }
  return error instanceof Error && error.message ? error.message : "Something went wrong.";
}
