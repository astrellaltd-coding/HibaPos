// Column layout for the printed tickets (L-21 Batch 1.3b, L-63 Batch 1.3c).
//
// WHY THIS MODULE EXISTS
// ---------------------
// Three renderers put text on the same 32–48 column paper — `renderReceipt`,
// `renderDayCloseTicket` and `renderTestPage` — and each carried its own copy
// of the same three-line `center()` helper. All three copies had the same
// defect: they padded a string towards the middle of the paper and returned it
// untouched when it was already wider. `leftRight` had a second one, of a
// different shape. Fixing one copy fixed one ticket.
//
// Nothing downstream can rescue an over-long line: `buildPrintJob()` passes the
// text through verbatim on purpose (`escpos.ts`), because the printed ticket
// must equal the archived `Receipt.content` byte for byte. Layout happens here
// or it does not happen.
//
// THE RULE EVERY FUNCTION HERE OBEYS
// ----------------------------------
// **A line that already fits is returned byte-identical.** That is what makes
// the receipt snapshots the proof that a change here cannot alter a ticket that
// was already correct — and it is why over-applying the wrap breaks eight
// pre-existing tests immediately.
//
// **Nothing is ever truncated.** BOFiP § 50 lists « détail des articles
// (libellé, quantité, prix unitaire, total HT de la ligne, taux de TVA) » among
// the data in scope for the fonctionnalité de caisse, so an ellipsis on an
// article's designation would remove required information from a fiscal
// document in order to make it fit the paper.
//
// Lengths are counted in UTF-16 units, which is what the original helpers used.
// For the French repertoire these tickets print that equals the printed column
// count; a combining mark would over-count by one and wrap a column early,
// which errs towards fitting the paper.

/**
 * Whitespace a line may be broken at — ORDINARY whitespace only.
 *
 * `\s` would have included U+00A0. `formatEuro` goes through Intl fr-FR, which
 * puts a NO-BREAK SPACE before the euro sign and a narrow one between the
 * thousands, and those characters exist precisely to forbid the break this
 * function would otherwise take: the first rendering of a wrapped add-on line
 * read `+ Supplément … (1,50` / `€)`, with the amount torn in half on a fiscal
 * document. Splitting on `\s+` would also have silently replaced the NBSP with
 * a plain space when the parts were re-joined, changing the bytes of the
 * archived `Receipt.content`.
 *
 * "Whitespace that is not one of these three" — the standard negated-class
 * trick, because JavaScript has no `\s`-minus-NBSP shorthand.
 */
const BREAKING_SPACE = /[^\S\u00a0\u202f\u2009]+/;

/**
 * Break a string into lines no wider than `width`.
 *
 * Word-wraps on BREAKING whitespace; a single token wider than the paper is
 * **hard-broken**, because word-wrapping alone cannot place it and emitting it
 * whole would reinstate the defect for the one input that provokes it.
 *
 * A string that already fits is returned unchanged, in a single-element array.
 */
export function wrapToWidth(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  // Guard rather than an expected path: a caller that computed a non-positive
  // budget would otherwise loop forever on `token.slice(0, 0)`.
  if (width < 1) return [text];
  const out: string[] = [];
  let current = "";
  const flush = () => {
    if (current.length > 0) out.push(current);
    current = "";
  };
  for (const word of text.split(BREAKING_SPACE)) {
    if (word.length === 0) continue;
    let token = word;
    while (token.length > width) {
      flush();
      out.push(token.slice(0, width));
      token = token.slice(width);
    }
    if (current.length === 0) current = token;
    else if (current.length + 1 + token.length <= width) current += ` ${token}`;
    else {
      flush();
      current = token;
    }
  }
  flush();
  // Only reachable from a string that is all whitespace and wider than the
  // paper. It has no words to lay out, so it collapses to one empty line
  // rather than to nothing, which would silently drop a line from the ticket.
  return out.length > 0 ? out : [""];
}

/** Pad a single line towards the middle. Assumes it already fits. */
function pad(text: string, width: number): string {
  return " ".repeat(Math.max(0, Math.floor((width - text.length) / 2))) + text;
}

/**
 * Centre `text` on the paper, wrapping it first if it does not fit.
 *
 * Returns one line per printed line. For a string that fits this is exactly
 * the `" ".repeat(…) + str` the three renderers used to inline.
 */
export function centred(text: string, width: number): string[] {
  return wrapToWidth(text, width).map((line) => pad(line, width));
}

/** Left text, right text, one line, the gap between them filled. */
function justify(left: string, right: string, width: number): string {
  return left + " ".repeat(Math.max(1, width - left.length - right.length)) + right;
}

/** Push a line to the right margin. Unlike `justify` it forces no separator,
 *  because there is nothing on the left for it to separate from. */
function alignRight(text: string, width: number): string {
  return " ".repeat(Math.max(0, width - text.length)) + text;
}

/**
 * A label on the left and an amount on the right, laid out across as many
 * lines as the label needs (L-63).
 *
 * The old one-liner clamped the **gap** to a single space, so an over-wide
 * pair was emitted as `left + " " + right` — past the paper, with the amount
 * pushed off the edge.
 *
 * The label is wrapped to the room the amount leaves it and the amount is
 * right-aligned on the **last** line, so every printed article still ends with
 * exactly one amount — which is what keeps a wrapped label distinguishable
 * from the start of a new article.
 *
 * Byte-identical when the pair fits, and that is a property of the arithmetic
 * rather than a special case: the label's budget is `width − right − 1`, so
 * `wrapToWidth` returns the label unwrapped exactly when
 * `left.length + 1 + right.length ≤ width` — the same inequality that decides
 * whether the pair fits at all.
 */
export function leftRight(left: string, right: string, width: number): string[] {
  const budget = width - right.length - 1;
  if (budget < 1) {
    // The amount alone fills the paper. Nothing sensible can share its line,
    // so the label gets its own lines and the amount gets one of its own,
    // pushed right. Unreachable with real money at 32 columns or more; present
    // so the function has no undefined behaviour.
    //
    // `justify("", right, …)` would NOT do — it forces a separator space it has
    // nothing to separate, which put the line one character over the paper. The
    // guard's own test caught that.
    return [
      ...wrapToWidth(left, width),
      ...wrapToWidth(right, width).map((line) => alignRight(line, width)),
    ];
  }
  const lines = wrapToWidth(left, budget);
  const last = lines.length - 1;
  lines[last] = justify(lines[last], right, width);
  return lines;
}

/**
 * A marked sub-line — an option (`· `) or an add-on (`+ `) under its article.
 *
 * `indent` is the whole prefix of the first line, marker included ("  · ");
 * continuations line up under the TEXT rather than under the marker, so a
 * wrapped choice can never be mistaken for a second choice.
 */
export function marked(indent: string, text: string, width: number): string[] {
  const continuation = " ".repeat(indent.length);
  const lines = wrapToWidth(text, Math.max(1, width - indent.length));
  return lines.map((line, i) => (i === 0 ? indent : continuation) + line);
}
