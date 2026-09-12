# HibaPOS France

Système de point de vente (POS) pour restaurant, **construit selon les exigences ISCA**
(art. 286-I-3° bis CGI) : inaltérabilité, sécurisation, conservation, archivage.

> **Ce dépôt n'établit pas la conformité, et cette ligne disait le contraire jusqu'au
> 2026-09-05.** La conformité résulte de l'attestation de l'éditeur
> (`docs/attestation-conformite.md`, modèle BOI-LETTRE-000242) ; une fausse attestation est
> un délit pénal (3 ans, 45 000 €). **Quatre** questions restent ouvertes et **aucun test
> automatisé ne peut y répondre.** Trois relèvent d'un tiers qualifié : la suffisance
> d'une chaîne de hachage non signée (V-01), le format de l'archive annuelle (V-02), et ce
> qu'un ticket doit porter de plus (V-03) — l'obligation ou non de journaliser l'ouverture
> automatique du tiroir-caisse est enregistrée séparément sous V-13. La quatrième,
> **VAT-METHOD**, relève du **comptable du restaurant** : la base de ventilation d'un menu
> à prix forfaitaire entre 10 % et 5,5 %, à confirmer **par écrit**
> (`docs/politique-ventilation-tva.md`). Le registre qui fait foi est
> `docs/conformite-isca-map.md` § 9.

## Stack

- **Framework** : Next.js 16 (App Router, single-route SPA)
- **UI** : React 19 + Tailwind CSS 4 + shadcn/shadcn-ui
- **État** : Zustand (persisté) + TanStack Query
- **Base de données** : SQLite via Prisma ORM — le mode **WAL est appliqué au démarrage** (`src/lib/db-pragmas.ts`), **sauf** si le fichier se trouve dans un dossier synchronisé (OneDrive, Dropbox, Google Drive, iCloud), où il est délibérément refusé : un agent de synchronisation qui remonte un `-wal` périmé corrompt la base. *L'installation actuelle est sous OneDrive et tourne donc en journal rollback (re-vérifié 2026-09-07, octet 18 = 1) ; elle passera en WAL au premier démarrage où la base se trouvera sous une racine **non synchronisée** — c'est la condition que teste le garde-fou, et non un chemin particulier. Aucun déplacement n'est planifié : voir DD-02 ci-dessous.*
- **Authentification** : Sessions serveur signées (cookies httpOnly) + PIN (scrypt N=2^17) + révocation par session
- **Monnaie** : Calculs en **centimes entiers** (Int) bout-en-bout — aucun drift flottant (exigence de calcul pour la TVA)
- **Fiscalité** : Journal fiscal permanent chaîné par hash (SHA-256), grand total perpétuel enregistré dans chaque clôture, clôtures de caisse / du jour / mensuelles / annuelles, mode FACTICE, archive annuelle ouverte

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
# CE DÉPÔT utilise un chemin ABSOLU vers db/custom.db, qui est la base VIVE.
# DD-02 avait retenu `C:\HibaPOS\data` comme emplacement final, dans le cadre
# du modèle d'installation Windows RETIRÉ le 2026-09-10. L'application ne
# déplace rien d'elle-même : HIBAPOS_DATA_DIR n'est pas défini, donc
# paths.ts renvoie le répertoire courant. Le sujet appartient désormais à la
# phase Tauri v2, qui n'a pas encore de plan.
DATABASE_URL="file:./db/custom.db?_fk=1&_busy_timeout=5000"
SESSION_SECRET="votre-secret-tres-long-ici"   # min 32 caractères (openssl rand -hex 32)
BACKUP_ENCRYPTION_KEY="une-autre-cle-de-32-caracteres"  # min 32 caractères
```

## Base de données

> ⛔ **Ne lancez aucune des deux commandes ci-dessous sur ce dépôt.** `.env` pointe
> `DATABASE_URL` sur `db/custom.db` — **la base vive du restaurant**, avec son catalogue
> réel. `db:push` la réécrit d'après le schéma sans passer par une migration, `db:seed`
> y réinjecte des comptes. Elles ne valent que pour une **copie de travail** dont
> `DATABASE_URL` **et** `HIBAPOS_DATA_DIR` ont tous deux été redéfinis.
>
> Cette base a **15 migrations appliquées** : ici, le schéma se change par migration, et
> jamais avec `db:push`. Deux chemins l'appliquent, et un seul est le vôtre :
> `bun scripts/apply-migration.ts` à la main, ou **l'application elle-même au démarrage**,
> derrière une sauvegarde créée ET RELUE (PREP-4, 2026-09-11). Voir `REMEDIATION_PLAN.md` § 5.

```bash
# UNIQUEMENT sur une copie de travail (jamais sur ce dépôt) :
#   DATABASE_URL="file:/chemin/vers/copie.db" HIBAPOS_DATA_DIR="/chemin/vers/copie" bun run db:push
#   … puis db:seed pour les comptes par défaut.
```

## Développement

```bash
bun run dev
```

L'application est disponible sur http://localhost:3000.

## Déploiement

**Le déploiement est différé.** L'application sera livrée en **application
native Tauri v2**, et cette migration aura son propre plan. Le modèle
précédent — installation sur une caisse Windows, service supervisé, lanceur
kiosque, séance de mise en service — a été retiré le 2026-09-10 avec les
documents qui le décrivaient. Ce qui reste à faire avant la première vente
réelle est **fiscal et non technique** : voir `REMEDIATION_PLAN.md`,
*Before the first real sale*.

Les scripts PowerShell de `.zscripts/` restent en place : `print-raw.ps1` est
du **code vivant** appelé par `printer-transport.ts` pour l'impression USB, et
les autres sont couverts par `src/lib/deployment.test.ts`.

## Tests

```bash
bun run test         # 1382 tests unitaires + intégration — chiffre épinglé par src/lib/readme-counts.test.ts
bun run typecheck   # tsc --noEmit
bun run test:e2e     # Playwright — 13 tests (auth, encaissement, caisse, catalogue)
                     # Base de données jetable sous %TEMP%, port 3100 : ne touche jamais la production
```

## Fonctionnalités clés

- **Caisse** : Prise de commande sur place / à emporter / livraison, paiements multiples (espèces, carte, bon), remises avec approbation manager
- **Fiscalité (ISCA)** : Tickets immuables (snapshot textuel), numérotation séquentielle atomique, journal fiscal chaîné (JFP), grand total perpétuel, clôtures Z (par caisse) + J (journée d'exploitation, horaire de bascule paramétrable, ticket avec code d'intégrité) + M (mensuelle) + A (annuelle), mode FACTICE, archive annuelle ouverte (JSON + SHA-256 + notice FR)
- **Sécurité** : Verrouillage après 30 min d'inactivité, brute-force protection (lockout 5 essais / 15 min), approbation manager pour remises et remboursements, révocation de session par session
- **Gestion** : Produits, options, suppléments, catégories (soft-delete), clients, médiathèque
- **Rapports** : X-Report (caisse ouverte, temps réel), Z-Report (clôture immuable), ventes par période avec top produits, ventilation TVA à l'intérieur des rapports X et Z. *Les endpoints `/api/reports/vat`, `/api/reports/cashiers` et `/api/reports/products` existent mais n'ont aucune interface — re-vérifié 2026-09-10 : l'application n'appelle que `sales`, `x` et `z`.*
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
  uploads/        → Images du catalogue — **versionnées dans git** (147 fichiers, 47,0 Mo).
                    Décision DD-16 du 2026-09-05 : git en reste la seule copie versionnée.
                    Depuis le 2026-09-11 il existe DEUX sauvegardes chiffrées restaurables,
                    vérifiées par déchiffrement, qui incluent ces images (L-46 est close) —
                    mais les deux sont sur le même disque que la base qu'elles protègent.
docs/                          → onze fichiers + docs/audit/ ; les voici tous
  DECISIONS.md                 → LES DÉCISIONS ARRÊTÉES — à ne pas rouvrir. Les
                                 ids DD- sont cités depuis les commentaires du
                                 code et ne sont jamais renommés. C'était le § 9
                                 du plan jusqu'au 2026-09-12.
  INVARIANTS.md                → LES RÈGLES QUI NE S'APPLIQUENT JAMAIS À UNE SEULE
                                 PHASE. C'était le § 3 de REMEDIATION_PLAN.md
                                 jusqu'au 2026-09-11 ; déplacé parce que le plan se
                                 retire à la fin de la phase 6 et que ces règles,
                                 non. À lire avant toute modification.
  BASELINES.md                 → LES MESURES : tests, base de production, tables
                                 de vente, compteurs fiscaux, catalogue, comptes,
                                 sauvegardes, et l'inventaire de toute copie non
                                 chiffrée des données réelles sur ce disque.
                                 C'était le § 4 du plan jusqu'au 2026-09-12 ;
                                 déplacé pour la même raison que le § 3, et pour
                                 faire place aux dix-neuf lots de l'audit.
                                 **Re-mesurer avant de s'y fier** — c'est la
                                 première ligne du fichier.
  AUDIT-PROMPTS.md             → Les prompts de l'audit read-only de 2026-09 :
                                 un préambule + six corps + la CONSOLIDATION.
                                 Les sept sessions ont tourné ; c'est un
                                 historique, pas une consigne en attente.
  audit/FINDINGS.md            → **LA LISTE DE TRAVAIL.** Les 94 constats de
                                 l'audit, renumérotés L-89 … L-182, en deux vues :
                                 par gravité (ce qu'on fait en premier) et par
                                 fichier (ce qu'on fait ensemble). Groupes A (7,
                                 argent et registre fiscal) · B (39) · C (36) ·
                                 D (9) · E (3). C'est de CE fichier que vient le
                                 travail restant — rien n'y est encore placé dans
                                 le § 7 du plan ni découpé en phases.
  audit/pass-1…6-*.md          → Les six passes, telles qu'écrites : argent ·
                                 sécurité · modèle de données · la caisse en
                                 usage · build et exploitation · qualité des
                                 tests. Ce sont des PIÈCES : leur cadrage
                                 « Tauri ensuite » est faux et reste tel quel.
                                 Une seule retouche, signalée dans le fichier :
                                 un PIN de test y a été caviardé.
  audit/README.md              → Ce que chaque passe écrit, et pourquoi six
                                 fichiers plutôt qu'un seul.
  attestation-conformite.md    → Attestation ISCA (BOI-LETTRE-000242) — NON SIGNÉE
  politique-ventilation-tva.md → Répartition de la TVA d'un menu à prix forfaitaire
  conformite-isca-map.md       → Chaque exigence ISCA → le code qui l'implémente
  conformite-isca-recherche.md → Les sources (BOFiP, CGI, LNE) derrière la carte
  CHANGES-LOG.md               → Journal des changements de catalogue et d'UI, avec
                                 la manœuvre inverse de chacun. Absent de cet arbre
                                 jusqu'au 2026-09-11 — ce qui explique une partie de
                                 sa dérive.
  SQLITE_WAL.md                → Pourquoi le WAL est refusé sur un dossier synchronisé
  verification-8.1-2026-09-06.txt → Relevé read-only du 2026-09-06. HISTORIQUE :
                                 périmé par la remise à zéro du 2026-09-10.
scripts/                       → 15 scripts CLI (+ README.md). Tous en dry-run
                                 par défaut ; `--apply` écrit dans la base que
                                 désigne DATABASE_URL, c'est-à-dire la base VIVE.
                                 `apply-migration.ts` applique une migration À LA
                                 MAIN ; depuis PREP-4 l'application en applique
                                 aussi au démarrage, derrière une sauvegarde
                                 vérifiée. Ce n'est donc plus le seul chemin.
.zscripts/
  print-raw.ps1                → Impression RAW via le spouleur Windows (USB)
```

## Licence

Propriétaire — HibaPOS France.
