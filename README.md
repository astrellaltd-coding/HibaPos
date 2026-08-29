# HibaPOS France

Système de point de vente (POS) pour restaurant, conforme à la réglementation française.

## Stack

- **Framework** : Next.js 16 (App Router)
- **UI** : React 19 + Tailwind CSS + shadcn/ui
- **État** : Zustand + TanStack Query
- **Base de données** : SQLite via Prisma ORM
- **Authentification** : Sessions signées (cookies httpOnly) + PIN (scrypt)
- **Monnaie** : Calculs en euros TTC, arrondis à 2 décimales (schéma prévu pour migration future vers centimes entiers)

## Prérequis

- Node.js 20+
- npm ou pnpm

## Installation

```bash
npm install
```

## Configuration

Copiez `.env.example` en `.env` et renseignez :

```bash
DATABASE_URL="file:./db/custom.db"
SESSION_SECRET="votre-secret-tres-long-ici"
BACKUP_ENCRYPTION_KEY="une-autre-cle-de-32-caracteres"
```

## Base de données

```bash
# Pousser le schéma
npm run db:push

# Générer le client Prisma
npm run db:generate

# Seeder (utilisateur super-admin par défaut)
npm run db:seed
```

## Développement

```bash
npm run dev
```

L'application est disponible sur http://localhost:3000.

## Build production

```bash
npm run build
npm run start
```

## Tests

```bash
npm run test
```

## Fonctionnalités clés

- **Caisse** : Prise de commande sur place / à emporter / livraison, paiements multiples (espèces, carte, bon)
- **Fiscalité** : TVA nette de remise par ligne, tickets immuables (snapshot textuel), numérotation séquentielle atomique
- **Sécurité** : Verrouillage après 30 min d'inactivité, brute-force protection, approbation manager pour remises et remboursements
- **Gestion** : Produits, options, suppléments, catégories (soft-delete), tables, clients
- **Rapports** : X-Report (caisse ouverte), Z-Report (clôture), ventes par produit
- **Backups** : Sauvegardes SQLite chiffrées (AES-256-CBC) avec checksum SHA-256 et restauration sécurisée
- **Journal technique** : Logs structurés en base, consultation restreinte au SUPER_ADMIN

## Rôles utilisateur

| Rôle | Permissions |
|------|-------------|
| `CASHIER` | Encaissement, consultation des commandes, tables, caisses |
| `MANAGER` | Remboursements, rapports, ouverture/fermeture de caisse, gestion du catalogue |
| `SUPER_ADMIN` | Paramètres, utilisateurs, backups, logs techniques, suppression définitive |

## Structure du projet

```
src/
  app/api/        → API routes (Next.js App Router)
  components/     → Composants React réutilisables
  features/       → Pages/vues par domaine (pos, orders, admin...)
  hooks/          → Hooks personnalisés
  lib/            → Utilitaires, services, validation
  store/          → Stores Zustand
  types/          → Types TypeScript
prisma/
  schema.prisma   → Schéma de base de données
public/
  uploads/        → Images téléchargées
```

## Licence

Propriétaire — HibaPOS France.
