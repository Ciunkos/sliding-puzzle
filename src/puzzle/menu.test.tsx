import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  backdropCloser,
  BestResults,
  Menu,
  MenuSection,
  onBackdrop,
  pickSize,
  SizeChoice,
} from './menu.tsx';

const NONE = () => undefined;

/** Static HTML, one element per line, with React's generated ids made readable. */
function markup(element: ReactElement): string {
  return renderToStaticMarkup(element)
    .replaceAll(/_R_\w+_/g, 'id')
    .replaceAll('><', '>\n<');
}

describe('Menu', () => {
  test('the menu is a dialog titled Menu with a named close button before its content', () => {
    const html = markup(
      <Menu onClose={NONE}>
        <p>content</p>
      </Menu>,
    );

    assert.match(
      html,
      /^<dialog data-testid="menu" class="sp-menu" aria-labelledby="id">\n<div class="sp-menu-inner">\n<div class="sp-menu-head">\n<h2 id="id" class="sp-menu-title">Menu<\/h2>\n<button type="button" data-testid="menu-close" class="sp-button sp-icon-button">/,
    );
    assert.match(html, /<span class="sp-visually-hidden">Close menu<\/span>/);
    assert.match(
      html,
      /<div class="sp-menu-body">\n<p>content<\/p>\n<\/div>\n<\/div>\n<\/dialog>$/,
    );
  });
});

describe('MenuSection', () => {
  test('a section is labelled by its own heading', () => {
    const html = markup(
      <MenuSection title="Board look">
        <p>controls</p>
      </MenuSection>,
    );

    assert.equal(
      html,
      `<section class="sp-menu-section" aria-labelledby="id">
<h3 id="id" class="sp-menu-heading">Board look</h3>
<p>controls</p>
</section>`,
    );
  });
});

describe('SizeChoice', () => {
  test('the sizes are a labelled group of buttons, the current one pressed', () => {
    const html = markup(<SizeChoice current={4} busy={false} onPick={NONE} />);

    assert.equal(
      html,
      `<section class="sp-menu-section sp-sizes" aria-labelledby="id">
<h3 id="id" class="sp-menu-heading">Board size</h3>
<div class="sp-row" role="group" aria-labelledby="id" aria-describedby="id">
<button type="button" data-testid="size-3" class="sp-button" aria-pressed="false" aria-disabled="false">3×3</button>
<button type="button" data-testid="size-4" class="sp-button" aria-pressed="true" aria-disabled="false">4×4</button>
<button type="button" data-testid="size-5" class="sp-button" aria-pressed="false" aria-disabled="false">5×5</button>
</div>
<p id="id" class="sp-hint">Picking a size starts a new game in place of this one.</p>
</section>`,
    );
  });

  test('while busy the sizes are aria-disabled, and none is pressed before a game loads', () => {
    const html = markup(<SizeChoice current={undefined} busy onPick={NONE} />);

    assert.equal(html.split('aria-disabled="true"').length, 4);
    assert.doesNotMatch(html, /aria-pressed="true"/);
  });
});

describe('BestResults', () => {
  test('the best results are a numbered list under their title', () => {
    const html = markup(
      <BestResults title="Best on 4×4" lines={['1 move · 0:03', '9 moves · 0:20']} />,
    );

    assert.equal(
      html,
      `<section class="sp-menu-section sp-best" aria-labelledby="id">
<h3 id="id" class="sp-menu-heading">Best on 4×4</h3>
<ol data-testid="best-list" aria-labelledby="id">
<li>1 move · 0:03</li>
<li>9 moves · 0:20</li>
</ol>
</section>`,
    );
  });

  test('without a result there is no section at all', () => {
    assert.equal(markup(<BestResults title="Best on 3×3" lines={[]} />), '');
  });
});

/** The dialog's box on screen: from (100, 50) to (400, 650). */
const DIALOG = {
  getBoundingClientRect: () => ({ left: 100, top: 50, right: 400, bottom: 650 }),
};
const at = (clientX: number, clientY: number) => ({ clientX, clientY, currentTarget: DIALOG });

describe('onBackdrop', () => {
  test('a point beside, above or below the dialog is on the backdrop', () => {
    assert.deepEqual(
      [
        onBackdrop(at(99, 300)),
        onBackdrop(at(401, 300)),
        onBackdrop(at(250, 49)),
        onBackdrop(at(250, 651)),
      ],
      [true, true, true, true],
    );
  });

  test('a point inside the dialog or on its edge is not', () => {
    assert.deepEqual(
      [onBackdrop(at(250, 300)), onBackdrop(at(100, 50)), onBackdrop(at(400, 650))],
      [false, false, false],
    );
  });
});

describe('backdropCloser', () => {
  test('a press that starts and ends on the backdrop closes the menu', () => {
    const calls: string[] = [];
    const closer = backdropCloser(() => calls.push('close'), { current: false });

    closer.onPointerDown(at(20, 20));
    closer.onClick(at(20, 20));

    assert.deepEqual(calls, ['close']);
  });

  test('a drag from a field inside out onto the backdrop leaves the menu open', () => {
    const calls: string[] = [];
    const closer = backdropCloser(() => calls.push('close'), { current: false });

    closer.onPointerDown(at(250, 300));
    closer.onClick(at(20, 20));

    assert.deepEqual(calls, []);
  });

  test('a press that starts on the backdrop and ends inside leaves the menu open', () => {
    const calls: string[] = [];
    const closer = backdropCloser(() => calls.push('close'), { current: false });

    closer.onPointerDown(at(20, 20));
    closer.onClick(at(250, 300));

    assert.deepEqual(calls, []);
  });

  test('a press closes once: a later click without a new press, such as a key, does not', () => {
    const calls: string[] = [];
    const started = { current: true };
    const closer = backdropCloser(() => calls.push('close'), started);

    closer.onClick(at(20, 20));
    closer.onClick(at(20, 20));

    assert.deepEqual(calls, ['close']);
  });
});

describe('pickSize', () => {
  test('a size button picks its own size', () => {
    const picked: number[] = [];

    pickSize((size) => picked.push(size), 5)();

    assert.deepEqual(picked, [5]);
  });
});
