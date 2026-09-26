// Title fonts bundled with the film (SIL Open Font License, see web/fonts/):
// ZCOOL XiaoWei for 去看海吧 and the end card, Cormorant Garamond Italic for
// the English line. Both are subsets holding only the glyphs the film uses.
export const TITLE = '"ZCOOL XiaoWei", "WenQuanYi Zen Hei", "Noto Serif SC", serif';
export const ITALIC = '"Cormorant Garamond", Georgia, "Times New Roman", serif';

const FACES = [
  ['ZCOOL XiaoWei', 'ZCOOLXiaoWei-subset.woff2', {}],
  ['Cormorant Garamond', 'CormorantGaramond-Italic-subset.woff2', { style: 'italic', weight: '500' }],
];

/** Load the faces before the first frame is drawn (canvas text never waits). */
export async function loadFonts(base = new URL('../../web/fonts/', import.meta.url)) {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
  await Promise.all(FACES.map(async ([family, file, desc]) => {
    try {
      const face = new FontFace(family, `url(${new URL(file, base)})`, desc);
      document.fonts.add(await face.load());
    } catch (e) {
      console.warn(`font ${family} not loaded; using a fallback`, e);
    }
  }));
}
