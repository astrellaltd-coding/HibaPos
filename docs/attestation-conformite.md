# Attestation individuelle de conformité — HibaPOS France

> Modèle officiel **BOI-LETTRE-000242** (mise à jour BOFiP du 25 mars 2026).
> Article 286-I-3° bis du CGI — conditions ISCA (Inaltérabilité, Sécurisation,
> Conservation, Archivage). Rappel : l'établissement d'une fausse attestation
> est un délit pénal passible de 3 ans d'emprisonnement et de 45 000 € d'amende
> (code pénal, art. 441-1).

Ce document doit être **imprimé en deux exemplaires originaux**, signés par
l'éditeur (volet 1) et par l'entreprise utilisatrice (volet 2), et conservé avec
les pièces comptables pour présentation lors d'un contrôle fiscal.

> ### ⚠ Notes éditoriales — 2026-09-06, à lire avant signature
>
> *Ces notes ne font pas partie de la déclaration. Elles rapportent ce que disent
> les sources officielles consultées le 2026-09-06 ; elles ne constituent pas un
> conseil juridique.*
>
> **1. L'attestation doit être individuelle, nominative et liée à une VERSION.**
> BOFiP : « L'attestation doit être individuelle, c'est-à-dire délivrée
> nominativement à l'assujetti », et l'assujetti doit disposer de celle
> « correspondant à **la version** du logiciel ou système de caisse qu'il
> utilise ». Un PDF générique ne suffit pas. C'est aussi ce que l'administration
> vérifie en contrôle : la correspondance entre les versions détenues et les
> attestations détenues. **Depuis le lot 3.7 (2026-09-06, L-53), HibaPOS énonce
> sa version** — `HibaPOS France v0.2.1` — en dernière ligne de chaque ticket,
> sur l'écran Fiscal (JFP), dans la réponse de `GET /api/fiscal/verify` et dans
> la notice et le champ `software` de l'archive annuelle. Les tickets et archives
> produits avant ce lot n'en portent pas et ne sont pas réécrits. La valeur est
> celle de `src/lib/version.ts`, tenue égale à `package.json` par un test.
> **La carte des exigences, ligne par ligne, est dans
> `docs/conformite-isca-map.md`** ; la section « Mise en œuvre » ci-dessous
> doit être relue contre elle avant signature.
>
> **2. Une échéance à surveiller : le 1er janvier 2027.** L'ordonnance
> n° 2026-671 du 27 juillet 2026 transfère la matière dans le code des
> impositions sur les biens et services (CIBS). Or la version de l'article 1770
> duodecies applicable au 1er janvier 2027, ainsi que l'article L. 80 O du LPF
> déjà en vigueur, ne mentionnent plus que **« le certificat »** — le mot
> *attestation* en est absent. **Le texte du CIBS a depuis été retrouvé et lu**
> (recherche du 2026-09-06, § 9.1) : les articles L. 216-48 et L. 216-40 sont le
> **même** article, renuméroté par l'ordonnance n° 2026-671, et il ne dit ni
> « attestation » ni « certificat » — il dit **« Un décret détermine les
> caractéristiques … »**. Le régime de preuve à compter du 1er janvier 2027
> dépend donc d'un **décret non publié à ce jour**. Conclusion pratique :
> l'attestation est valable **jusqu'au 31 décembre 2026** ; au-delà, rien de
> publié ne tranche. À faire confirmer par un professionnel avant de fonder une
> stratégie durable sur l'auto-attestation.
>
> **3. Ce que le contrôle vérifie.** BOI-CF-COM-20-60 : les agents procèdent à
> des « constatations matérielles » et **ne testent pas le logiciel**. Ils
> vérifient l'existence de l'attestation pour chaque logiciel et chaque version
> détenue. L'examen des données relève d'une autre procédure.
>
> **4. Deux réserves LEVÉES le 2026-09-06 (lots 3.8 et 3.9), et ce qui reste.**
> Cette note signalait deux points que la section « Mise en œuvre » ne devait pas
> surestimer. Les deux ont été corrigés le jour même ; le texte est conservé
> pour que le lecteur voie ce qui a changé.
> *(a)* **CORRIGÉ.** La note disait : « la clôture Z scelle une caisse, pas une
> journée calendaire ; rien ne rattache une clôture à un jour, et sur la base de
> production le Z n° 2 couvre cinq journées d'essai ». **HibaPOS dispose
> désormais d'une clôture du jour scellée et chaînée** (`DailyClose`), distincte
> de la clôture de caisse, calée sur une **journée d'exploitation** dont l'heure
> de bascule est paramétrable (5 h par défaut) : un service qui se termine à
> 1 h 30 reste dans la journée où il a commencé, et le mois et l'exercice
> suivent la même horloge. **Ce qui reste ouvert n'est pas du code** : aucune
> source trouvée ne dit si une clôture par caisse aurait suffi (§ 9.5), et la
> caisse ne bloque aucune vente à aucune heure — choix de l'exploitant.
> *(b)* **CORRIGÉ.** La note disait que HibaPOS tenait le total perpétuel mais
> ne l'enregistrait dans aucune clôture, alors que le BOFiP (§ 170) demande que
> « pour chaque clôture » soient « calculées et enregistrées » des données
> cumulatives « comme le cumul du grand total de la période et le total
> perpétuel ». **Le total perpétuel est désormais scellé dans les quatre
> clôtures** — caisse, jour, mois, exercice — dans la ligne et dans la charge
> utile hachée. Les clôtures scellées avant le lot 3.8 portent `null` : le
> chiffre n'avait jamais été relevé et 0 aurait été un chiffre faux.
>
> **5. Le chaînage peut être à clé, et ne l'est pas aujourd'hui.** Le lot 3.9 a
> ajouté un mode HMAC-SHA-256 (`FISCAL_CHAIN_KEY`). **Aucun texte ne l'exige** —
> le BOFiP § 60 n'impose aucune solution technique et le § 140 cite le chaînage
> **ou** la signature. C'est un choix de l'exploitant. **La clé n'est armée sur
> aucune machine** : la chaîne est aujourd'hui un condensat SHA-256 simple, et
> l'armement est une étape de la mise en service (lot 8.0). Ne pas décrire le
> logiciel comme « à clé » dans une attestation signée avant cet armement.

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
remboursements, clôtures de caisse (Z) / **du jour** / mensuelle / annuelle,
journal des événements fiscal, archivage annuel). *Voir `docs/conformite-isca-map.md` § 8
pour la liste établie à partir du code, couvertes et exclues.*

### Mise en œuvre des conditions ISCA dans HibaPOS France

- **Inaltérabilité** : les tickets, paiements et clôtures Z sont immuables (aucun
  chemin de suppression ou de modification dans l'application). Une correction se
  fait par une contre-opération tracée (remboursement / annulation), jamais par
  réécriture de l'historique.
- **Sécurisation** : un journal fiscal permanent (`FiscalEvent`) chaîne chaque
  vente, remboursement, clôture et ouverture de tiroir par condensat SHA-256
  incluant le hash de l'événement précédent. Toute altération rétroactive est
  détectable par `GET /api/fiscal/verify`. Les opérateurs sont identifiés
  (userId) sur chaque événement. *(Un chaînage à clé HMAC-SHA-256 est disponible
  mais **non armé** — voir note 5 ; ne pas s'en prévaloir tant qu'il ne l'est
  pas.)*
- **Conservation** : **quatre niveaux de clôture, scellés et chaînés** — clôture
  de caisse (Z, une par caisse ouverte), **clôture du jour** (une par journée
  d'exploitation, avec ticket et code d'intégrité à conserver), clôture
  mensuelle et clôture d'exercice ; un **grand total perpétuel** (`GrandTotal`)
  qui ne revient jamais à zéro, y compris lors des mises à jour du logiciel,
  **et qui est enregistré dans chacune de ces clôtures**. Conservation des
  données élémentaires et des preuves d'intégrité pendant la durée légale
  (6 ans). *(Voir note 4 pour ce que cette phrase ne dit pas.)*
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

- Article 286-I-3° bis du CGI (obligation ISCA). **Second alinéa ajouté par la
  loi n° 2026-534 du 25 juin 2026, art. 87** (en vigueur le 27 juin 2026) : les
  données archivées doivent être « restituées dans un format répondant aux
  normes établies par l'administration ».
- Article 1770 duodecies du CGI — amende de **7 500 € par logiciel**, à la
  charge de **l'assujetti** (le restaurant), pas de l'éditeur, puis **60 jours**
  pour se mettre en conformité avant que l'amende soit à nouveau encourue.
- **LPF, art. L. 80 O — délai de 30 jours**, à ne pas confondre avec le
  précédent : après le procès-verbal d'intervention, l'assujetti dispose de
  30 jours pour produire l'attestation ; s'il la produit dans ce délai,
  **l'amende n'est pas appliquée du tout**.
- Loi n° 2026-103 du 19 février 2026 de finances pour 2026, article 125
  (rétablit l'attestation individuelle de l'éditeur depuis le 21 février 2026 —
  elle avait été supprimée par la loi n° 2025-127 du 14 février 2025, art. 43).
- BOI-TVA-DECLA-30-10-30 (conditions ISCA, version du 25/03/2026) ·
  BOI-LETTRE-000242 (présent modèle, version du 25/03/2026) ·
  BOI-CF-COM-20-60 (ce que l'administration contrôle réellement).
- **Éditeur établi à l'étranger : expressément admis.** BOI-TVA-DECLA-30-10-30
  § 365 : « L'attestation peut être délivrée par un éditeur établi à l'étranger
  à condition d'être, soit rédigée en français, soit rédigée en langue étrangère
  et accompagnée d'une traduction en français certifiée. » Le texte ne pose
  aucune condition d'établissement dans l'Union européenne pour la voie de
  l'attestation.
- Code pénal, **art. 441-7** (établissement ou usage d'une fausse **attestation**
  — 1 an et 15 000 €, portés à **3 ans et 45 000 €** lorsque le fait est commis
  « en vue de porter préjudice au Trésor public », ce qui est le cas ici) ;
  art. 441-1 (faux et usage de faux, 3 ans et 45 000 €) reste la base générale.
- Article 1770 **undecies** du CGI — sanction visant l'éditeur d'un logiciel
  conçu pour permettre la fraude : **15 % du chiffre d'affaires** tiré du produit
  et solidarité sur les droits éludés. Ne vise pas une attestation simplement
  inexacte, mais c'est la disposition qui engage l'argent de l'éditeur.
