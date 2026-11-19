// WCAG 2.1 contrast ratio of two opaque #rrggbb colours, for tests of colour palettes.

/** One sRGB channel (0-255) as linear light. */
function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of #rrggbb. */
function luminance(hex: string): number {
  const red = linear(Number.parseInt(hex.slice(1, 3), 16));
  const green = linear(Number.parseInt(hex.slice(3, 5), 16));
  const blue = linear(Number.parseInt(hex.slice(5, 7), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** The contrast ratio of two colours, from 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** The lowest contrast of `text` on any of `backgrounds`. */
export function minContrast(text: string, backgrounds: readonly string[]): number {
  return Math.min(...backgrounds.map((background) => contrastRatio(text, background)));
}
