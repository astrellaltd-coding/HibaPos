// Vitest global setup — runs before any test file is loaded.
// Sets the env vars required by auth + approvals + backup modules so their
// import-time guards (which throw on missing/too-short secrets) don't trip
// during test runs.

process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ??
  "test-session-secret-at-least-32-characters-long-0123456789";
process.env.BACKUP_ENCRYPTION_KEY =
  process.env.BACKUP_ENCRYPTION_KEY ??
  "test-backup-key-32-characters-or-more-0123456789";