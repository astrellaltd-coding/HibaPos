import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import "@/lib/zod-locale";
import { humaniseZodMessage } from "@/lib/zod-locale";
import { z } from "zod";

// R9.10 — L-149 and L-150: what the operator actually reads.
//
// Both are small and both are the same kind of defect: text written for a
// developer reaching a restaurant. « 1 caisses » is a raw count with a hard
// plural; « Trop grand : string doit avoir <=500 caractères » is TypeScript
// with accents on it.
//
// L-150 is the remainder of L-22, which installed `z.locales.fr()` so that
// validation errors stopped arriving in English. The locale translates the
// SENTENCE and leaves the type name and the comparison operator inside it —
// and **24 API routes hand `parsed.error.issues[0]?.message` straight to the
// client**, which is why L-22 existed at all.


/**
 * Source with its comment bodies blanked — line comments and block comments.
 *
 * A fix whose comment explains what it replaced is indistinguishable, to a
 * substring search, from the code it replaced: an assertion that the old shape
 * is gone matches the sentence saying it is gone. Five separate assertions in
 * this session have had that bug.
 *
 * Blanked rather than removed, so offsets — and therefore any line number in a
 * failure message — still line up with the real file.
 */
function withoutComments(src: string): string {
  const BLOCK = new RegExp("/\\*[\\s\\S]*?\\*/", "g");
  return src
    .replace(BLOCK, (m) => " ".repeat(m.length))
    .split("\n")
    .map((l) => (/^\s*(\/\/|\*)/.test(l) ? " ".repeat(l.length) : l))
    .join("\n");
}

describe("L-150 — the French is French, not TypeScript with accents", () => {
  it("replaces the type names zod uses", () => {
    // The four the audit measured on four deliberately malformed checkouts.
    expect(z.string().max(500).safeParse("x".repeat(501)).error?.issues[0]?.message).toBe(
      "Trop grand : texte doit avoir au plus 500 caractères",
    );
    expect(z.number().int().safeParse(1.5).error?.issues[0]?.message).toBe(
      "Entrée invalide : nombre entier attendu, nombre reçu",
    );
    expect(z.number().safeParse("x").error?.issues[0]?.message).toBe(
      "Entrée invalide : nombre attendu, texte reçu",
    );
    expect(z.string().min(3).safeParse("a").error?.issues[0]?.message).toBe(
      "Trop petit : texte doit avoir au moins 3 caractères",
    );
  });

  it("leaves no bare type name or operator in any message", () => {
    // The property rather than the four examples: whatever zod says, none of
    // these words reaches a screen. A schema shape nobody has written yet is
    // covered by this and not by the assertions above.
    const cases = [
      z.string().max(1).safeParse("xx"),
      z.string().min(5).safeParse("x"),
      z.number().int().safeParse(1.5),
      z.number().safeParse("x"),
      z.string().safeParse(42),
      z.boolean().safeParse("yes"),
      z.array(z.string()).safeParse("x"),
      z.object({ a: z.string() }).safeParse("x"),
      z.number().max(10).safeParse(11),
      z.number().min(10).safeParse(9),
      z.string().safeParse(null),
      z.string().safeParse(undefined),
    ];
    const forbidden = /\b(string|number|int|bigint|boolean|array|object|undefined)\b|<=|>=/;
    for (const c of cases) {
      const message = c.error?.issues[0]?.message ?? "";
      expect(message.length, "a failing parse produced no message").toBeGreaterThan(0);
      expect({ message, leaks: forbidden.test(message) }).toEqual({ message, leaks: false });
    }
  });

  it("does not touch a per-field message, which zod prefers anyway", () => {
    // `validation.ts` declares 19 French messages, and L-22's note says the
    // locale « cannot regress them ». Wrapping the locale must not either.
    const custom = "Le code doit contenir 6 chiffres";
    expect(z.string().min(6, { message: custom }).safeParse("1").error?.issues[0]?.message).toBe(
      custom,
    );
  });

  it("leaves a message with nothing to fix exactly as it was", () => {
    expect(humaniseZodMessage("Ce champ est requis")).toBe("Ce champ est requis");
    expect(humaniseZodMessage("")).toBe("");
  });

  it("spells the operators rather than printing them", () => {
    expect(humaniseZodMessage("doit avoir <=500 caractères")).toContain("au plus 500");
    expect(humaniseZodMessage("doit avoir >=3 caractères")).toContain("au moins 3");
    expect(humaniseZodMessage("doit être <10")).toContain("moins de 10");
    expect(humaniseZodMessage("doit être >10")).toContain("plus de 10");
  });

  it("does not mangle `bigint` into « nombre entierger »", () => {
    // Longest-first ordering. `int` is a substring of `bigint`, and replacing
    // the short one first produces nonsense — the kind a French reader notices
    // and a developer does not.
    expect(humaniseZodMessage("bigint attendu")).toBe("nombre entier attendu");
  });

  it("does not touch a word that merely CONTAINS a type name", () => {
    // Word boundaries. « intérieur », « numéro », « objectif » are French.
    for (const word of ["intérieur", "objectif", "datent", "stringer"]) {
      expect({ word, out: humaniseZodMessage(word) }).toEqual({ word, out: word });
    }
  });
});

describe("L-149 — « 1 caisses »", () => {
  const src = readFileSync(
    path.join(process.cwd(), "src/features/shifts/shifts-view.tsx"),
    "utf8",
  );

  it("pluralises the caisse count", () => {
    // The rest of the product uses `N vente(s)` / `N mouvement(s)`. Read as
    // source because it is a rendered string in a screen this suite cannot
    // render — the same limit `login-screen-refusal.test.ts` records.
    expect(src, "the hard plural is back").not.toContain("} caisses\n");
    expect(src).toContain('caisse{(shifts?.length ?? 0) > 1 ? "s" : ""}');
  });
});

describe("L-148 — the stopwatch measures the caisse, or is not shown", () => {
  const src = readFileSync(path.join(process.cwd(), "src/components/shared/topbar.tsx"), "utf8");

  it("derives the duration from openedAt, not from component mount", () => {
    // « Caisse fermée · 00:00:08 » with no shift open — an unlabelled
    // stopwatch, beside the one badge that makes it look like it measures the
    // till. It counted from mount and reset on every reload.
    expect(src, "the mount-time timer is back").not.toContain("function useSessionTimer");
    expect(src).toContain("useShiftTimer");
    expect(src).toContain("new Date(openedAt).getTime()");
  });

  it("renders nothing when no shift is open", () => {
    expect(src).toContain("{shiftTime && (");
  });

  it("labels it, so it is not an unexplained number", () => {
    expect(src).toContain("Durée d'ouverture de la caisse");
  });
});

describe("L-133 — the step-up PIN can be entered on a touch-only till", () => {
  const src = readFileSync(
    path.join(process.cwd(), "src/components/pos/step-up-pin-dialog.tsx"),
    "utf8",
  );

  it("offers a keypad, as the login screen does", () => {
    // The login screen has a full on-screen keypad; this dialog — which gates
    // EVERY refund and EVERY discount above 20 % — was a bare password field
    // relying on the OS touch keyboard appearing. The asymmetry is certain;
    // whether the keyboard appears depends on hardware nobody here can see,
    // which is why the audit could only mark this SUSPECTED.
    expect(src).toContain("Pavé numérique");
    // Every digit, and the zero separately — it sits outside the 1-9 map.
    expect(src).toContain('["1", "2", "3", "4", "5", "6", "7", "8", "9"]');
    expect(src, "the keypad has no zero").toContain('p + "0"');
  });

  it("keeps the typed field, so a keyboard still works", () => {
    // Added beside, not instead. A till with a real keyboard must not get
    // worse because a touch-only one got better.
    expect(src).toContain('id="step-up-pin"');
    expect(src).toContain('type="password"');
  });

  it("can clear and backspace, or a mistyped PIN is a dead end", () => {
    expect(src).toContain("Effacer le dernier chiffre");
    expect(src).toContain("Effacer le code");
  });

  it("uses type=\"button\" so no digit submits the dialog", () => {
    // FOUR `<Button` elements, not twelve: the nine digits are one element in
    // a `.map()`. Counting rendered keys against source elements is what made
    // the first version of this assertion fail for the wrong reason.
    // Bounded at the footer, not at end-of-file: « Annuler » and « Confirmer »
    // come after the keypad and are deliberately NOT `type="button"`, so an
    // unbounded slice counted them and the assertion failed on the good code.
    const from = src.indexOf("Pavé numérique");
    const to = src.indexOf("<DialogFooter", from);
    expect(to, "the footer moved — this bound needs rewriting").toBeGreaterThan(from);
    const keypad = src.slice(from, to);
    const buttons = (keypad.match(/<Button/g) ?? []).length;
    const typed = (keypad.match(/type="button"/g) ?? []).length;
    expect(buttons, "no keypad buttons found").toBeGreaterThan(3);
    expect(typed, "a keypad key could submit the dialog").toBe(buttons);
  });
});

describe("L-132 — a Z is not sealed over a count nobody made", () => {
  const src = readFileSync(
    path.join(process.cwd(), "src/features/shifts/shifts-view.tsx"),
    "utf8",
  );

  it("opens the cash field EMPTY", () => {
    // It was seeded with `(expectedCash / 100).toFixed(2)` — what the software
    // already believes is in the drawer — so the default action sealed « Écart
    // nul » and recorded a count that may never have been made. On the screen
    // `z-close.ts`'s own header says exists for « catching missing cash ».
    //
    // THE OPERATOR SETTLED IT on 2026-09-14: start empty, seal disabled until
    // something is entered. They chose the version that costs them an action at
    // every close.
    // COMMENTS STRIPPED. The fix's own comment says « this was
    // `useState((expectedCash / 100).toFixed(2))` », so scanning the raw text
    // matches the sentence describing the thing whose absence is asserted —
    // the fifth time this session that an assertion has read the prose about
    // the code instead of the code.
    const code = withoutComments(src);
    expect(code.length, "everything was stripped").toBeGreaterThan(1000);
    expect(code, "the field is pre-filled again").not.toContain(
      "useState((expectedCash / 100).toFixed(2))",
    );
    expect(code).toContain('const [countedStr, setCountedStr] = useState("")');
  });

  it("keeps the seal disabled until a figure is entered", () => {
    expect(src).toContain("disabled={loading || !hasCount}");
  });

  it("distinguishes « not counted » from « counted zero »", () => {
    // 0 is a legitimate count — an empty drawer — so « nothing typed » cannot
    // be inferred from the number, and `counted` falls back to 0 for an
    // unparseable value. `hasCount` reads the STRING.
    expect(src).toContain("countedStr.trim().length > 0");
  });

  it("shows no écart before anything is counted", () => {
    // « 0,00 € — Écart nul » on an empty field is the claim this is about.
    expect(src).toContain("{hasCount ? (");
  });
});
