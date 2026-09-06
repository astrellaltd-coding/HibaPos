# HibaPOS France

Système de point de vente (POS) pour restaurant, **construit selon les exigences ISCA**
(art. 286-I-3° bis CGI) : inaltérabilité, sécurisation, conservation, archivage.

> **Ce dépôt n'établit pas la conformité, et cette ligne disait le contraire jusqu'au
> 2026-09-05.** La conformité résulte de l'attestation de l'éditeur
> (`docs/attestation-conformite.md`, modèle BOI-LETTRE-000242) ; une fausse attestation est
> un délit pénal (3 ans, 45 000 €). Trois questions restent ouvertes et **aucun test
> automatisé ne peut y répondre** : la suffisance d'une chaîne de hachage non signée, le
> format de l'archive annuelle, et l'obligation ou non de journaliser l'ouverture
> automatique du tiroir-caisse. Elles relèvent d'un tiers qualifié.

## Stack

- **Framework** : Next.js 16 (App Router, single-route SPA)
- **UI** : React 19 + Tailwind CSS 4 + shadcn/shadcn-ui
- **État** : Zustand (persisté) + TanStack Query
- **Base de données** : SQLite via Prisma ORM — le mode **WAL est appliqué au démarrage** (`src/lib/db-pragmas.ts`), **sauf** si le fichier se trouve dans un dossier synchronisé (OneDrive, Dropbox, Google Drive, iCloud), où il est délibérément refusé : un agent de synchronisation qui remonte un `-wal` périmé corrompt la base. *L'installation actuelle est sous OneDrive et tourne donc en journal rollback (vérifié 2026-09-05, octet 18 = 1) ; elle passera en WAL au premier démarrage après le déplacement vers `C:\HibaPOS\data`.*
- **Authentification** : Sessions serveur signées (cookies httpOnly) + PIN (scrypt N=2^17) + révocation par session
- **Monnaie** : Calculs en **centimes entiers** (Int) bout-en-bout — aucun drift flottant (exigence de calcul pour la TVA)
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
# Chemin relatif : valable pour un poste de développement.
# L'installation de production utilise un chemin ABSOLU (vérifié 2026-09-05).
# DD-02 a retenu `C:\HibaPOS\data` comme emplacement final ; le déplacement
# physique fait partie du lot 1.4 et n'a pas encore eu lieu.
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
bun run test         # 763 tests unitaires + intégration (mesuré 2026-09-05)
bun run typecheck   # tsc --noEmit
bun run test:e2e     # Playwright — 13 tests (auth, encaissement, caisse, catalogue)
                     # Base de données jetable sous %TEMP%, port 3100 : ne touche jamais la production
```

## Fonctionnalités clés

- **Caisse** : Prise de commande sur place / à emporter / livraison, paiements multiples (espèces, carte, bon), remises avec approbation manager
- **Fiscalité (ISCA)** : Tickets immuables (snapshot textuel), numérotation séquentielle atomique, journal fiscal chaîné (JFP), grand total perpétuel, clôtures Z (par caisse — à réaliser par l'opérateur à chaque journée d'exploitation, voir L-54) + M (mensuelle) + A (annuelle), mode FACTICE, archive annuelle ouverte (JSON + SHA-256 + notice FR)
- **Sécurité** : Verrouillage après 30 min d'inactivité, brute-force protection (lockout 5 essais / 15 min), approbation manager pour remises et remboursements, révocation de session par session
- **Gestion** : Produits, options, suppléments, catégories (soft-delete), clients, médiathèque
- **Rapports** : X-Report (caisse ouverte, temps réel), Z-Report (clôture immuable), ventes par période avec top produits, ventilation TVA à l'intérieur des rapports X et Z. *Les endpoints `/api/reports/vat` et `/api/reports/cashiers` existent mais n'ont aucune interface — vérifié 2026-09-05, aucun appelant dans `src/`.*
- **Backups** : Sauvegardes SQLite chiffrées (AES-256-GCM, scrypt N=2^17) avec checksum SHA-256 et restauration sécurisée
- **Journal technique** : Logs structurés en base, consultation restreinte au SUPER_ADMIN

## Rôles utilisateur

Un seul rôle opérationnel : le `MANAGER` tient la caisse. Le `SUPER_ADMIN` est
le compte du développeur. Le rôle `CASHIER` a été retiré du produit le
2026-09-04 (décision de l'exploitant, lot 4.4b) ; aucun compte caissier n'a
jamais existé.

| Rôle | Permissions |
|------|-------------|
| `MANAGER` | Encaissement, commandes, caisses, remboursements, rapports, gestion du catalogue, clôtures mensuelles, disponibilité produits, réglages, journal d'audit |
| `SUPER_ADMIN` | Paramètres, utilisateurs, backups **y compris leur suppression définitive** (`DELETE /api/backups/[id]`, journalisée), logs techniques, clôtures annuelles, archives fiscales. *Aucune suppression définitive de donnée commerciale n'existe : catégories et produits sont en soft-delete, et rien n'efface une commande, un ticket ou un événement fiscal — vérifié 2026-09-05.* |

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
  uploads/        → Images du catalogue — **versionnées dans git** (139 fichiers, 49 Mo).
                    Décision DD-16 du 2026-09-05 : git en est aujourd'hui la seule copie
                    versionnée, et aucune sauvegarde restaurable n'existe (L-46).
docs/
  attestation-conformite.md  → Attestation ISCA (BOI-LETTRE-000242)
```

## Licence

Propriétaire — HibaPOS France.
