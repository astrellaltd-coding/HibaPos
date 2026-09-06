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
