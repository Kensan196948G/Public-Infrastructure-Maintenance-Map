/**
 * Integration-test safety guard: never let a test TRUNCATE the production
 * database.
 *
 * The repository / publisher integration suites wipe every table in the
 * database they connect to. If PIMM_TEST_DATABASE_URL accidentally points at
 * the production database (e.g. a shell alias reusing $DATABASE_URL), that
 * TRUNCATE destroys production data. This helper refuses to run unless the
 * target database name clearly marks it as a test database (contains "test").
 *
 * Usage in integration tests:
 *   const databaseUrl = process.env['PIMM_TEST_DATABASE_URL'];
 *   assertTestDatabaseName(databaseUrl); // throws if not a test DB
 */
export function assertTestDatabaseName(databaseUrl: string | undefined): void {
  if (!databaseUrl) return; // skipped-mode guard; caller decides enablement
  let dbName: string;
  try {
    dbName = new URL(databaseUrl).pathname.replace(/^\//, '').split('?')[0] ?? '';
  } catch {
    throw new Error(
      `PIMM_TEST_DATABASE_URL is not a parseable URL — refusing to run destructive integration tests: ${databaseUrl}`,
    );
  }
  if (!dbName || !/test/i.test(dbName)) {
    throw new Error(
      `Refusing to run destructive integration tests against non-test database "${dbName}". ` +
        'PIMM_TEST_DATABASE_URL must name a database containing "test" (e.g. pimm_test), ' +
        'never the production database. This guard prevents accidental TRUNCATE of production data.',
    );
  }
}
