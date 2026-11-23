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

/**
 * Moves the pressed mouse to `from` + (dx, dy) in 12 small steps, slowly (no flick): about a frame
 * apart, so a busy page (software 3D) cannot fold them into a burst that reads as a quick flick.
 */
export async function dragTo(page: Page, from: At, dx: number, dy: number): Promise<void> {
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(from.x + (dx * step) / 12, from.y + (dy * step) / 12);
    await page.waitForTimeout(16);
  }
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

/**
 * Counts React commits (renders that reached the page) from the start: React reports each one to
 * the DevTools global hook, which this stands in for. Call before the page loads.
 */
export async function countRenders(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Reflect.set(window, 'reactCommits', 0);
    Reflect.set(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
      supportsFiber: true,
      renderers: new Map(),
      inject: () => 1,
      checkDCE: () => undefined,
      onScheduleFiberRoot: () => undefined,
      onCommitFiberUnmount: () => undefined,
      onPostCommitFiberRoot: () => undefined,
      onCommitFiberRoot: () => {
        Reflect.set(window, 'reactCommits', Number(Reflect.get(window, 'reactCommits')) + 1);
      },
    });
  });
}

/** The number of React commits so far (see countRenders). */
export function renders(page: Page): Promise<number> {
  return page.evaluate(() => Number(Reflect.get(window, 'reactCommits')));
}

/**
 * Records the pitch of every tone the page's sound schedules (wrapping the browser's own
 * OscillatorNode, which still plays). Call before the page loads; read with `tones`.
 */
export async function recordTones(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const scheduled: number[] = [];
    Reflect.set(window, 'scheduledTones', scheduled);
    const Real = window.OscillatorNode;
    class Recorded extends Real {
      constructor(context: BaseAudioContext, options?: OscillatorOptions) {
        super(context, options);
        const set = this.frequency.setValueAtTime.bind(this.frequency);
        this.frequency.setValueAtTime = (value: number, at: number) => {
          scheduled.push(Math.round(value));
          return set(value, at);
        };
      }
    }
    Reflect.set(window, 'OscillatorNode', Recorded);
  });
}

/** The pitches (Hz, rounded) scheduled so far (see recordTones). */
export function tones(page: Page): Promise<number[]> {
  return page.evaluate(() => Reflect.get(window, 'scheduledTones') as number[]);
}

/** Whether every pitch of `wanted` has been scheduled (see recordTones). */
export async function scheduled(page: Page, wanted: readonly number[]): Promise<boolean> {
  const heard = await tones(page);
  return wanted.every((tone) => heard.includes(tone));
}

/**
 * Counts, per component name, how often each rendered in a commit: React flags every fiber it
 * rendered (PerformedWork), and the hook walks the committed tree. Names are those of the dev
 * build the e2e projects run. Call before the page loads; read with `renderedBy`, reset with
 * `resetRendered`.
 */
export async function countComponentRenders(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const counts: Record<string, number> = {};
    Reflect.set(window, 'componentRenders', counts);
    interface Fiber {
      flags: number;
      type: unknown;
      child: Fiber | null;
      sibling: Fiber | null;
    }
    // A function component's name; a memo's wrapper is skipped (its inner component is counted).
    const nameOf = (type: unknown): string | undefined =>
      typeof type === 'function' ? (type as { name?: string }).name : undefined;
    // A subtree React skipped keeps its fibers (and their old flags) from the commit before: only
    // a flagged fiber that was not in the previous commit rendered in this one.
    let previous = new WeakSet<Fiber>();
    let seen = new WeakSet<Fiber>();
    /** Counts the components rendered under `fiber`. */
    const walk = (fiber: Fiber | null): void => {
      for (let node = fiber; node !== null; node = node.sibling) {
        seen.add(node);
        const rendered = (node.flags & 1) === 1 && !previous.has(node);
        const name = rendered ? nameOf(node.type) : undefined;
        if (name !== undefined && name !== '') counts[name] = (counts[name] ?? 0) + 1;
        walk(node.child);
      }
    };
    Reflect.set(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
      supportsFiber: true,
      renderers: new Map(),
      inject: () => 1,
      checkDCE: () => undefined,
      onScheduleFiberRoot: () => undefined,
      onCommitFiberUnmount: () => undefined,
      onPostCommitFiberRoot: () => undefined,
      onCommitFiberRoot: (_id: number, root: { current: Fiber }) => {
        walk(root.current.child);
        previous = seen;
        seen = new WeakSet<Fiber>();
      },
    });
  });
}

/** The renders per component name since the last reset (see countComponentRenders). */
export function renderedBy(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => ({
    ...(Reflect.get(window, 'componentRenders') as Record<string, number>),
  }));
}

/** Starts counting renders afresh. */
export async function resetRendered(page: Page): Promise<void> {
  await page.evaluate(() => {
    const counts = Reflect.get(window, 'componentRenders') as Record<string, number>;
    for (const name of Object.keys(counts)) Reflect.deleteProperty(counts, name);
  });
}

/** How often each of `names` rendered since the last reset, 0 for none. */
export async function rendersOf(page: Page, names: readonly string[]): Promise<number[]> {
  const counts = await renderedBy(page);
  return names.map((name) => counts[name] ?? 0);
}
