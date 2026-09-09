// The VAT allocation policy, as the application states it (Batch 5.9f).
//
// The operator's ruling of 2026-09-09 is that the policy lives in
// `docs/politique-ventilation-tva.md` AND in Réglages, so the person running
// the till can read the method without opening a repository.
//
// ⚠ READ-ONLY, AND DELIBERATELY NOT A SETTING THE OPERATOR CAN EDIT.
// An editable field would let the stated method drift from the implemented one
// — a document claiming a division the software does not perform is worse than
// no document, and it is exactly the kind of untruth `REMEDIATION_PLAN.md`'s
// safety rule 12 is about. These sentences describe `services/combo.ts`; change
// them together or not at all.
//
// The document is the authority for a fiscal control; this is a faithful
// summary of it, and it says so.

export const VAT_ALLOCATION_POLICY = {
  title: "Ventilation de la TVA — menus à prix forfaitaire",
  source: "docs/politique-ventilation-tva.md",
  /** § 2 — the rule. */
  method:
    "Le prix d'un menu est réparti au prorata des prix de vente à l'unité de ses composants, " +
    "tels qu'ils figurent au catalogue pour le mode de vente concerné. Chaque part relève ensuite " +
    "du taux propre à son composant.",
  /** § 2, last paragraph. */
  dineIn:
    "Sur place, aucune ventilation n'a lieu : tous les composants relèvent de 10 %, il n'y a donc " +
    "rien à répartir.",
  /** § 4 — the fallback. */
  fallback:
    "Si un menu ne peut pas être ventilé — composant sans prix de référence, composition incomplète, " +
    "taux non résolu — la totalité du prix est imposée au taux le plus élevé des taux en présence " +
    "(10 %). Le logiciel majore, jamais ne minore. La configuration d'un menu incomplet est refusée " +
    "à l'enregistrement, pour que ce repli ne se déclenche pas en service.",
  /** § 6 — supplements. */
  supplements:
    "Un supplément n'entre pas dans la ventilation : il est facturé en sus du prix du menu et relève " +
    "de son propre taux. Le forfait ventilé reste le prix du menu seul.",
  /** § 8 — what is not settled. This sentence is the reason the block exists
   *  at all, and it must not be softened: the rates are live and verified, the
   *  METHOD of dividing a forfait between them is a claim nobody qualified has
   *  signed off. `REMEDIATION_PLAN.md` safety rule 13 forbids claiming French
   *  fiscal compliance from automated testing. */
  pending:
    "La méthode de ventilation elle-même, le repli au taux supérieur et le traitement des suppléments " +
    "restent à faire confirmer par le comptable de l'établissement. Ce texte n'est ni un conseil " +
    "juridique ni une attestation.",
} as const;
