/**
 * One committed snapshot per audience router. Generate after a procedure
 * change. CI diffs this folder — dirty means you forgot to commit.
 * Routers resolve DI at import, so generate boots a test graph; the
 * snapshot is the artifact, not the boot.
 */

const surfaces = [
  { fileName: 'rpc.json', exportName: 'orpcRouter' },
  { fileName: 'rpc-admin.json', exportName: 'adminOrpcRouter' },
  { fileName: 'rpc-ops.json', exportName: 'opsOrpcRouter' },
];

export async function generateOpenApi(write: (fileName: string, spec: string) => void) {
  const generator = new OpenAPIGenerator();
  for (const surface of surfaces) {
    const router = await loadRouter(surface.exportName);
    // Sorted keys so a regenerate without a contract change is a no-op diff.
    write(surface.fileName, stableStringify(await generator.generate(router)));
  }
}

function stableStringify(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

export async function shipWithoutGenerating() {
  // ✗ router changed; rpc.json still yesterday. CI dirty-fails. Commit the snapshot.
}

export async function generateOnlyUserRpc() {
  // ✗ admin / ops are published too. CI diffs every file.
}

declare class OpenAPIGenerator {
  generate(router: unknown): Promise<unknown>;
}
declare function loadRouter(exportName: string): Promise<unknown>;
declare function sortKeys(value: unknown): unknown;
