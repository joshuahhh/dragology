// Start states for the lambda-beta demo.

const ONE = "(λf x. f x)";
const TWO = "(λf x. f (f x))";
const PLUS = "(λm n f x. m f (n f x))";
const TIMES = "(λm n f. m (n f))";
const SUCC = "(λn f x. f (n f x))";
const OMEGA_HALF = "(λx. f (x x))";
const TRUE = "(λt e. t)";
const IF = "(λb t e. b t e)";

export type Example = {
  src: string;
  /** Shown under the picker: what to expect */
  blurb: string;
};

export const examples = {
  duplicate: {
    src: "(λx. x x) y",
    blurb: "Drag y onto either x: a copy splits off for the other one.",
  },
  flip: {
    src: "(λx y. y x) a b",
    blurb: "Two steps: feed in a, then b.",
  },
  nested: {
    src: "(λx. x) ((λy. y) z)",
    blurb:
      "Two redexes. Drag z into λy first, or drag the whole inner term into λx.",
  },
  K: {
    src: "(λx y. x) a b",
    blurb:
      "Feed in a, then b. The second λ never uses its parameter, so b is thrown away.",
  },
  "if true": {
    src: `${IF} ${TRUE} a b`,
    blurb:
      "Church booleans: true picks its first argument and discards the second. Reduces to a.",
  },
  "succ 2": {
    src: `${SUCC} ${TWO}`,
    blurb: "Church numerals: successor of 2 reduces to λf x. f (f (f x)).",
  },
  "1 + 2": {
    src: `${PLUS} ${ONE} ${TWO}`,
    blurb:
      "Church addition: m f (n f x) applies f n times, then m more times. Reduces to 3.",
  },
  "2 × 2": {
    src: `${TIMES} ${TWO} ${TWO}`,
    blurb:
      "Church multiplication: 2 (2 f) duplicates (2 f), and each copy unfolds into two f's. Reduces to 4.",
  },
  Ω: {
    src: "(λx. x x) (λx. x x)",
    blurb: "Reduces to itself, forever.",
  },
  "Ω₃": {
    src: "(λx. x x x) (λx. x x x)",
    blurb: "Like Ω, but every step makes the term bigger.",
  },
  "Y g": {
    src: `(λf. ${OMEGA_HALF} ${OMEGA_HALF}) g`,
    blurb:
      "The Y combinator unrolls recursion: Y g → g (Y′ g) → g (g (Y′ g)) → … with a new g each time.",
  },
  eta: {
    src: "λx. f x",
    blurb: "Enable η-reduction and drag f out.",
  },
} satisfies Record<string, Example>;

export type ExampleName = keyof typeof examples;
