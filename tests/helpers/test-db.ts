import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Disposable, isolated SQLite database for integration tests.
 *
 * The real development database (`data/prefab.db`) is never touched: this helper
 * points `PREFAB_DB_PATH` at a fresh temporary file inside the OS temp directory
 * *before* dynamically importing the database module, so all migrations and
 * seeding run against the throwaway database. The temporary directory (including
 * WAL/SHM side files) is removed on cleanup.
 *
 * `lib/db.ts` is imported dynamically so the environment override is applied
 * first; static ESM imports would evaluate the module before the override.
 */
export async function setupTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "prefab-it-"));
  process.env.PREFAB_DB_PATH = join(dir, "test.db");
  const dbModule = await import("../../lib/db.ts");
  const repo = await import("../../lib/repositories.ts");
  const issues = await import("../../lib/issues-repo.ts");
  const cleanup = () => {
    try {
      dbModule.db.close();
    } catch {
      // already closed
    }
    try {
      // maxRetries/retryDelay handles Windows keeping a brief lock on the WAL/SHM
      // side files immediately after close().
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch {
      // best-effort cleanup of a temp directory
    }
  };
  return { dir, db: dbModule.db, repo, issues, cleanup };
}

export type TestDb = Awaited<ReturnType<typeof setupTestDb>>;
