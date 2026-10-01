import { contrastRatio, readableTextOn } from '@/shared/lib/color';

import { avatarColors, avatarInk, palette } from '../tokens';

// WCAG 2.1 AA: 4.5:1 for text, 3:1 for large text (24px, or 19px bold and up), icons and the
// outlines that make a control recognisable. Every pairing the app uses is listed here, so a
// palette change that breaks one fails the build instead of reaching a screen.

const TEXT = 4.5;
const LARGE = 3;

const PAIRS = [
  // Body text and captions on every surface they sit on.
  ['text', ['bg', 'surface', 'surfaceMuted', 'primarySoft'], TEXT],
  ['textMuted', ['bg', 'surface', 'surfaceMuted', 'primarySoft'], TEXT],
  // Links, overlines, ghost buttons and the info box icon.
  ['primary', ['bg', 'surface', 'primarySoft'], TEXT],
  // Amounts owed and lent, validation messages, badges.
  ['danger', ['bg', 'surface', 'dangerSoft'], TEXT],
  ['success', ['bg', 'surface', 'successSoft'], TEXT],
  // Filled buttons, selected chips and segments, the swipe-to-delete action.
  ['textOnPrimary', ['primary', 'danger'], TEXT],
  ['textOnDanger', ['danger'], TEXT],
  // Snackbar and offline banner.
  ['textOnInverse', ['inverse'], TEXT],
  ['primaryOnInverse', ['inverse'], TEXT],
  // The empty amount (48px), chevrons and disabled icons.
  ['textSubtle', ['bg', 'surface'], LARGE],
  // Unchecked checkboxes and switches.
  ['controlBorder', ['bg', 'surface'], LARGE],
];

describe.each(['light', 'dark'])('%s palette', (scheme) => {
  const colors = palette[scheme];

  it.each(PAIRS.flatMap(([fg, backgrounds, min]) => backgrounds.map((bg) => [fg, bg, min])))(
    '%s on %s is at least %s:1',
    (fg, bg, min) => {
      expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(min);
    },
  );
});

describe('avatar initials', () => {
  const inkOn = (color) =>
    readableTextOn(color, { dark: avatarInk.onLight, light: avatarInk.onDark });

  it('use the ink with the higher contrast on every avatar colour', () => {
    for (const color of avatarColors) {
      const other = inkOn(color) === avatarInk.onLight ? avatarInk.onDark : avatarInk.onLight;
      expect(contrastRatio(color, inkOn(color))).toBeGreaterThanOrEqual(
        contrastRatio(color, other),
      );
    }
  });

  // The initial is bold display type; the mid-tone of the palette is the hardest case.
  it('stay above 3:1 everywhere', () => {
    for (const color of avatarColors) {
      expect(contrastRatio(color, inkOn(color))).toBeGreaterThanOrEqual(LARGE);
    }
  });
});
