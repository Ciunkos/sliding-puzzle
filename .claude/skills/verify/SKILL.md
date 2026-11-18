---
name: verify
description: Play the built app's critical flow in a real phone browser and save a screenshot per step, to see a change working before saying done.
---

# verify

Use it after any change to the UI, the engine or the server, before you say "done". Green tests
say the code does what the tests ask. This shows you what a player sees.

```sh
npm run verify
```

It builds the app and starts the Node server on a free port with a throwaway database. Then it
plays in Chromium on a Pixel 7 viewport with touch: first visit, a tap, a swipe, a refresh, the
share link in a second browser, the near-solved board (test route) solved, a picture skin, 3D on
and off, offline reload and a move, back online. It prints one line per step and stops at the
first failure (exit 1). It always stops the server it started. The screenshots go to
`verify-out/` (gitignored), and so does `server.log`.

Open the screenshots. Do not stop at the pass lines. Look for:

- nothing cut off or overlapping at phone width, and the footer below the game;
- the board matches the step: the moves count, the tile that moved, green tiles and
  "Solved" on the win, the picture on the tiles, the 3D board drawn (not blank);
- the offline notice in the offline step, and gone when back online;
- no error text anywhere.

Say which screenshots you looked at and what you saw.

What it does not cover: real devices, Safari and Firefox, screen readers, desktop width (use
`npm run test:e2e`), the Worker and D1 (the `worker` Playwright project), and production
(`sh tests/prod.sh` after a deploy).
