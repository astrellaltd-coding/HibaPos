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

**Statut au 2026-09-09 : la politique est arrêtée et la mise en œuvre est
faite.** Le Batch 5.9 a construit les menus composés ; les neuf cas du § 5 ont
été rejoués de bout en bout contre le logiciel réel et **six d'entre eux ont
été corrigés d'un centime** — voir *§ 9, correction du 2026-09-09*. La méthode
elle-même reste à faire confirmer par le comptable (§ 8).

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

> **Tableaux corrigés le 2026-09-09** (Batch 5.9). Les chiffres publiés le matin
> même n'étaient pas ceux que le logiciel produit : **six lignes sur neuf**
> changeaient d'un centime. Les valeurs ci-dessous sont celles relevées sur les
> tickets réels, encaissement par encaissement. Le détail et la raison : § 9.

### Menu Eco — 3 pizzas Junior + 1 bouteille — 24,90 €

| Mode | Prix | Base 10 % | Base 5,5 % | TVA |
|---|---|---|---|---|
| Sur place | 24,90 | 24,90 TTC → HT **22,63** | — | **2,27** |
| À emporter | 24,90 | **22,02** TTC → HT 20,01 | **2,88** TTC → HT **2,73** | **2,16** |
| Livraison | 24,90 | 22,28 TTC → HT 20,25 | 2,62 TTC → HT 2,48 | 2,17 |

### Menu Chill — 2 pizzas Senior + 1 bouteille — 24,90 € / 28,90 € en livraison

| Mode | Prix | Base 10 % | Base 5,5 % | TVA |
|---|---|---|---|---|
| Sur place | 24,90 | 24,90 TTC → HT **22,63** | — | **2,27** |
| À emporter | 24,90 | 21,71 TTC → HT **19,73** | 3,19 TTC → HT 3,02 | **2,15** |
| Livraison | 28,90 | 25,58 TTC → HT **23,26** | 3,32 TTC → HT 3,15 | **2,49** |

### Menu XXL — 2 pizzas Mega + 1 bouteille — 33,90 € / 36,90 € en livraison

| Mode | Prix | Base 10 % | Base 5,5 % | TVA |
|---|---|---|---|---|
| Sur place | 33,90 | 33,90 TTC → HT **30,81** | — | **3,09** |
| À emporter | 33,90 | 30,54 TTC → HT 27,76 | 3,36 TTC → HT 3,18 | 2,96 |
| Livraison | 36,90 | 33,77 TTC → HT 30,70 | 3,13 TTC → HT 2,97 | 3,23 |

**Détail d'un calcul, à titre d'illustration** — Menu Chill à emporter :
référence 11,90 + 11,90 + 3,50 = 27,30 ; le forfait est réparti **composant par
composant** au prorata de ces trois prix, ce qui donne 10,86 + 10,85 + 3,19 =
24,90 exactement. Les deux pizzas relèvent de 10 %, la bouteille de 5,5 % ; la
base à 10 % est donc 10,86 + 10,85 = 21,71 et la base à 5,5 % est 3,19.

Le HT est ensuite pris **ligne par ligne** : 10,86 ÷ 1,10 = 9,87 et
10,85 ÷ 1,10 = 9,86, soit 19,73 HT au total (TVA 1,98) ; et 3,19 ÷ 1,055 = 3,02
HT (TVA 0,17). Total TVA 2,15.

*(La rédaction initiale groupait d'abord les deux pizzas — 23,80/27,30 × 24,90 =
21,71 — puis divisait la base une seule fois : 21,71 ÷ 1,10 = 19,74. Le résultat
diffère d'un centime sur le HT. Voir § 9.)*

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

**Construit le 2026-09-09 par le Batch 5.9 :** la notion de menu composé. Un
menu est un produit portant `isCombo`, dont les composants sont choisis au
comptoir case par case, et qui est **enregistré en une ligne par composant** —
chacune avec sa part du forfait et son propre taux. C'est ce découpage qui rend
la ventilation possible : `OrderItem` ne porte qu'un seul taux, et une ligne
unique n'aurait jamais pu en porter deux.

**Ce qui reste à faire :** l'exploitant doit créer les six menus au catalogue
(les trois menus pizzas et les trois Duo). Les produits « Burger Cheese Royal »,
« Chicken Royal » et « Giant Royal » que contiennent les Duo n'existent pas
encore ; tant qu'ils n'existent pas, **les Duo ne peuvent pas figurer au § 5**,
faute de prix de référence. Ils y seront ajoutés une fois le catalogue à jour.

## 8. À faire confirmer par le comptable

1. **La méthode de ventilation elle-même** — prorata des prix de vente à
   l'unité. C'est le point qui n'est pas tranché par le seul texte : les
   sources citent cette méthode comme un exemple admis, pas comme la seule.
2. **Le repli au taux supérieur** en cas d'impossibilité de ventiler.
3. **Le traitement des suppléments** hors forfait.
4. **Le cas des composants qui ne sont pas vendus à la carte.** La méthode du
   § 2 se justifie par les « prix pratiqués séparément lorsque les produits sont
   aussi vendus à la carte » : c'est vrai de toutes les pizzas et de toutes les
   boissons. Si les burgers des Duo n'existent QUE dans les Duo, leur prix de
   référence devient une valeur notionnelle et cette justification ne tient plus
   pour ces menus-là. Les vendre aussi à l'unité suffirait à la rétablir.

## 9. Correction des tableaux du § 5 — 2026-09-09

Les neuf lignes publiées le matin du 2026-09-09 annonçaient être « produites
par les fonctions `apportion()` et `splitVat()` du logiciel lui-même ». Elles ne
l'étaient pas tout à fait : elles avaient été calculées à la main, en groupant
d'abord. Quand le Batch 5.9 a rejoué les neuf cas contre le logiciel réel,
**six d'entre eux ont donné un centime d'écart**. Les tableaux du § 5 portent
désormais les chiffres du logiciel, relevés sur les tickets réels.

Deux causes, distinctes, et toutes deux **conséquences du fait qu'un menu est
enregistré en une ligne par composant** :

**a. Le regroupement.** La ligne « Menu Eco à emporter » répartissait 26,70
(trois Junior comptés comme UN poids) contre 3,50. Le logiciel répartit entre
les **composants** — quatre poids — parce qu'une ligne est la seule chose qui
puisse porter un taux. 22,02 / 2,88 au lieu de 22,01 / 2,89. **Une ligne.**

**b. Où le HT est arrondi.** Le document divisait chaque **base** une seule fois
(« 21,71 ÷ 1,10 = 19,74 »). La caisse divise chaque **ligne** : `lineHt =
arrondi(lineNetTotal ÷ (1 + taux/100))`, chiffre stocké sur chaque ligne depuis
le Batch 3.11 et vérifié par la somme `Σ (net − HT) = TVA de la commande`.
**Cinq lignes**, dont les trois lignes « sur place », là où le § 2 dit
pourtant qu'aucune ventilation n'a lieu : il n'y en a pas, mais le HT est tout
de même pris trois fois plutôt qu'une.

**Le sens de l'écart n'est pas systématique** : cinq lignes gagnent un centime
de TVA, une en perd un. Il ne s'agit pas d'un choix de méthode — la méthode du
§ 2 est inchangée — mais de l'arrondi, à l'endroit où le logiciel l'applique
réellement.

**Vérification.** Les neuf cas ont été encaissés de bout en bout sur une copie
de travail, contre l'application compilée, et relus dans la base : total,
TVA par taux, HT par taux, et `Σ (net − HT) = TVA` sur chaque commande. Le
détail figure dans `REMEDIATION_RECORD.md` → *Batch 5.9*.

---

*Sources invoquées par l'entreprise : CGI art. 279 ; CGI art. 268 bis ;
BOI-ANNX-000495 ; BOI-TVA-LIQ-30-10-10 ; BOI-TVA-LIQ-30-30 § 220–250. Ces
références sont celles fournies par l'exploitant ; elles n'ont pas été
vérifiées par l'éditeur du logiciel et ne constituent pas une validation
juridique.*
