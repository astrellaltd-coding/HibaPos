# .zscripts — Build / Dev / Deploy Scripts

These shell scripts are **Linux-only** (they hardcode `/home/z/my-project` and
use bash-isms). On Windows (the current dev environment per `package.json`
scripts), use `npm run` directly instead:

| Linux script | Windows / npm equivalent |
|---|---|
| `.zscripts/dev.sh` | `npm run dev` (uses `next dev`) |
| `.zscripts/build.sh` | `npm run build` |
| `.zscripts/start.sh` | `npm run start` |
| `.zscripts/python-runtime-build.sh` | (Python runtime, used in the production container only) |
| `.zscripts/mini-services-install.sh` / `build.sh` / `start.sh` | (mini-services sub-system, Linux container only) |

## What the scripts do (Linux production container)

- **`dev.sh`** — `bun install` → `bun run db:deploy` (Prisma migrate deploy) → idempotent `bun run db:seed` → `bun run dev` on port 3000. Then starts mini-services if present.
- **`build.sh`** — `bun run build` (Next.js standalone) → copies `.next/standalone`, `.next/static`, `public/`, `prisma/`, `.env.example` to `$BUILD_DIR/`. No longer copies the dev SQLite file (ships empty schema + migrations + first-boot seed instead).
- **`start.sh`** — Production entrypoint: auto-bootstraps `$DEFAULT_PACKAGED_DB_PATH` if absent via `prisma migrate deploy` + `prisma db seed` → applies `PRAGMA journal_mode=WAL` via the sqlite3 CLI → starts `next-service-dist/server.js` → starts mini-services → starts Caddy as the foreground process.

## Cross-platform dev workflow (Windows)

On Windows, after cloning a fresh checkout:

```powershell
npm install
npm run db:deploy    # Prisma migrate deploy (no-op if already migrated)
npm run db:seed      # Idempotent — creates admin/manager only if DB empty
npm run dev          # Next.js dev server on :3000
```

Then optionally apply WAL to the dev SQLite file once:

```powershell
sqlite3 .\db\custom.db "PRAGMA journal_mode=WAL;"
```

See `docs/SQLITE_WAL.md` for the WAL runbook.

## Production deploy order

1. `bash .zscripts/build.sh` on a Linux CI runner → produces `$BUILD_DIR.tar.gz`.
2. Ship the tarball to the production host (e.g. `/app/`).
3. `bash /app/start.sh` — auto-bootstraps if no DB exists, then starts Next.js + Caddy.
4. Caddy reverse-proxies `:81` → `:3000`. Front with TLS for Internet exposure.

## Notes

- `dev.pid` is a stale dev-server PID file; safe to delete.
- `*.log` files under `.zscripts/` are gitignored.