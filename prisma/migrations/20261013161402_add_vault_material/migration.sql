-- CreateTable
-- Additive: introduces the per-user vault-material table for the local-first
-- end-to-end vault. Stores only wrapped (opaque) blobs; no raw key material.
CREATE TABLE "VaultMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kdfName" TEXT NOT NULL,
    "kdfHash" TEXT NOT NULL,
    "kdfIterations" INTEGER NOT NULL,
    "kdfSalt" TEXT NOT NULL,
    "materialCreatedAt" DATETIME NOT NULL,
    "wrappedByPassphrase" TEXT NOT NULL,
    "wrappedByRecoveryKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VaultMaterial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "VaultMaterial_userId_key" ON "VaultMaterial"("userId");
