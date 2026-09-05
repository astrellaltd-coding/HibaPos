# HibaPOS Windows Deployment & Running Guide

This guide covers running and deploying **HibaPOS France** natively on Windows 10/11 or Windows Server.

---

## 1. Prerequisites

- **Bun Runtime**: Install Bun for Windows via PowerShell:
  ```powershell
  powershell -c "irm bun.sh/install.ps1 | iex"
  ```
- **Node.js 20+** (optional fallback)
- **SQLite3 CLI** (optional for manual DB inspections)

---

## 2. Quick Start Scripts

All scripts are located in `.zscripts/` and have native PowerShell `.ps1` versions:

### Development Mode
Runs the local dev server on `http://localhost:3000`:
```powershell
powershell -ExecutionPolicy Bypass -File .zscripts/dev.ps1
```

### Production Build
Generates the Prisma client and compiles the Next.js production bundle:
```powershell
powershell -ExecutionPolicy Bypass -File .zscripts/build.ps1
```

### Production Server
Starts the production server on `http://localhost:3000`:
```powershell
powershell -ExecutionPolicy Bypass -File .zscripts/start.ps1
```

---

## 3. Database & Secrets Configuration

Create a `.env` file from `.env.example`:
```ini
DATABASE_URL="file:./db/custom.db?_fk=1&_busy_timeout=5000"
SESSION_SECRET="your-secure-32-char-random-secret"
BACKUP_ENCRYPTION_KEY="your-secure-32-char-backup-key"
```

The database initializes automatically in `./db/custom.db` **when the file does not yet exist**.

> **Corrected 2026-09-05 (batch 7.1, DOC-03).** This line used to say the database
> initializes "in SQLite WAL mode on first launch". Both halves were wrong. Initialization
> only happens when the file is **absent** — an existing database is left alone — and
> nothing applied WAL at all until batch 2.3 moved the pragma into the application
> (`src/lib/db-pragmas.ts`, run from `src/instrumentation.ts` at every start). WAL is now
> applied automatically **except** when the database sits in a cloud-synced folder, where it
> is refused on purpose. Verify with `PRAGMA journal_mode` rather than trusting this file.
