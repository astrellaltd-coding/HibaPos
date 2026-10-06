/**
 * L-260 — what deleting a client does, in the words both screens show.
 *
 * One sentence, shared by « Clients » and the caisse's picker, so the two
 * confirmations cannot drift into promising different things. It says what the
 * DELETE route does since 2026-10-06: the person is erased, their past orders
 * stay — amounts, VAT, ticket — without a name.
 */
export const CUSTOMER_ERASE_CONSEQUENCE =
  "Ses coordonnées seront effacées définitivement. Ses commandes passées restent, sans son nom.";
