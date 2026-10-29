import DejaVuSansMonoBold from "./fonts/DejaVuSansMono-Bold.ttf";
import DejaVuSansMonoBoldOblique from "./fonts/DejaVuSansMono-BoldOblique.ttf";
import DejaVuSansMonoOblique from "./fonts/DejaVuSansMono-Oblique.ttf";
import DejaVuSansMono from "./fonts/DejaVuSansMono.ttf";
import LibertineBoldItalic from "./fonts/LinLibertine_RBI.otf";
import Nunito800 from "./fonts/nunito-latin-800-normal.woff2";

// The live editor's fonts, all bundled, so the talk looks the same on any
// machine:
// - DejaVu Sans Mono for code (Menlo, which the editor showed before, is
//   a lightly modified DejaVu Sans Mono, but only Macs have it),
// - Nunito ExtraBold for text in the diagram (a free rounded face in place
//   of Arial Rounded MT Bold),
// - Linux Libertine bold italic for operators as the paper styles them
//   (PAPER_OP_STYLE).

const faces: {
  family: string;
  url: string;
  weight: number;
  italic?: boolean;
}[] = [
  { family: "DejaVu Sans Mono", url: DejaVuSansMono, weight: 400 },
  { family: "DejaVu Sans Mono", url: DejaVuSansMonoBold, weight: 700 },
  {
    family: "DejaVu Sans Mono",
    url: DejaVuSansMonoOblique,
    weight: 400,
    italic: true,
  },
  {
    family: "DejaVu Sans Mono",
    url: DejaVuSansMonoBoldOblique,
    weight: 700,
    italic: true,
  },
  { family: "Nunito", url: Nunito800, weight: 800 },
  {
    family: "Paper Libertine",
    url: LibertineBoldItalic,
    weight: 700,
    italic: true,
  },
];

// Loaded up front: text in a face that hasn't loaded yet is invisible.
for (const { family, url, weight, italic } of faces) {
  const face = new FontFace(family, `url(${url})`, {
    weight: String(weight),
    style: italic ? "italic" : "normal",
  });
  document.fonts.add(face);
  void face.load();
}

/** Code, and the editor's other text */
export const CODE_FONT = '"DejaVu Sans Mono", monospace';
/** Text in the diagram */
export const LETTER_FONT = "Nunito, sans-serif";
