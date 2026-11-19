// Whether this visit shows the `?fps` readout. Read once, when the page starts (the panel imports
// this from the first bundle), so the panel and the 3D board's continuous drawing agree for the
// whole visit, even after the address changes. Browser wiring: it reads location.
import { fpsWanted } from './frame-model.ts';

export const FPS_FLAG: boolean = typeof location !== 'undefined' && fpsWanted(location.search);
