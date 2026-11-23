// Steps of a drag on the board: press a tile, move the pointer in small steps while it stays down,
// and lift it. With the mouse (both projects) and with a real touch through the Chrome DevTools
// protocol (the phone project). No expected values are decided here.
import type { Page } from '@playwright/test';
import { board, tile } from './app.ts';
import { expect } from './harness.ts';

export interface At {
  x: number;
  y: number;
}

/** The middle of tile `number` and the size of a cell, in CSS pixels. */
export async function tileCentre(page: Page, number: number): Promise<At & { cell: number }> {
  const box = await tile(page, number).boundingBox();
  expect(box, `tile ${String(number)} is on screen`).not.toBeNull();
  const width = box?.width ?? 0;
  return { x: (box?.x ?? 0) + width / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2, cell: width };
}

/** Presses the mouse on the middle of tile `number`; returns where, and the cell size. */
export async function pressTile(page: Page, number: number): Promise<At & { cell: number }> {
  const centre = await tileCentre(page, number);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  return centre;
}

/** Moves the pressed mouse to `from` + (dx, dy) in small steps, slowly (no flick). */
export async function dragTo(page: Page, from: At, dx: number, dy: number): Promise<void> {
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
}

/**
 * A flick with the mouse, timed by the input's own timestamps rather than by how fast the test
 * runs: pressed at `from`, moved by `dy` in two moves 8 ms apart, lifted 4 ms later. The page reads
 * a gesture's speed from the events' timestamps, so a slow machine cannot turn it into a drag.
 */
export async function flickDown(page: Page, from: At, dy: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const start = Date.now() / 1000;
  type MouseType = 'mousePressed' | 'mouseMoved' | 'mouseReleased';
  const mouse = (type: MouseType, share: number, ms: number) =>
    cdp.send('Input.dispatchMouseEvent', {
      type,
      x: from.x,
      y: from.y + dy * share,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
      timestamp: start + ms / 1000,
    });
  await mouse('mousePressed', 0, 0);
  await mouse('mouseMoved', 0.5, 8);
  await mouse('mouseMoved', 1, 16);
  await mouse('mouseReleased', 1, 20);
  await cdp.detach();
}

/**
 * A real touch on the screen: down at `from`, moved by (dx, dy) in small steps, then calls
 * `whileDown` with the finger still down, and lifts it.
 */
export async function touchDrag(
  page: Page,
  from: At,
  move: { dx: number; dy: number },
  whileDown: () => Promise<void>,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const point = (dx: number, dy: number) => [{ x: from.x + dx, y: from.y + dy, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(0, 0) });
  for (let step = 1; step <= 12; step += 1) {
    const share = step / 12;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point(move.dx * share, move.dy * share),
    });
  }
  await whileDown();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** How far the page has scrolled, each way, in CSS pixels. */
export function scrolled(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
}

/**
 * Watches the stage (the board and the 3D board's wrapper) and records each batch of attribute
 * changes the page makes at once: whether the held tile (data-held, what the 3D board is given)
 * went away in it, and whether the board (data-board) changed in it.
 */
export async function watchCommits(page: Page): Promise<void> {
  await page.evaluate(() => {
    const stage = document.querySelector('.sp-stage');
    const batches: { released: boolean; moved: boolean }[] = [];
    Reflect.set(window, 'commitBatches', batches);
    new MutationObserver((records) => {
      const released = records.some(
        (record) =>
          record.attributeName === 'data-held' &&
          record.target instanceof Element &&
          !record.target.hasAttribute('data-held'),
      );
      const moved = records.some((record) => record.attributeName === 'data-board');
      if (released || moved) batches.push({ released, moved });
    }).observe(stage ?? document.body, { attributes: true, subtree: true });
  });
}

/** The batches recorded by watchCommits, in order. */
export function commitBatches(page: Page): Promise<{ released: boolean; moved: boolean }[]> {
  return page.evaluate(
    () => Reflect.get(window, 'commitBatches') as { released: boolean; moved: boolean }[],
  );
}

/** A point on the board's right edge, halfway down a tile (12) of its last column. */
export async function boardEdge(page: Page): Promise<At> {
  const box = await board(page).boundingBox();
  const row = await tileCentre(page, 12);
  expect(box, 'the board is on screen').not.toBeNull();
  return { x: (box?.x ?? 0) + (box?.width ?? 0), y: row.y };
}

/** Presses tile `number`, drags it `cells` cells sideways (negative: left) slowly, and lets go. */
export async function pull(page: Page, number: number, cells: number): Promise<void> {
  const from = await pressTile(page, number);
  await dragTo(page, from, from.cell * cells, 0);
  await page.mouse.up();
}
