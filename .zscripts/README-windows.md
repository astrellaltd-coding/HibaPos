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

The database initializes automatically in `./db/custom.db` in SQLite WAL mode on first launch.
