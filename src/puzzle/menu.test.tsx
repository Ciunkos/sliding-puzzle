import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BestResults, closeOnBackdrop, Menu, MenuSection, pickSize, SizeChoice } from './menu.tsx';

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

describe('closeOnBackdrop', () => {
  test('a click on the backdrop, the dialog itself, closes the menu', () => {
    const calls: string[] = [];
    const dialog = {};

    closeOnBackdrop(() => calls.push('close'))({ target: dialog, currentTarget: dialog });

    assert.deepEqual(calls, ['close']);
  });

  test('a click inside the menu leaves it open', () => {
    const calls: string[] = [];

    closeOnBackdrop(() => calls.push('close'))({ target: { inside: true }, currentTarget: {} });

    assert.deepEqual(calls, []);
  });
});

describe('pickSize', () => {
  test('a size button picks its own size', () => {
    const picked: number[] = [];

    pickSize((size) => picked.push(size), 5)();

    assert.deepEqual(picked, [5]);
  });
});
