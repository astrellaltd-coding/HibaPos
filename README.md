# HibaPOS France

Système de point de vente (POS) pour restaurant, conforme à la réglementation française (ISCA — art. 286-I-3° bis CGI).

## Stack

- **Framework** : Next.js 16 (App Router, single-route SPA)
- **UI** : React 19 + Tailwind CSS 4 + shadcn/shadcn-ui
- **État** : Zustand (persisté) + TanStack Query
- **Base de données** : SQLite via Prisma ORM (WAL)
- **Authentification** : Sessions serveur signées (cookies httpOnly) + PIN (scrypt N=2^17) + révocation par session
- **Monnaie** : Calculs en **centimes entiers** (Int) bout-en-bout — aucun drift flottant (conformité TVA)
- **Fiscalité** : Journal fiscal permanent chaîné par hash (SHA-256), grand total perpétuel, clôtures mensuelles/annuelles, mode FACTICE, archive annuelle ouverte

## Prérequis

- **Bun** 1.3.14+ (`packageManager: bun@1.3.14`)
- Node.js 20+ (fallback)

## Installation

```bash
bun install
```

## Configuration

Copiez `.env.example` en `.env` et renseignez :

```ini
DATABASE_URL="file:./db/custom.db?_fk=1&_busy_timeout=5000"
SESSION_SECRET="votre-secret-tres-long-ici"   # min 32 caractères (openssl rand -hex 32)
BACKUP_ENCRYPTION_KEY="une-autre-cle-de-32-caracteres"  # min 32 caractères
```

## Base de données

```bash
# Pousser le schéma + générer le client Prisma
bun run db:push

# Seeder (utilisateur super-admin + gérant par défaut)
bun run db:seed
```

## Développement

```bash
bun run dev
```

L'application est disponible sur http://localhost:3000.

## Production (Windows)

```powershell
# Build production
powershell -ExecutionPolicy Bypass -File .zscripts/build.ps1

# Lancer le serveur production
powershell -ExecutionPolicy Bypass -File .zscripts/start.ps1
```

Le serveur démarre sur `http://localhost:3000` (navigateur en plein écran).

## Tests

```bash
bun run test          # 105 tests unitaires + intégration
bun run typecheck   # tsc --noEmit
bun run test:e2e     # Playwright (caissier flow)
```

## Fonctionnalités clés

- **Caisse** : Prise de commande sur place / à emporter / livraison, paiements multiples (espèces, carte, bon), remises avec approbation manager
- **Fiscalité (ISCA)** : Tickets immuables (snapshot textuel), numérotation séquentielle atomique, journal fiscal chaîné (JFP), grand total perpétuel, clôtures Z (journalière) + M (mensuelle) + A (annuelle), mode FACTICE, archive annuelle ouverte (JSON + SHA-256 + notice FR)
- **Sécurité** : Verrouillage après 30 min d'inactivité, brute-force protection (lockout 5 essais / 15 min), approbation manager pour remises et remboursements, révocation de session par session
- **Gestion** : Produits, options, suppléments, catégories (soft-delete), tables (plan de salle), clients, médiathèque
- **Rapports** : X-Report (caisse ouverte, temps réel), Z-Report (clôture immuable), ventes par produit/période, TVA, caissiers
- **Backups** : Sauvegardes SQLite chiffrées (AES-256-GCM, scrypt N=2^17) avec checksum SHA-256 et restauration sécurisée
- **Journal technique** : Logs structurés en base, consultation restreinte au SUPER_ADMIN

## Rôles utilisateur

| Rôle | Permissions |
|------|-------------|
| `CASHIER` | Encaissement, consultation des commandes, tables, caisses |
| `MANAGER` | Remboursements, rapports, ouverture/fermeture de caisse, gestion du catalogue, clôtures mensuelles, disponibilité produits |
| `SUPER_ADMIN` | Paramètres, utilisateurs, backups, logs techniques, clôtures annuelles, archives fiscales, suppression définitive |

## Structure du projet

```
src/
  app/api/        → API routes (Next.js App Router)
  components/     → Composants React réutilisables
  features/       → Pages/vues par domaine (pos, orders, admin...)
  hooks/          → Hooks personnalisés
  lib/            → Utilitaires, services, validation, fiscal
  store/          → Stores Zustand (persisté)
  types/          → Types TypeScript
prisma/
  schema.prisma   → Schéma de base de données (centimes entiers)
  seed.ts         → Orchestrateur de seed CLI
public/
  uploads/        → Images téléchargées (non commité)
docs/
  attestation-conformite.md  → Attestation ISCA (BOI-LETTRE-000242)
```

## Licence

Propriétaire — HibaPOS France.
