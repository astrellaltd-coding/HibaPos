# ISCA / logiciel de caisse — research reference

**Compiled 2026-09-06 from official sources.** This file records *what published
sources say*, with a URL for every substantive claim. It is **not legal advice**,
and it does **not** assert that HibaPOS complies with anything — see safety rule
13 in `REMEDIATION_PLAN.md` and the *External / Legal / Fiscal Verification*
section there.

It exists so that a later session, or a fiscal professional, starts from sourced
facts instead of re-deriving them. **Nothing here substitutes for a qualified
French fiscal professional**, and the open questions at the end are the ones to
put to them.

> ⚠ Several texts below post-date this project's assistant knowledge cutoff of
> May 2026 and were found by research, not recalled. They are marked **[NEW]**.
> Anything found here should be re-checked against Legifrance before being
> relied on — French rules in this area have changed in each of the last two
> finance laws.

---

## 1. The obligation

**CGI art. 286-I-3° bis**, consolidated text in force since 27 June 2026:

> « […] utiliser un logiciel ou un système satisfaisant à des conditions
> d'**inaltérabilité, de sécurisation, de conservation et d'archivage** des
> données en vue du contrôle de l'administration fiscale, attestées par un
> **certificat délivré par un organisme accrédité** […] **ou par une attestation
> individuelle de l'éditeur**, conforme à un modèle fixé par l'administration ;
>
> Les données archivées […] sont **restituées dans un format répondant aux
> normes établies par l'administration**. »

https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051764897

**[NEW]** That second paragraph was added by **`LOI n° 2026-534 du 25 juin 2026,
art. 87`**, in force 27 June 2026.
https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000054309429

**Scope** (impots.gouv.fr, updated 21/05/2026): VAT-liable persons making
supplies **not giving rise to an invoice** to retail customers, using cash
register software. A restaurant is squarely in scope.

---

## 2. The four conditions, as BOFiP words them

Source for all four: **BOI-TVA-DECLA-30-10-30**, version **25/03/2026** —
https://bofip.impots.gouv.fr/bofip/10691-PGP.html/identifiant=BOI-TVA-DECLA-30-10-30-20260325

| Condition | What BOFiP says |
|---|---|
| **Inaltérabilité** | Data must be inalterable. Corrections by « opérations de « plus » et de « moins » et non par modification directe des données d'origine enregistrées ». Guaranteed by proof the data has not changed since recording — « (**empreinte numérique à clé privée, chaînage, etc.**) ». |
| **Sécurisation** | Must « empêcher leur suppression ou modification sans laisser de trace ». By « **tout procédé technique fiable** […] une technique de **chaînage des enregistrements** ou de signature électronique des données ». |
| **Conservation** | Six years (LPF art. L. 102 B). The software « doit prévoir obligatoirement une **clôture journalière et une clôture mensuelle et annuelle** (ou par exercice) […] Ces trois échéances sont **cumulatives et impératives** », with grand total and perpetual total per period. |
| **Archivage** | Periodicity « au maximum annuelle ou par exercice ». « Les données d'archivage doivent être enregistrées dans un **format ouvert**. » |

**The law prescribes no technical solution.** BOFiP: « Le législateur **n'a pas
défini de cahier des charges, ni de solution technique**. L'élaboration de
référentiels ou de solutions techniques est donc du ressort des seuls acteurs
privés ».

**On hash chaining specifically:** chaining is named explicitly for both
inaltérabilité and sécurisation, presented as an alternative to signature rather
than cumulative with it. **Two honest caveats:** the fingerprint example BOFiP
gives is a **keyed** one (« à clé privée »), and **no source found addresses
unkeyed SHA-256 chaining specifically**, in either direction. This is the
substance of **V-01**.

---

## 3. How conformity is proved — and the date on it

| Date | Event | Source |
|---|---|---|
| 16 Feb 2025 | `loi n° 2025-127, art. 43` **abolishes** the éditeur attestation | [ACTU-2025-00075](https://bofip.impots.gouv.fr/bofip/14667-PGP.html/ACTU-2025-00075) |
| Oct 2025 | Accredited-certification deadline pushed to 31 Aug 2026 | [ACTU-2025-00160](https://bofip.impots.gouv.fr/bofip/14826-PGP.html/ACTU-2025-00160) |
| **21 Feb 2026** | **`loi n° 2026-103 du 19 fév. 2026, art. 125` RESTORES it** | [Legifrance](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000053511553/2026-02-21) |
| 25 Mar 2026 | BOFiP and the attestation model updated | [ACTU-2026-00073](https://bofip.impots.gouv.fr/bofip/15035-PGP.html/ACTU-2026-00073) |

BOFiP: « L'article 125 […] **rétablit la possibilité** […] de justifier du
respect des conditions […] par la production d'une **attestation individuelle
délivrée par l'éditeur**. »

**As of 2026-09-06: self-attestation is valid, and accredited certification is
NOT mandatory.** The two routes are alternatives. Much online commentary still
says otherwise — most of it was written during the 2025–2026 gap, and vendor
pages selling certification have an obvious interest.

### ⚠ [NEW] The 1 January 2027 question — the most important open item

**`Ordonnance n° 2026-671 du 27 juillet 2026`** moves the obligation into the
**CIBS** (code des impositions sur les biens et services) from **1 January
2027**; old CGI references remain usable until 30 June 2028.
https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000054497160

Two texts point the wrong way for the attestation route:

- the **1 Jan 2027 version of CGI art. 1770 duodecies** refers only to « **le
  certificat** prévu en application de l'article L. 216-40 du [CIBS] » — the
  word *attestation* does not appear —
  https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053189017/2027-01-01
- **LPF art. L. 80 O**, already in force since 27 June 2026, likewise refers
  only to « **le certificat** mentionné à l'article L. 216-48 » of the CIBS

**The CIBS article itself could not be retrieved** (Legifrance's pages for that
block would not render). The recodification is officially « à droit constant »,
which argues the attestation survives — **but that is an inference, not a
verified fact.** Note also that the two texts cite *different* CIBS articles
(L. 216-40 vs L. 216-48), which may be a renumbering artefact.

**This determines whether self-attestation is a durable model or a bridge to
early 2027.** It is the first question for a fiscal professional.

> **ANSWERED IN PART, 2026-09-06 → § 9.1.** The CIBS article was retrieved:
> L. 216-48 and L. 216-40 are **the same article** (renumbered by ord.
> 2026-671, official concordance table), and its text names neither
> « attestation » nor « certificat » — it says **« Un décret détermine les
> caractéristiques … »**. The proof regime from 1 January 2027 therefore sits
> in a **décret that has not been published**. Not an inference any more: a
> known unknown with a date on it.

---

## 4. The attestation itself

Model: **BOI-LETTRE-000242**, version 25/03/2026 —
https://bofip.impots.gouv.fr/bofip/10692-PGP.html/identifiant=BOI-LETTRE-000242-20260325

- **Individual and nominative**: « L'attestation doit être individuelle,
  c'est-à-dire délivrée nominativement à l'assujetti. » A generic PDF does not
  satisfy this.
- **Version-matched**: the assujetti must hold the one « correspondant à **la
  version** du logiciel ou système de caisse qu'il utilise ». BOFiP describes an
  optional mechanism: declare a **major-version root** and commit that later
  subdivisions identify only *minor* versions.
- **Two volets**: volet 1 signed by the éditeur (identity, software name and
  references, date placed on the market, version, the ISCA statement, and an
  explicit list of functionalities **covered** and **excluded**); volet 2 signed
  by the using business.
- Retention sits with the **assujetti**.
- **A foreign éditeur may issue it.** BOFiP § 365: « L'attestation peut être
  délivrée par **un éditeur établi à l'étranger** à condition d'être, soit
  rédigée en français, soit rédigée en langue étrangère et accompagnée d'une
  **traduction en français certifiée**. » No EU-establishment condition appears
  for this route. *(By contrast the certificate route requires an accredited
  body, and accreditation is an EU/COFRAC matter — so the attestation is the
  route open to a non-EU éditeur.)* BOFiP also anticipates foreign éditeurs
  being sanctioned, which confirms it expects them to issue.
  **Caveat, and it is sharper than it looks.** BOFiP says « à l'étranger »
  without qualification and never uses « pays tiers » or « hors Union
  européenne ». The permission is therefore **inferred from an unqualified
  word plus BOFiP's explicit anticipation of foreign éditeurs being
  sanctioned** — not stated. *The éditeur here is established in **Tunisia**
  (corrected 2026-09-06; an earlier draft of this file said the UK).* Tunisia
  is outside the EU and the EEA, so nothing about EU freedom of establishment,
  EU accreditation or intra-EU mutual recognition assists — the argument rests
  entirely on « à l'étranger » being read literally. Two further angles a
  professional should cover that do not arise for an EU éditeur: whether DGFiP
  in practice accepts an attestation from a third-country entity with no
  French presence, and whether the restaurant's own risk (it holds the €7 500
  exposure, not the éditeur) argues for a French representative or a
  countersignature.
  **ANSWERED IN PART, 2026-09-06 → § 9.3.** § 365, § 370, § 400 and § 410
  quoted verbatim; the EU condition of § 320 attaches to the *accreditation
  body* and exists only in the certificate route; no text requires a French
  or EU establishment or a représentant fiscal for the éditeur. Practice with
  a third-country éditeur remains undocumented in either direction.

---

## 5. Penalties, and who bears them

- **€7,500 per logiciel — charged to the ASSUJETTI (the restaurant)**, not the
  éditeur. CGI art. 1770 duodecies opens « Le fait, pour une **personne
  assujettie à la TVA**… ».
  https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051203251
- **Two different windows, routinely conflated:**
  - **30 days** (LPF art. L. 80 O): after the intervention *procès-verbal*, to
    produce the document. If produced in time, « **l'amende n'est pas
    appliquée** » — no fine at all.
  - **60 days** (1770 duodecies): *after* the fine, to become compliant, or it is
    chargeable again.
- **False attestation — art. 441-7 code pénal** is the on-point offence
  (establishing/using a false *attestation*): 1 year and €15,000, **raised to
  3 years and €45,000** where committed « en vue de porter préjudice au **Trésor
  public** », which is this case. Art. 441-1 (faux et usage de faux, 3 yrs /
  €45,000) is the general offence. BOFiP states these apply to **foreign
  éditeurs** by name.
- **CGI art. 1770 undecies** — for publishers of software *designed to permit
  fraud*: **15 % of turnover** on the product plus joint liability for tax
  evaded. Not aimed at a merely inaccurate attestation, but it is the provision
  that puts an éditeur's own money at risk.
- BOFiP on the éditeur's exposure: an attestation « **engage sa responsabilité**
  sous réserve que les dispositifs techniques garantissant inaltérabilité,
  sécurisation, conservation et archivage **ne sont pas modifiés par un tiers** ».
  That carve-out is worth papering into the customer contract.

---

## 6. What a control actually does

**BOI-CF-COM-20-60** —
https://bofip.impots.gouv.fr/bofip/11316-PGP.html/identifiant=BOI-CF-COM-20-60-20251001

- Agents verify possession of a certificate or attestation **for each software
  and each version held**, and that it **matches the versions actually in use**.
- **« Constatations matérielles » only — they do not test the software.**
- « les agents […] **ne peuvent pas**, dans le cadre de cette procédure,
  examiner la comptabilité » — that is a separate procedure, where the data
  itself can be examined.

**Consequence for this project:** version identification is the thing a control
turns on, which is why **L-53** matters more than its size suggests.

---

## 7. Where HibaPOS stands — measured 2026-09-06, NOT a compliance opinion

| Requirement | Observed in the code | Gap |
|---|---|---|
| Corrections by plus/minus | Refunds are separate `Refund` rows; order totals are never edited; `REMBOURSEMENT` / `ANNULATION` events | — |
| Chaining | `FiscalEvent` SHA-256 hash chain, sealed closes, perpetual `GrandTotal` | unkeyed — **V-01** |
| Three closes | Z (per shift), monthly, annual | daily close is per **shift**, not per day — **L-54** |
| Six-year retention | Stated in the archive notice (`fiscal.ts:648`) and the attestation template | — |
| Archive open format | annual JSON + `sha256sum` manifest | bespoke schema vs the new restitution format — **L-52** |
| Receipt contents | per-rate VAT breakdown + TVA number (Batch 3.6) | **no software identification** — **L-53** |
| Version identification | `package.json` `0.2.1`, read by nothing in `src/` | **L-53** |

---

## 8. Questions for a French fiscal professional

> **Status 2026-09-06 (second research pass, § 9).** Each question now carries
> what public sources settle and what they do not: **1** — text settled, fate of
> the attestation depends on an unpublished décret (§ 9.1); **2** — nothing
> published, no target exists (§ 9.2); **3** — official sources silent, the LNE
> referential expects a key or a signature (§ 9.4); **4** — the text permits a
> foreign éditeur without qualification, practice undocumented (§ 9.3); **5** —
> « prévoir » means provide, nothing defines « journée », and § 170 requires the
> perpetual total to be *recorded* at each close (§ 9.5); **6** — the model's
> wording settled, module names not prescribed (§ 9.6); **7** — texts settled,
> no insurance or professional-body guidance found (§ 9.7). **They remain the
> questions to put to a professional; the answers below say what to bring.**

1. **Does the attestation route survive the 1 Jan 2027 CIBS recodification?**
   (CIBS art. L. 216-40 / L. 216-48 — text not retrieved.) If not, what is the
   real deadline for NF525 or LNE certification?
2. What format satisfies the **restitution** requirement of loi 2026-534 art. 87,
   and is the implementing arrêté published?
3. Is an **unkeyed SHA-256 chain** accepted in DGFiP practice for inaltérabilité
   and sécurisation, or is keying / signing / anchoring expected?
4. Can a **Tunisian-established company with no French, EU or EEA
   establishment** validly issue the attestation, and would DGFiP accept it in
   a control? BOFiP admits « un éditeur établi à l'étranger » without
   qualification — does that extend to a third country outside the EEA in
   practice, and does anything (a French representative, a countersigning
   French accountant, a French subsidiary) materially reduce the restaurant's
   risk? **The restaurant, not the éditeur, carries the €7 500 exposure.**
5. Is a **per-shift Z** accepted as the « clôture journalière », including where
   a service runs past midnight, or must a close be keyed to the calendar day?
6. How should the attestation's **« fonctionnalités exclues »** section be worded
   for a restaurant POS with order, payment and delivery modules?
7. Contractual and insurance implications of the art. 441-7 exposure, and how to
   paper BOFiP's « non modifiés par un tiers » carve-out.

---

## 9. Answers to the seven questions — second pass, 2026-09-06

**Researched 2026-09-06 (Batch 3.7), live web research only.** Labels: **OFFICIAL**
(legifrance, bofip, impots.gouv, economie.gouv, senat, assemblee-nationale),
**SECONDARY** (law firms, publishers), **VENDOR** (POS vendors and certification
bodies — indications of practice, never evidence of the law), **MIRROR** (a
non-official site reproducing an official text where the official page would
not render; flagged each time). Every verdict is one of *SETTLED by official
source*, *INDICATED by secondary/private sources only*, or *NOT CONFIRMED*, and
each answer ends with what could not be found. **Nothing here concludes that
HibaPOS complies with anything.** What the answers change in the code is in
`docs/conformite-isca-map.md`.

*Route note for the next pass:* Legifrance `codes/article_lc/LEGIARTI…` pages
render through a fetch tool; `jorf/id`, `jorf/article_jo`, `codes/section_lc`
and `codes/id/LEGISCTA…` return a table of contents or 404, and direct HTTP is
behind a bot wall. The **concordance tables (XLSX)** on Legifrance download and
parse cleanly and are what settled question 1. BOFiP and senat.fr serve raw
HTML/PDF, so every BOFiP paragraph below is verbatim.

### 9.1 Question 1 — does the attestation route survive 1 January 2027?

**Which article.** The Legifrance concordance table published with ordonnance
n° 2026-671 (JO n° 0174 du 28/07/2026) — OFFICIAL, parsed from the XLSX at
https://www.legifrance.gouv.fr/contenu/Media/files/autour-de-la-loi/codification/tables-de-concordance/code-des-impositions-sur-les-biens-et-services/table-de-concordance_-cibs_avant-apres-ancienne-nouvelle.xlsx
— reads `Code général des impôts | art. 286, I, 3 bis | L. 216-48 | L. 216-40`.
So **CGI 286-I-3° bis → CIBS L. 216-48** (numbering of ord. 2025-1247) **→ CIBS
L. 216-40** (numbering after ord. 2026-671, whose art. 3 replaces the whole
annex — OFFICIAL, https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000054506506).
That resolves the "L. 216-40 vs L. 216-48" discrepancy in § 3 above: LPF L. 80 O
(rewritten 25 June 2026, before the renumbering) cites L. 216-48; CGI 1770
duodecies in its 2027 version cites L. 216-40. **They are the same article.**

**Its text** (Legifrance, CIBS art. L216-48, création ord. 2025-1247 — OFFICIAL,
https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053106701, same text
at `/2027-01-01`):

> « Un décret détermine les caractéristiques auxquelles répondent les systèmes
> informatisés, logiciels ou systèmes de caisse que l'assujetti doit utiliser
> pour comptabiliser les opérations qu'il effectue à titre onéreux et qui ne
> sont pas soumis à l'obligation de facturation prévue à l'article L. 216-38.
> Ces procédés satisfont à des conditions d'inaltérabilité et de sécurisation,
> ainsi que de conservation et d'archivage des données prévues à l'article
> L. 102 B du livre des procédures fiscales, qui en permettent le contrôle par
> l'administration. […] »

The words **« attestation », « certificat », « organisme accrédité » and
« éditeur » do not appear; « décret » does.** The legislative article carries
only the obligation and the four conditions; **the proof regime — certificate
from an accredited body or the éditeur's attestation — is left to a décret**,
i.e. to the CIBS's regulatory part. The concordance rows « art. 286 | déclassé »
and « Nouvel article | base de déclassement | L. 216-49 → L. 216-41 » are
consistent with that. The Rapport au Président on ord. 2025-1247 (OFFICIAL,
https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000053091491): « Bien qu'elle
soit effectuée à droit constant, la constitution du CIBS va au-delà de la
réorganisation des dispositions préexistantes. »

**The sanction and control texts from 1 Jan 2027.** CGI art. 1770 duodecies,
version 01/01/2027, modifié par ord. 2026-671 art. 2 (OFFICIAL,
https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053189017/2027-01-01):
« … de ne pas produire **le certificat prévu en application de** l'article
L. 216-40 du même code attestant que le ou les logiciels ou systèmes de caisse
qu'elle détient satisfont aux obligations prévues par ce même article est
sanctionné par une amende de 7 500 € par logiciel ou système de caisse
concerné. » — the noun « attestation » does not appear, and « prévu en
application de » points at the décret, not the article. LPF art. L. 80 O,
en vigueur depuis 27/06/2026 (OFFICIAL,
https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000036432343), speaks
only of « le certificat » — wording drafted in the Sénat in November 2025
(amendment COM-100), while the attestation had been abolished, and not revised
after loi 2026-103 restored it. BOFiP nevertheless reads L. 80 O as covering
both: BOI-CF-COM-20-60 (25/03/2026, OFFICIAL,
https://bofip.impots.gouv.fr/bofip/11316-PGP.html/identifiant=BOI-CF-COM-20-60-20260325):
« … s'assurer de la détention par l'assujetti contrôlé de l'attestation
individuelle ou du certificat prévus au 3° bis du I de l'article 286 du CGI »;
likewise BOI-CF-INF-20-10-20 § 560 (25/03/2026).

**CGI 286 is abrogated on 1 Jan 2027** (« Abrogé par Ordonnance n°2025-1247 …
art. 9 » — OFFICIAL, https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000051764897/2027-01-01);
what survives until **30 June 2028** is the validity of *references* to the old
CGI articles (ord. 2026-671 art. 17 and 19-I — OFFICIAL LODA view
https://www.legifrance.gouv.fr/loda/id/JORFTEXT000054497160; MIRROR [EXTRAITS]
https://aida.ineris.fr/reglementation/ordonnance-ndeg-2026-671-270726-portant-divers-ajustements-code-impositions-biens).
Rescrit BOI-RES-TVA-000253 (18/02/2026, OFFICIAL): the administration's
interpretation of the replaced CGI provisions « constitue une interprétation
des dispositions » of the new code.

**No décret under L. 216-48 / L. 216-40 has been published** (Legifrance searched
for 2026 décrets on the CIBS partie réglementaire, « systèmes de caisse »,
« D. 216 » / « R. 216 »: nothing), and **BOFiP has published nothing on caisse,
L. 80 O, the recodification or restitution between 10/06/2026 and 02/09/2026**
(actualités pages 1–3). The current administrative position remains
BOI-TVA-DECLA-30-10-30 § 270 (25/03/2026): both routes, « mode de preuve
alternatif ».

**Verdict — SETTLED (text and numbering), NOT CONFIRMED (fate of the attestation).**
Until 31 December 2026 the attestation route is valid. From 1 January 2027 the
proof regime is whatever an **unpublished décret** says; the sanction text
speaks only of « le certificat prévu en application de » that article. Whether
the attestation survives is decided by that décret, and no official source has
said what it will contain. Could not confirm: the verbatim text of L. 216-40 as
re-enacted in Annexe A of ord. 2026-671 (whether it now reads « d'archivage et
de restitution »); the 2027 consolidated L. 80 O; any published or draft décret.

### 9.2 Question 2 — the restitution format of loi 2026-534 art. 87

**The law.** CGI 286-I-3° bis, al. 2, en vigueur depuis 27/06/2026 (OFFICIAL):
« Les données archivées mentionnées au premier alinéa du présent 3° bis sont
restituées dans un format répondant aux normes établies par l'administration. »
Loi n° 2026-534, art. 87 (OFFICIAL, https://www.legifrance.gouv.fr/jorf/article_jo/JORFARTI000054310065):
I rewrites LPF L. 80 O; II-1° adds the sentence above; II-2° creates CGI 1770
quaterdecies (€7 500 per payment terminal not presented); III replaces « et
d'archivage » by « , d'archivage et de restitution » in CIBS L. 216-48.

**Who fixes the norms, how, by when.** The statute says only « normes établies
par l'administration » — **no instrument (arrêté / décret / BOFiP), no deadline,
and no clause conditioning the obligation on the prior publication of those
norms.** The FEC arrêté (LPF A. 47 A-1) concerns the *comptabilité*, not the
caisse archive (BOI-TVA-DECLA-30-10-30 § 70), and nothing found links the new
sentence to it.

**Parliamentary intent.** Sénat amendment **n° 146 rect.** (12/11/2025, groupe
RDPI, Gouvernement « Favorable », adopté — OFFICIAL,
https://www.senat.fr/enseance/2025-2026/112/Amdt_146.html), objet: « Les
données des logiciels ou systèmes de caisse doivent pouvoir être exportées afin
d'en permettre le contrôle par l'administration fiscale. Les agents sont
toutefois confrontés à de nombreux formats de fichiers qui rendent complexe leur
exploitation par l'administration fiscale. Afin de lever ces difficultés, il est
proposé de rendre obligatoire l'utilisation d'un format informatique standard. »
The objet names no existing standard. CMP comparative table: OFFICIAL,
https://www.senat.fr/rap/l25-570/l25-570.pdf (art. 20 ter).

**Is anything published? No.** Searched: Legifrance arrêtés 2026; BOFiP
actualités 10/06–02/09/2026; BOI-TVA-DECLA-30-10-30 (last version 25/03/2026,
*before* the law — its § 230 still says only « les données d'archivage doivent
être enregistrées dans un format ouvert. Une notice explicative en langue
française doit être jointe au contenu de l'archive. »); BOI-CF-COM-20-60; the
impots.gouv.fr professional FAQ (« mis à jour le 21/05/2026 »); the 2017 DGFiP
FAQ. Vendor pages tying the format to the September 2027 e-reporting are
speculation.

**Verdict — SETTLED that nothing is published; NOT CONFIRMED as to the format.**
Consequence for L-52: **no target exists; nothing can be built**, and the
obligation is nonetheless in force with no suspensive condition. Could not
confirm: whether the DGFiP intends to reuse the FEC, the e-reporting format, or
a new « fichier des écritures de caisse ».

### 9.3 Question 4 — a Tunisian éditeur with no French, EU or EEA establishment

BOI-TVA-DECLA-30-10-30 (25/03/2026, OFFICIAL,
https://bofip.impots.gouv.fr/bofip/10691-PGP.html/identifiant=BOI-TVA-DECLA-30-10-30-20260325):

- **§ 365**: « Cette attestation est délivrée à l'assujetti, spontanément ou à sa
  demande, par l'éditeur du logiciel ou système de caisse au titre de la version
  vendue ou fournie. L'attestation peut être délivrée par un éditeur établi à
  l'étranger à condition d'être, soit rédigée en français, soit rédigée en
  langue étrangère et accompagnée d'une traduction en français certifiée. »
- **§ 370**: « L'attestation doit être individuelle, c'est-à-dire délivrée
  nominativement à l'assujetti à la TVA qui la produit. … L'attestation doit
  être établie par l'éditeur du logiciel ou du système de caisse ou par son
  représentant légal lorsqu'il s'agit d'une société. »
- **§ 300**: « On entend par « éditeur » du logiciel ou du système de caisse la
  personne qui détient le code source du logiciel ou système de caisse et qui a
  la maîtrise de la modification des paramètres de ce produit. »
- **§ 320** (certificate route): the EU condition is attached to the
  *accreditation body* (« instance nationale d'accréditation située en France ou
  dans un autre État membre de l'Union européenne ») and appears **only** in
  the certificate route.
- **§ 400**: « Ces peines s'appliquent également aux éditeurs étrangers qui
  délivreraient de fausses attestations ou de fausses copies de certificat à des
  assujettis à la TVA en France. » **§ 410**: « En cas de doute, l'administration
  peut s'assurer de l'authenticité du document … auprès de … l'éditeur qui est
  censé l'avoir émis. »

The model attestation (BOI-LETTRE-000242) has no nationality, establishment,
SIREN or address field. **No text** — CGI 286-I-3° bis, 1770 duodecies, LPF
L. 80 O, BOI-TVA-DECLA-30-10-30 §§ 270–420, BOI-CF-COM-20-60, BOI-CF-INF-20-10-20
§§ 550–580 — requires the éditeur to have a French or EU establishment or a
représentant fiscal; every obligation and the fine fall on « la personne
assujettie à la TVA ». The DGFiP FAQ of 28/07/2017 (OFFICIAL,
https://www.economie.gouv.fr/files/files/directions_services/dgfip/controle_fiscal/actualites_reponses/logiciels_de_caisse.pdf)
Q40 addresses foreign éditeurs only under the certificate route and never uses
« pays tiers » or « hors Union européenne ». No rescrit, decision or
parliamentary answer on a third-country éditeur's attestation was found in
either direction.

**Verdict — SETTLED that the text permits it; NOT CONFIRMED as to practice.**
The only condition is the French language or a certified translation, needed
only when the attestation is not drafted in French. Could not confirm: any
source distinguishing EU from third-country éditeurs; any evidence of DGFiP
practice; whether the post-2027 décret keeps the tolerance.

### 9.4 Question 3 — an unkeyed SHA-256 chain

**Official** (BOI-TVA-DECLA-30-10-30, 25/03/2026): **§ 60** « Le législateur n'a
pas défini de cahier des charges, ni de solution technique. » **§ 100** « …
cette inaltérabilité est garantie par la preuve que la donnée n'a pas été
modifiée depuis son enregistrement (empreinte numérique à clé privée, chaînage,
etc.). » **§ 120** « La garantie d'inaltérabilité peut être obtenue par toute
technique permettant : d'empêcher l'accès de l'utilisateur à des fonctionnalités
de modification des données validées ; de détecter tout accès/modification des
données … et de tracer toute éventuelle modification ; de démontrer que ces
données de règlement n'ont pas été modifiées depuis leur enregistrement initial ;
de fournir un système de preuve en ce sens. » **§ 140** « Il peut notamment
s'agir d'une technique de chaînage des enregistrements ou de signature
électronique des données. » DGFiP FAQ 2017 Q19: « L'administration fiscale
n'impose aucune solution technique (empreinte électronique, chaînage des
opérations...) … Toute modification ou correction doit être détectable. »
**Neither says whether a chain without a secret suffices.**

**Private referential — VENDOR, indication of practice only.** LNE, « Référentiel
de certification des systèmes d'encaissement » rév. 1.7 (juillet 2024; copy at
https://www.eoxia.com/wp-content/uploads/2024/11/referentiel-certification-systemes-caisse.pdf),
Exigence 8: « L'inaltérabilité des données peut être garantie par : 1) la
preuve de l'authenticité et de l'intégrité des données qui peut être un
chainage d'empreintes à clé, ou un chainage des signatures de chaque
enregistrement. … **La clé doit être générée par un procédé fiable et
l'utilisateur final (le professionnel assujetti) ne doit pas pouvoir en avoir
connaissance** … Les exemples de mécanismes d'empreinte à clé suivants sont
acceptables : HMAC-SHA-256, HMAC-SHA3. Les exemples de fonctions de hachage
suivants sont non acceptables : SHA-1, MD5, CRC16, CRC32 … » and « dans le cas
d'un système d'encaissement déployé sur un poste pour lequel l'utilisateur
dispose des droits administrateurs il est nécessaire de se prémunir d'une
**restauration des données dans un état antérieur. L'opération doit être
détectée ou rendue impossible.** » Plain SHA-256 is in neither list. NF525's
rules are not public; INFOCERT's page names « la génération du condensat,
l'apposition d'une signature électronique ou … solution alternative
équivalente ».

**Verdict — NOT CONFIRMED (official); INDICATED by private referentials that a
key or signature is expected.** What this changes for V-01: the question is no
longer only "is unkeyed accepted" but also "is a restore to an earlier state
detected or prevented" — HibaPOS journals a restore made *through the
application* (`RESTAURATION`) and detects nothing done to the file outside it
(`docs/conformite-isca-map.md` § 1.6). Could not confirm: any DGFiP rescrit or
decision; the NF525 rules; whether attestation-route software is held to the
LNE level at all (the L. 80 O control is « constatations matérielles » only).

### 9.5 Question 5 — a per-shift Z as the « clôture journalière »

**Official.** BOI-TVA-DECLA-30-10-30 **§ 170** (25/03/2026):

> « Les logiciels ou systèmes de caisse … doivent **prévoir** obligatoirement
> une clôture journalière et une clôture mensuelle et annuelle (ou par exercice
> lorsque l'exercice ne coïncide pas avec l'année civile). Ces trois échéances
> sont cumulatives et impératives. **Pour chaque clôture, des données
> cumulatives et récapitulatives, intègres et inaltérables, doivent être
> calculées et enregistrées par le logiciel ou système de caisse, comme le cumul
> du grand total de la période et le total perpétuel pour la période.** »
> « On entend par « cumul du grand total de la période » le cumul de chiffre
> d'affaires décompté depuis l'ouverture de la période comptable en cours. On
> entend par « total perpétuel » le cumul de chiffre d'affaires décompté depuis
> le début de l'utilisation du logiciel ou système de caisse. … Dans le cas d'un
> simple changement de version d'un logiciel, tous les compteurs doivent
> continuer à être incrémentés sans être remis à zéro. … Ces données cumulatives
> et récapitulatives ne doivent donc jamais être purgées. »

**§ 180**: « Cette obligation de conservation porte sur toutes les données
enregistrées ligne par ligne, et pas seulement sur le Z de caisse … Un assujetti
qui ne conserve que les Z de caisse ne respecte pas les obligations de
conservation. » BOFiP **never defines « journée »**, never mentions minuit,
services, shifts or « journée d'exploitation », and never says the software
must force or automate the close. DGFiP FAQ 2017 Q29–Q30 repeat the three
closes and the totals and contain **no question on establishments straddling
midnight**.

**Private referential — VENDOR.** LNE rév. 1.7, Exigence 6: « Le système
d'encaissement doit prévoir des fonctionnalités de clôture journalières,
mensuelles et annuelles. … Le système d'encaissement ne doit pas permettre
d'enregistrer de nouvelles transactions, de modifier ou d'annuler une
transaction sur une période clôturée. **Si la clôture doit être réalisée par
l'utilisateur, celui-ci doit être informé de cette possibilité et de la
responsabilité qui lui incombe.** » and « Ces clôtures peuvent être réalisées
automatiquement par le système d'encaissement ou faites par l'utilisateur. …
Il est possible d'avertir l'utilisateur de la nécessité de réaliser les
clôtures par tout moyen adéquat (affichage sur l'interface du système, notice
d'utilisation, contrat, etc.). » Exigence 7: « Pour chaque clôture, le système
d'encaissement doit enregistrer et sécuriser le total cumulatif de la période et
le total perpétuel comme toute autre donnée d'encaissement. » LNE does not
define « journée » either.

**Verdict — NOT CONFIRMED (per-shift / past-midnight); SETTLED that « prévoir »
means provide, not force.** Two consequences for the code. **L-54**: no source
accepts or rejects a per-shift close as the daily one, so the defect the
research can establish is the *label* (a shift seal called « clôture
journalière ») and the absence of any notice to the operator; both are fixed in
Batch 3.7, and whether a till may stay open into the next day is a business
decision (DD-23). **L-57 (new)**: § 170 requires that *for each close* the
software **calculate and record** cumulative data « comme … le total
perpétuel » — HibaPOS maintains the perpetual total and records it in no close.
Could not confirm: any definition of the daily period; any source on several Z
per day or on services past midnight.

### 9.6 Question 6 — the « fonctionnalités couvertes / exclues » section

**Model** (BOI-LETTRE-000242, 25/03/2026, OFFICIAL,
https://bofip.impots.gouv.fr/bofip/10692-PGP.html/identifiant=BOI-LETTRE-000242-20260325),
volet 1: « … éditeur du logiciel / système de caisse *nom et références*,
atteste que ce logiciel/système **OU les fonctionnalités de caisse de ce
logiciel/système** (1), mis sur le marché à compter du DATE, dans sa version
n° … satisfait OU satisfont aux conditions … » then the two lines to fill:
« **Le périmètre couvert par cette attestation concerne les fonctionnalités
suivantes : (1)** » and « **Les fonctionnalités suivantes ne sont pas couvertes
par cette attestation : (1)** », « (1) À adapter et à compléter selon le cas ».
The remark cites **art. 441-1** (3 ans / 45 000 €).

**What « fonctionnalités » means** (BOI-TVA-DECLA-30-10-30): **§ 30** the
fonctionnalité de caisse « consiste à mémoriser et à enregistrer
extra-comptablement des paiements reçus en contrepartie d'une vente de
marchandises ou de prestations de services … quel que soit le mode de
règlement … y compris en cas d'enregistrement sur un logiciel ou système de
caisse accessible en ligne »; order kiosks without a payment function, weighing,
stand-alone payment terminals and PSPs are outside. **§ 40**: « seule la
fonctionnalité de caisse enregistreuse et encaissement, et non l'ensemble du
logiciel, doit être sécurisée. » **§ 50**: the data in scope are « toutes les
données liées à la réalisation d'une transaction … ainsi que … à la réception
(immédiate ou attendue) du paiement », listed line by line — as rendered by
this pass: numéro du justificatif, date (année-mois-jour-heure-minute), numéro
de la caisse, montant TTC, détail des articles (libellé, quantité, prix
unitaire, total HT de la ligne, taux de TVA), mode de règlement, traces de
modifications et corrections. *Re-read § 50 verbatim before relying on the
list.* FAQ 2017 Q22: « Les données de l'opération doivent être inaltérables de
la prise de commande jusqu'à l'enregistrement du règlement. » LNE (VENDOR)
Exigence 20 asks the éditeur to « définir clairement le périmètre fiscal … et
lister de façon exhaustive tous les fichiers du code source, des librairies,
pilotes et modules » that affect the four conditions, tied to major-version
numbering; INFOCERT treats invoicing as a separate scope (NF203).

**Verdict — SETTLED (wording); INDICATED (how to delimit).** The covered list
names the encaissement function and its data; the excluded list names the
non-caisse modules. No official source prescribes module names. The list
derived from HibaPOS's code is `docs/conformite-isca-map.md` § 8.

### 9.7 Question 7 — art. 441-7 and the « non modifiés par un tiers » carve-out

**Art. 441-7 code pénal** (version LOI 2018-778; OFFICIAL header
https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000037398925, full text
from the MIRROR https://code-penal.fr/article-441-7-a37398925.html): « … est
puni d'un an d'emprisonnement et de 15 000 euros d'amende le fait : 1° D'établir
une attestation ou un certificat faisant état de faits matériellement inexacts ;
2° De falsifier une attestation ou un certificat originairement sincère ; 3° De
faire usage d'une attestation ou d'un certificat inexact ou falsifié. Les peines
sont portées à trois ans d'emprisonnement et à 45 000 euros d'amende lorsque
l'infraction est commise soit en vue de porter préjudice au Trésor public … »
BOFiP and the model cite **441-1**; both articles are now in
`docs/attestation-conformite.md`.

**The carve-out, verbatim.** BOI-TVA-DECLA-30-10-30 **§ 300**: « Une attestation
délivrée par un éditeur engage sa responsabilité sous réserve que les
dispositifs techniques garantissant inaltérabilité, sécurisation, conservation
et archivage ne sont pas modifiés par un tiers. » **§ 310**: for software
« conçu de manière ouverte », the éditeur is « le dernier intervenant ayant
paramétré le logiciel ou système de caisse lorsque son intervention a eu pour
objet ou effet de modifier un ou des paramètres permettant le respect des
conditions ». BOI-CF-COM-20-60: « L'utilisateur, l'éditeur du logiciel ou
système, l'émetteur d'attestation individuelle et l'organisme certificateur
pourront également être passibles de sanctions pénales ». The assujetti's own
duties, useful for allocating responsibility: § 290 (keep the fiscal functions
up to date and hold the matching document) and § 250 (six-year retention).

**Verdict — SETTLED (texts); NOT CONFIRMED (insurance / professional-body
guidance).** One law-firm note (Lexing, 20/04/2017, SECONDARY,
https://www.alain-bensoussan.com/avocats/demarches-conformite-logiciel-de-caisse/2017/04/20/)
says the attestation « ne gère pas les problématiques posées en termes de
répartition des responsabilités entre l'éditeur et son client » and points to
the licence / maintenance contract. Nothing from professional bodies or
insurers was found, and no case law applying 441-1 / 441-7 to a caisse
attestation.

### 9.8 What this pass could not confirm — consolidated

1. The verbatim text of CIBS L. 216-40 as re-enacted by ord. 2026-671 Annexe A.
2. The « base de déclassement » article L. 216-49 → L. 216-41.
3. The 2027 consolidated version of LPF L. 80 O.
4. Any décret, published or draft, fixing the proof regime from 1 Jan 2027.
5. Any text fixing the restitution format, or tying it to the FEC or e-reporting.
6. The full verbatim of loi 2026-534 art. 87 and any AN committee commentary.
7. Any source using « pays tiers » for the attestation route; any DGFiP practice with third-country éditeurs.
8. Any rescrit, decision or doctrine on unkeyed hash chains.
9. Any definition of « journée » or treatment of services past midnight.
10. The NF525 rules (not public).
11. Any professional-body or insurer guidance on the éditeur's liability.

### 9.9 Sources used in this pass

| Source | Label | Version / date |
|---|---|---|
| Legifrance concordance tables CIBS (JO 28/07/2026 and JO 20/12/2025), XLSX | OFFICIAL | parsed 2026-09-06 |
| CIBS art. L216-48 — LEGIARTI000053106701 | OFFICIAL | création ord. 2025-1247 (only version shown) |
| CGI 1770 duodecies — LEGIARTI000053189017/2027-01-01 | OFFICIAL | version 01/01/2027 |
| LPF L. 80 O — LEGIARTI000036432343 | OFFICIAL | en vigueur 27/06/2026 |
| CGI 286 — LEGIARTI000051764897 (and /2027-01-01) | OFFICIAL | 27/06/2026; abrogé 01/01/2027 |
| Ord. 2026-671 — JORFTEXT000054497160 (LODA), rapport JORFTEXT000054497139 | OFFICIAL | 28/07/2026 |
| Ord. 2025-1247 rapport — JORFTEXT000053091491 | OFFICIAL | 18/12/2025 |
| Loi 2026-534 art. 87 — JORFARTI000054310065 | OFFICIAL | structure only rendered |
| C. pén. 441-7 — LEGIARTI000037398925; mirror code-penal.fr | OFFICIAL / MIRROR | version 2018-778 |
| BOI-TVA-DECLA-30-10-30-20260325 | OFFICIAL | 25/03/2026 (latest) |
| BOI-LETTRE-000242-20260325 | OFFICIAL | 25/03/2026 |
| BOI-CF-COM-20-60-20260325 | OFFICIAL | 25/03/2026 (latest — supersedes the 01/10/2025 version cited in § 6 above) |
| BOI-CF-INF-20-10-20-20260325 §§ 550–580 | OFFICIAL | 25/03/2026 |
| BOI-RES-TVA-000253-20260218 | OFFICIAL | 18/02/2026 |
| BOFiP actualités, pages 1–3 | OFFICIAL | 10/06/2026 → 02/09/2026 |
| DGFiP FAQ logiciels de caisse (economie.gouv.fr PDF) | OFFICIAL | 28/07/2017 |
| impots.gouv.fr professional FAQ | OFFICIAL | mis à jour 21/05/2026 |
| Sénat: amendements 146 rect., 56, COM-100; rapport CMP l25-570; avis a25-106; QE 06541 | OFFICIAL | Nov 2025 – Jan 2026 |
| LNE référentiel de certification des systèmes d'encaissement, rév. 1.7 (copy on eoxia.com) | VENDOR | juillet 2024 |
| INFOCERT NF525 pages and brochure | VENDOR | read 2026-09-06 |
| Kohen Avocats (10/07/2026); Lexing / Alain Bensoussan (20/04/2017) | SECONDARY | as dated |
