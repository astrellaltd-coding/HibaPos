# Politique de ventilation de la TVA — menus à prix forfaitaire

> **Ce document n'est pas un conseil juridique et n'est pas une attestation.**
> Il consigne la méthode choisie par l'entreprise, les raisons de ce choix et
> des exemples chiffrés, afin qu'elle soit **documentée, appliquée de manière
> constante et justifiable en cas de contrôle**. Il est destiné à être relu et
> confirmé par le comptable de l'établissement.
>
> **Il ne doit pas être fusionné avec `docs/attestation-conformite.md`.** Cette
> attestation-là est le modèle officiel BOI-LETTRE-000242 et porte sur les
> conditions **ISCA** (inaltérabilité, sécurisation, conservation, archivage) ;
> une fausse attestation est un délit pénal. La ventilation de la TVA n'est pas
> une question ISCA et n'a rien à y faire.

**Statut au 2026-09-09 : la politique est arrêtée, la mise en œuvre ne l'est
pas.** Aucun menu composé n'existe encore dans le logiciel — voir *Ce qui
existe déjà* en fin de document.

---

## 1. Le problème

Un menu est vendu à un **prix forfaitaire unique** alors qu'il contient des
éléments relevant de **taux différents** :

- une pizza préparée pour consommation immédiate → **10 %**, quel que soit le
  mode de vente ;
- une boisson non alcoolisée en **contenant fermé** (bouteille, canette) →
  **10 % sur place**, **5,5 % à emporter et en livraison**.

Le prix forfaitaire doit donc être réparti entre ces taux.

## 2. La règle retenue

**Ventilation au prorata des prix de vente à l'unité** des éléments composant le
menu, tels qu'ils figurent au catalogue **pour le mode de vente concerné**.

En pratique :

1. additionner les prix à l'unité des composants → *valeur de référence* ;
2. répartir le prix du menu proportionnellement à ces prix ;
3. appliquer à chaque part le taux propre à son composant.

**Sur place, aucune ventilation n'a lieu** : tous les composants relèvent de
10 %, il n'y a donc rien à répartir.

### Pourquoi cette méthode

- Le BOFiP cite, parmi les méthodes admises pour un prix global, une méthode
  fondée sur les **prix pratiqués séparément** lorsque les produits sont aussi
  vendus à la carte. **C'est exactement le cas ici** : toutes les pizzas sont
  vendues à l'unité (8,90 / 11,90 / 15,90 € selon la taille) et toutes les
  boissons également (3,50 € la bouteille, 1,50 € la canette).
- Elle est **simple**, **économiquement réaliste** et **reproductible** : deux
  personnes appliquant la méthode au même menu obtiennent le même chiffre.
- Elle est **auto-cohérente** : si un prix du catalogue change, la répartition
  suit, sans second jeu de valeurs à maintenir.

### La méthode qui n'a PAS été retenue, et pourquoi

Le BOFiP cite également une ventilation fondée sur les **prix de revient**.
Elle est écartée pour une raison factuelle : **le logiciel ne connaît aucun prix
d'achat.** Le modèle `Product` ne porte que des prix de vente TTC (`price`,
`pickupPrice`, `deliveryPrice`). Retenir cette méthode supposerait de saisir et
de tenir à jour un prix de revient sur chacun des 78 produits.

## 3. Application constante

La méthode s'applique **à tous les menus à taux mixtes**, sans exception, et
elle est **calculée par le logiciel** — elle n'est pas ressaisie à la main menu
par menu, ce qui est ce qui la rend constante par construction.

## 4. Repli si la ventilation est impossible

Si un menu ne peut pas être ventilé — composant sans prix de référence,
composition incomplète, taux non résolu — **la totalité du prix est imposée au
taux le plus élevé des taux en présence (10 %)**.

C'est le sens du repli : en l'absence de justification, l'administration
retiendrait de toute façon le taux supérieur. Le logiciel doit donc **majorer**,
jamais minorer.

Ce repli est conçu pour ne jamais se déclencher en service : la configuration
d'un menu incomplet doit être **refusée à l'enregistrement**, là où il y a le
temps de la corriger. Le repli est la ceinture, la validation est les bretelles.

## 5. Exemples chiffrés

Prix de référence au catalogue (TTC) : pizza **Junior 8,90 / Senior 11,90 /
Mega 15,90** à emporter, **9,90 / 13,50 / 18,90** en livraison ; bouteille
scellée **3,50** dans tous les modes.

Chiffres produits par les fonctions `apportion()` et `splitVat()` du logiciel
lui-même. **Chaque ventilation retombe exactement sur le prix de vente.**

### Menu Eco — 3 pizzas Junior + 1 bouteille — 24,90 €

| Mode | Prix | Base 10 % | Base 5,5 % | TVA |
|---|---|---|---|---|
| Sur place | 24,90 | 24,90 TTC → HT 22,64 | — | 2,26 |
| À emporter | 24,90 | 22,01 TTC → HT 20,01 | 2,89 TTC → HT 2,74 | 2,15 |
| Livraison | 24,90 | 22,28 TTC → HT 20,25 | 2,62 TTC → HT 2,48 | 2,17 |

### Menu Chill — 2 pizzas Senior + 1 bouteille — 24,90 € / 28,90 € en livraison

| Mode | Prix | Base 10 % | Base 5,5 % | TVA |
|---|---|---|---|---|
| Sur place | 24,90 | 24,90 TTC → HT 22,64 | — | 2,26 |
| À emporter | 24,90 | 21,71 TTC → HT 19,74 | 3,19 TTC → HT 3,02 | 2,14 |
| Livraison | 28,90 | 25,58 TTC → HT 23,25 | 3,32 TTC → HT 3,15 | 2,50 |

### Menu XXL — 2 pizzas Mega + 1 bouteille — 33,90 € / 36,90 € en livraison

| Mode | Prix | Base 10 % | Base 5,5 % | TVA |
|---|---|---|---|---|
| Sur place | 33,90 | 33,90 TTC → HT 30,82 | — | 3,08 |
| À emporter | 33,90 | 30,54 TTC → HT 27,76 | 3,36 TTC → HT 3,18 | 2,96 |
| Livraison | 36,90 | 33,77 TTC → HT 30,70 | 3,13 TTC → HT 2,97 | 3,23 |

**Détail d'un calcul, à titre d'illustration** — Menu Chill à emporter :
référence 2 × 11,90 + 3,50 = 27,30 ; part pizzas 23,80/27,30 × 24,90 = 21,71 ;
part boisson 24,90 − 21,71 = 3,19 ; puis 21,71 ÷ 1,10 = 19,74 HT (TVA 1,97) et
3,19 ÷ 1,055 = 3,02 HT (TVA 0,17).

## 6. Les suppléments

Un supplément ajouté à un menu **n'entre pas dans la ventilation**. Il est
facturé **en sus** du prix du menu et relève de son propre taux — 10 % pour un
supplément alimentaire. Le forfait ventilé reste le prix du menu seul.

## 7. Ce qui existe déjà, et ce qui reste à faire

**En place au 2026-09-09 :**

- Le taux par mode de vente est implémenté et vérifié en production
  (`resolveVatRate(product, orderType)`, Batch 3.12). Les catégories
  *Bouteilles* et *Canette* portent **10 % sur place / 5,5 % à emporter et
  livraison**.
- Le critère est le **contenant** et non la boisson : les taux sont portés par
  les catégories *Canette* et *Bouteilles*. Une boisson servie en gobelet
  relèverait d'une catégorie distincte à 10 % dans tous les modes ; **aucun
  produit de ce type n'existe aujourd'hui**.
- `apportion()` (répartition au plus fort reste) et `splitVat()` existent et
  sont testés.
- Le ticket client imprime déjà un **Détail TVA** par taux.

**Ce qui n'existe pas encore :** la notion même de menu composé. Les quatre
« menus » présents au catalogue sont des produits ordinaires à prix unique et à
taux unique. Tant que la fonctionnalité n'est pas construite, **aucun menu ne
peut être ventilé** — voir `REMEDIATION_PLAN.md` → *Batch 5.9*.

## 8. À faire confirmer par le comptable

1. **La méthode de ventilation elle-même** — prorata des prix de vente à
   l'unité. C'est le point qui n'est pas tranché par le seul texte : les
   sources citent cette méthode comme un exemple admis, pas comme la seule.
2. **Le repli au taux supérieur** en cas d'impossibilité de ventiler.
3. **Le traitement des suppléments** hors forfait.

---

*Sources invoquées par l'entreprise : CGI art. 279 ; CGI art. 268 bis ;
BOI-ANNX-000495 ; BOI-TVA-LIQ-30-10-10 ; BOI-TVA-LIQ-30-30 § 220–250. Ces
références sont celles fournies par l'exploitant ; elles n'ont pas été
vérifiées par l'éditeur du logiciel et ne constituent pas une validation
juridique.*
