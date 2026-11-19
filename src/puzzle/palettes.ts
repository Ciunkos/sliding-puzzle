// The page behind the board takes its colours from the picture on it: three stops of a soft radial
// gradient (centre, middle, edge) for the light and the dark colour scheme. Numbers and the
// player's own photo get the warm wood page. Every stop keeps the HUD text AA (palettes.test.ts).
import type { CSSProperties } from 'react';

type Stops = readonly [string, string, string];

export interface PagePalette {
  light: Stops;
  dark: Stops;
}

const WOOD: PagePalette = {
  light: ['#fbf3e4', '#efdcbc', '#d9bd92'],
  dark: ['#2b2119', '#1a140f', '#0d0a07'],
};

const PICTURES: Readonly<Record<string, PagePalette>> = {
  rocket: { light: ['#f1edfb', '#ddd5f3', '#c9bdec'], dark: ['#2a2347', '#1a1530', '#0e0b1c'] },
  cat: { light: ['#fff4e6', '#ffe1c7', '#f5caa6'], dark: ['#3a2a20', '#241a13', '#140e0a'] },
  balloon: { light: ['#eef7fd', '#d6ebf8', '#bbdbf0'], dark: ['#1d2f3f', '#132130', '#0a131d'] },
  fish: { light: ['#e9f8f6', '#cdeee9', '#addfd8'], dark: ['#173533', '#0f2423', '#081514'] },
  castle: { light: ['#fff3ec', '#ffdcc9', '#f6c3ac'], dark: ['#3a2230', '#24151e', '#140b11'] },
};

/** The page colours for the skin on the board (a skin id, see preferences.ts). */
export function pagePalette(skin: string): PagePalette {
  return PICTURES[skin] ?? WOOD;
}

/** The palette as the custom properties styles.ts reads (it picks light or dark itself). */
export function paletteStyle(skin: string): CSSProperties {
  const { light, dark } = pagePalette(skin);
  return {
    '--sp-bg-light-1': light[0],
    '--sp-bg-light-2': light[1],
    '--sp-bg-light-3': light[2],
    '--sp-bg-dark-1': dark[0],
    '--sp-bg-dark-2': dark[1],
    '--sp-bg-dark-3': dark[2],
  } as CSSProperties;
}
