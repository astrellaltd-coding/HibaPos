# Attestation individuelle de conformité — HibaPOS France

> Modèle officiel **BOI-LETTRE-000242** (mise à jour BOFiP du 25 mars 2026).
> Article 286-I-3° bis du CGI — conditions ISCA (Inaltérabilité, Sécurisation,
> Conservation, Archivage). Rappel : l'établissement d'une fausse attestation
> est un délit pénal passible de 3 ans d'emprisonnement et de 45 000 € d'amende
> (code pénal, art. 441-1).

Ce document doit être **imprimé en deux exemplaires originaux**, signés par
l'éditeur (volet 1) et par l'entreprise utilisatrice (volet 2), et conservé avec
les pièces comptables pour présentation lors d'un contrôle fiscal.

---

## Volet 1 — À remplir par l'éditeur du logiciel de caisse

Je soussigné, `……… Prénom ………`, représentant légal de la société
`……… RAISON SOCIALE de l'éditeur ………`, éditeur du logiciel / système de caisse
**HibaPOS France**, mis sur le marché à compter du `……… DATE ………`,
dans sa version **0.x** (racine de version majeure : `0`), sous le numéro de
licence `……… (le cas échéant) ………`, atteste que ce logiciel / système,
dans ses fonctionnalités de caisse / encaissement, satisfait aux conditions
d'**inaltérabilité**, de **sécurisation**, de **conservation** et
d'**archivage** des données en vue du contrôle de l'administration fiscale,
prévues au 3° bis du I de l'article 286 du code général des impôts.

J'atteste que la dernière version majeure de ce logiciel est identifiée avec la
racine suivante : **`0`** et que les versions mineures développées ultérieurement
à cette version majeure sont ou seront identifiées par les subdivisions
suivantes de cette racine : **`0.x`** (`0.1`, `0.2`, …). Je m'engage à ce que
ces subdivisions ne soient utilisées par `……… RAISON SOCIALE de l'éditeur ………`
que pour l'identification des versions mineures ultérieures, à l'exclusion de
toute version majeure.

Le périmètre couvert par cette attestation concerne les fonctionnalités
suivantes : **caisse / encaissement** (prise de commande, encaissement, tickets,
remboursements, clôtures journalière/mensuelle/annuelle, journal des événements
fiscal, archivage annuel).

### Mise en œuvre des conditions ISCA dans HibaPOS France

- **Inaltérabilité** : les tickets, paiements et clôtures Z sont immuables (aucun
  chemin de suppression ou de modification dans l'application). Une correction se
  fait par une contre-opération tracée (remboursement / annulation), jamais par
  réécriture de l'historique.
- **Sécurisation** : un journal fiscal permanent (`FiscalEvent`) chaîne chaque
  vente, remboursement, clôture et ouverture de tiroir par condensat SHA-256
  incluant le hash de l'événement précédent. Toute altération rétrosactive est
  détectable par `GET /api/fiscal/verify`. Les opérateurs sont identifiés
  (userId) sur chaque événement.
- **Conservation** : clôtures journalière (Z), mensuelle et annuelle, cumulatives
  et scellées ; un **grand total perpétuel** (`GrandTotal`) qui ne revient jamais
  à zéro, y compris lors des mises à jour du logiciel. Conservation des données
  élémentaires et des preuves d'intégrité pendant la durée légale (6 ans).
- **Archivage** : export annuel au format ouvert (JSON + SHA-256 + notice en
  français) via `POST /api/fiscal/archive`, figeant l'exercice et lui donnant
  date certaine. Lisible indépendamment du logiciel.

Fait à `……… Ville ………`, le `……… Date ………`

Signature de l'éditeur : `_____________________________`

---

## Volet 2 — À remplir par l'entreprise qui utilise le logiciel de caisse

Je soussigné, `……… Prénom ………`, représentant légal de la société
`……… RAISON SOCIALE de l'utilisateur ………`, certifie avoir acquis / téléchargé
le `……… DATE ………`, auprès de `……… RAISON SOCIALE du distributeur ………`,
le logiciel / système de caisse **HibaPOS France** mentionné au volet 1 de la
présente attestation.

J'atteste utiliser ce logiciel / système de caisse pour enregistrer les
règlements de mes clients particuliers, conformément à la réglementation fiscale
en vigueur, depuis le `……… DATE ………`.

Fait à `……… Ville ………`, le `……… Date ………`

Signature de l'entreprise utilisatrice : `_____________________________`

---

### Références réglementaires

- Article 286-I-3° bis du CGI (obligation ISCA)
- Article 1770 duodecies du CGI (amende 7 500 € par logiciel non conforme + 60 jours)
- Loi n° 2026-103 du 19 février 2026 de finances pour 2026, article 125
  (rétablit l'attestation individuelle de l'éditeur depuis le 21 février 2026)
- BOI-TVA-DECLA-30-10-30 (conditions ISCA) · BOI-LETTRE-000242 (présent modèle)
- Code pénal, art. 441-1 (fausse attestation : 3 ans + 45 000 €)
