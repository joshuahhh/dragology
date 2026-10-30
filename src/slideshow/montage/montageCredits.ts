/**
 * Where each clip of the opening montage (public/slides/montage) comes from.
 *
 * The clips were cut from footage gathered in the sibling `preso` folder:
 * each `preso/footage/<item>/` holds the full source videos, with `notes.md`
 * and `clips.json` giving their sources and the moments in them. Most cuts
 * are listed (source file, in → out, speed, crop) in
 * `preso/montage-picks/provisional/README.md`; `ddv`, `figma`, `google-maps`
 * and `vb` were cut by hand (`preso/montage-picks/*.mp4`), so their times
 * weren't recorded.
 *
 * On the slide, a clip's `system` and `credit` show small in the corner.
 */
export type MontageCredit = {
  /** What the clip shows, as named on the slide */
  system: string;
  /** Who made the video, as named on the slide; omitted for our own recordings */
  credit?: string;
  /** The source video's page */
  source: string;
  /** The source video's title, and who made or uploaded it */
  sourceTitle: string;
  /** Which part of the source the clip is, and anything about the cut */
  cut: string;
  /** License or attribution terms, as far as we know them */
  license: string;
};

/** Credits by file name in public/slides/montage */
export const MONTAGE_CREDITS: Record<string, MontageCredit> = {
  "010-sketchpad-1963-drag-shape-onto-rectangle.mp4": {
    system: "Sketchpad (Ivan Sutherland, 1963)",
    credit: "Video: Science Reporter, MIT / WGBH",
    source: "https://www.youtube.com/watch?v=rrv9YvPiQsw",
    sourceTitle:
      "Science Reporter: Computer Sketchpad (MIT / WGBH, 1964); scan uploaded by Roger Kaufman",
    cut: "13:49.0 → 13:55.0 at 1.25×, crop 1060:840:200:90. The light pen picks up a trapezoid, rotates it past the rectangle, and snaps it on as a leg.",
    license:
      "© MIT / WGBH; no license on the upload. GBH stock licensing at gbhstocksales.org",
  },
  "015-nicky-case-polygons-move-unhappy.mp4": {
    system: "Parable of the Polygons (Vi Hart & Nicky Case, 2014)",
    source: "https://ncase.me/polygons/",
    sourceTitle: "Parable of the Polygons, recorded with playwright-cli",
    cut: "preso/footage/nicky-case/polygons-manual-recorded-take2.mp4, 0:04.2 → 0:12.6 at 2×, crop 600:584:660:190. Two unhappy triangles moved.",
    license: 'Public domain (CC0): "this playable post is public domain"',
  },
  "020-mercator-puzzle-greenland-onto-africa.mp4": {
    system: "The True Size Of… (James Talmage & Damon Maneice)",
    credit: "Map data © Google",
    source: "https://thetruesize.com/",
    sourceTitle: "The True Size Of…, recorded with playwright-cli",
    cut: "preso/footage/mercator-puzzle/thetruesize-greenland-africa-take1.mp4, 0:10.2 → 0:20.2 at 4.4×, crop 1024:720:448:32 (which drops the on-map Google credit). Greenland dragged down onto Africa, shrinking all the way.",
    license:
      "Screen recording over Google Maps; credit thetruesize.com and Google",
  },
  "030-nle-fcpx-clip-drag-magnetic-ripple.mp4": {
    system: "Final Cut Pro X (Apple, 2011)",
    credit: "Video: Apple",
    source: "https://www.youtube.com/watch?v=9Hi4ocHCosY",
    sourceTitle:
      "Apple - Final Cut Pro X - Magnetic Timeline video (Apple; re-upload by tano9999)",
    cut: "0:39.5 → 0:45.4 at 1.4×, crop 1280:560:0:160. A clip dragged along the magnetic timeline; its neighbours slide aside.",
    license: "© Apple; YouTube standard license",
  },
  "035-blender-nodes-socket-wire-into-join.mp4": {
    system: "Blender Geometry Nodes",
    credit: "Video: Blender Guru",
    source: "https://www.youtube.com/watch?v=aO0eUnu0hO0",
    sourceTitle:
      "Blender Tutorial: Geometry Nodes for Beginners - Part 1 (Blender Guru, Andrew Price)",
    cut: "5:34.6 → 5:38.9 at 1×, crop 1260:930:240:150. A wire dragged from Group Input into Join Geometry; the cube turns solid orange on the drop.",
    license: "YouTube standard license; attribute Blender Guru",
  },
  "040-kpt-power-goo-smear-mouth.mp4": {
    system: "Kai's Power Goo (MetaTools, 1995)",
    credit: "Video: LGR",
    source: "https://www.youtube.com/watch?v=xt06OSIQ0PE",
    sourceTitle: "Kai's Power Goo – Classic 90s Funware for PC! (LGR, 2017)",
    cut: "4:58.1 → 5:02.0 at 1×, crop 1440:1080:240:0. Dragging across a face smears the mouth into a putty grin.",
    license: "© LGR; YouTube standard license",
  },
  "045-graspable-math-commute-term.mp4": {
    system: "Graspable Math",
    credit: "Video: Graspable Math",
    source: "https://www.youtube.com/watch?v=K5sx7NPEDXo",
    sourceTitle:
      "Learn Graspable Math: Simplifying Expressions (Graspable Math, official channel)",
    cut: '0:45.0 → 0:50.2 at 1.25×, crop 704:396:598:132. "22" slid along the expression; the terms close up.',
    license: "YouTube standard license",
  },
  "045-inventing-on-principle-ipad-perform-leaf.mp4": {
    system: "Bret Victor, Inventing on Principle (2012)",
    credit: "Video: CUSEC",
    source: "https://vimeo.com/906418692",
    sourceTitle:
      "Inventing on Principle, Bret Victor at CUSEC 2012 (re-upload; the original vimeo.com/36579366 is gone)",
    cut: "31:42.6 → 31:48.0 at 1.25×, crop 960:720:160:0. A finger drags a leaf on an iPad to animate it.",
    license: "No license stated; attribute Bret Victor",
  },
  "050-google-maps.mp4": {
    system: "Google Maps draggable directions (2007)",
    credit: "Video: Google",
    source: "https://www.youtube.com/watch?v=KPOOWvP_dd8",
    sourceTitle:
      "Google Maps: Draggable Driving Directions (Google, 2007-06-28, the feature's launch)",
    cut: "Cut by hand from preso/footage/google-maps-route-drag; times not recorded. 320×240, the source's resolution.",
    license: "YouTube standard license; Google marketing",
  },
  "055-figma.mp4": {
    system: "Figma auto layout",
    credit: "Video: Figma",
    source: "https://help.figma.com/hc/en-us/articles/31289464393751",
    sourceTitle:
      "Use the horizontal and vertical flows in auto layout (Figma Help Center)",
    cut: "Cut by hand from preso/footage/figma/help-center/auto-layout-drag-tag-in-and-reorder_31837767201175.mp4; times not recorded.",
    license: "Figma help-center asset; attribute Figma",
  },
  "055-scratch-play-sound-from-palette.mp4": {
    system: "Scratch (MIT Media Lab)",
    credit: "Video: Scratch Team",
    source: "https://fast.wistia.net/embed/iframe/rpjvs3v9gj",
    sourceTitle:
      "Getting Started [English], Scratch 3's in-editor tutorial (Scratch Team)",
    cut: '0:22.4 → 0:25.9 at 1×, crop 1072:603:88:140. "play sound" lifted from the palette; a grey shadow appears under "move" and it snaps on.',
    license:
      "Scratch Foundation educational video; attribute Scratch / MIT Media Lab",
  },
  "057-ddv.mp4": {
    system: "Bret Victor, Drawing Dynamic Visualizations (2013)",
    credit: "Video: Bret Victor",
    source: "https://vimeo.com/66085662",
    sourceTitle: "Drawing Dynamic Visualizations (Bret Victor)",
    cut: "Cut by hand from preso/footage/bret-victor-drawing-dynamic-visualizations; times not recorded.",
    license: "No license stated; attribute Bret Victor",
  },
  "060-geogebra-parabola-locus-trace.mp4": {
    system: "GeoGebra",
    credit: "Video: Tim Brzezinski",
    source: "https://www.youtube.com/watch?v=5b0Qb5TxI2A",
    sourceTitle: "Parabola: Dynamic Locus Construction (Tim Brzezinski)",
    cut: "1:02.0 → 1:13.6 at 2.4×, crop 836:648:0:72. Dragging a point traces out a parabola.",
    license: "YouTube standard license",
  },
  "090-phet-mass-onto-spring.mp4": {
    system: "PhET Interactive Simulations, University of Colorado Boulder",
    source:
      "https://phet.colorado.edu/sims/html/masses-and-springs-basics/latest/masses-and-springs-basics_all.html",
    sourceTitle: "Masses and Springs: Basics, recorded with playwright-cli",
    cut: "preso/footage/phet/masses-and-springs-recorded.mp4, 0:04.2 → 0:12.2 at 2×, crop 1280:990:120:0. A 250 g mass hung on a spring, which bounces.",
    license:
      'CC BY 4.0; credit "PhET Interactive Simulations, University of Colorado Boulder, phet.colorado.edu"',
  },
  "100-notion-block-beside-makes-columns.mp4": {
    system: "Notion",
    credit: "Video: Notion",
    source: "https://www.notion.com/help/columns-headings-and-dividers",
    sourceTitle: "Columns, headings & dividers (Notion Help Center)",
    cut: "preso/footage/notion/column_creation.mp4, 0:00.3 → 0:03.9 at 1×, crop 1320:640:140:400. A block dropped beside another, so the page splits into columns.",
    license: "Notion help-center asset; attribute Notion",
  },
  "500-trello-classic-card-tilt-to-doing.mp4": {
    system: "Trello (Fog Creek)",
    credit: "Video: Trello",
    source: "https://www.youtube.com/watch?v=xky48zyL9iA",
    sourceTitle: "Getting Started With Trello (Demo) (Trello, Fog Creek era)",
    cut: "2:12.1 → 2:16.5 at 1×, crop 980:720:4:150. A card lifts with the classic tilt, a gap opens, and it drops into Doing.",
    license: "YouTube standard license; official Trello demo",
  },
  "hypercard-button-drag.mp4": {
    system: "HyperCard (Bill Atkinson, Apple, 1987)",
    credit: "Video: Eric's Edge",
    source: "https://www.youtube.com/watch?v=xThJELVjCWQ",
    sourceTitle:
      "HyperCard Authoring and Programming: Module 02: Authoring Stacks (Eric's Edge, 2022)",
    cut: "12:21.9 → 12:26.5 at 1×, crop 1156:600:630:106. A button grabbed and moved on the Home card. HyperCard 2.x in an emulator, not 1987 footage.",
    license: "No license stated; attribute or ask",
  },
  "nicky-case-loopy-draw-arrows.mp4": {
    system: "LOOPY (Nicky Case, 2017)",
    source: "https://ncase.me/loopy/v1.1/",
    sourceTitle: "LOOPY v1.1, recorded with playwright-cli",
    cut: "preso/footage/nicky-case/loopy-recorded-take1.mp4, 0:15.9 → 0:24.6 at 2×, crop 800:450:410:295. Arrows dragged between rabbits and foxes, closing the loop.",
    license:
      "Public domain (CC0), per LOOPY's credits; verify before publishing",
  },
  "vb.mp4": {
    system: "Visual Basic (Microsoft, 1991)",
    credit: "Video: Microsoft",
    source: "https://www.youtube.com/watch?v=Fh_UDQnboRw",
    sourceTitle:
      "Bill Gates demonstrates Visual Basic (1991) (Microsoft launch footage; uploaded by Crapkai)",
    cut: "Cut by hand from preso/footage/hypercard-interface-builder, cropped to the screen and brightened; times not recorded.",
    license: "Microsoft launch footage; no license on the upload",
  },
};
