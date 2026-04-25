import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { verifyLocalBackupIntegrity } from "@/lib/lonaci/local-backups";

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

describe("verifyLocalBackupIntegrity", () => {
  let tempRoot = "";
  const previousBackupDir = process.env.BACKUP_DIR;

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
    process.env.BACKUP_DIR = previousBackupDir;
  });

  it("valide une sauvegarde intègre", async () => {
    tempRoot = mkdtempSync(join(tmpdir(), "lonaci-backup-test-"));
    process.env.BACKUP_DIR = tempRoot;
    const backupName = "backup-20260423-120000";
    const backupDir = join(tempRoot, backupName);
    const mongoDir = join(backupDir, "mongo");
    mkdirSync(mongoDir, { recursive: true });

    const compressed = gzipSync(Buffer.from('{"_id":1}\n', "utf8"));
    const filePath = join(mongoDir, "users.ndjson.gz");
    writeFileSync(filePath, compressed);
    writeFileSync(
      join(backupDir, "manifest.json"),
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          database: "testdb",
          uploadsCopied: false,
          collections: [
            {
              name: "users",
              documentCount: 1,
              file: "mongo/users.ndjson.gz",
              checksumSha256: sha256(compressed),
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const report = await verifyLocalBackupIntegrity(backupName);
    expect(report.valid).toBe(true);
    expect(report.filesChecked).toBe(1);
    expect(report.missingFiles).toEqual([]);
    expect(report.checksumMismatches).toEqual([]);
  });

  it("détecte corruption et fichier manquant", async () => {
    tempRoot = mkdtempSync(join(tmpdir(), "lonaci-backup-test-"));
    process.env.BACKUP_DIR = tempRoot;
    const backupName = "backup-20260423-120001";
    const backupDir = join(tempRoot, backupName);
    const mongoDir = join(backupDir, "mongo");
    mkdirSync(mongoDir, { recursive: true });

    const compressed = gzipSync(Buffer.from('{"_id":1}\n', "utf8"));
    writeFileSync(join(mongoDir, "users.ndjson.gz"), gzipSync(Buffer.from('{"_id":2}\n', "utf8")));
    writeFileSync(
      join(backupDir, "manifest.json"),
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          database: "testdb",
          uploadsCopied: false,
          collections: [
            {
              name: "users",
              documentCount: 1,
              file: "mongo/users.ndjson.gz",
              checksumSha256: sha256(compressed),
            },
            {
              name: "roles",
              documentCount: 1,
              file: "mongo/roles.ndjson.gz",
              checksumSha256: "deadbeef",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const report = await verifyLocalBackupIntegrity(backupName);
    expect(report.valid).toBe(false);
    expect(report.missingFiles).toContain("mongo/roles.ndjson.gz");
    expect(report.checksumMismatches.length).toBe(1);
    expect(report.checksumMismatches[0]?.file).toBe("mongo/users.ndjson.gz");
  });
});
