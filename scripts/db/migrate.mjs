#!/usr/bin/env node
/**
 * Applies migrations/*.sql in filename order against DATABASE_URL.
 * Tracks applied files in schema_migrations. Idempotent.
 *
 *   DATABASE_URL=postgresql://... pnpm db:migrate
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL is not set. Aborting (no migrations applied).');
  process.exit(1);
}

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations',
);

const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });

try {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set(
    (await sql`SELECT filename FROM schema_migrations`).map((r) => r.filename),
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`⏭  ${file} (already applied)`);
      continue;
    }
    const body = await readFile(path.join(migrationsDir, file), 'utf8');
    console.log(`🚀 applying ${file} ...`);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    });
    console.log(`✅ ${file}`);
  }
  console.log('🎉 migrations complete');
} finally {
  await sql.end();
}
