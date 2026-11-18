import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { OfflineUnavailable } from './offline-unavailable.tsx';

describe('OfflineUnavailable', () => {
  test('it says plainly that the profile cannot open offline and offers the one that can', () => {
    // When the screen is rendered on a device that remembers Ada
    const html = renderToStaticMarkup(<OfflineUnavailable other="Ada" onOpen={() => undefined} />);

    // Then it explains and offers Ada
    assert.match(html, /This profile cannot be opened offline/);
    assert.match(html, /<button type="button"[^>]*>Play as Ada instead<\/button>/);
  });

  test('without a profile to offer there is no button', () => {
    const html = renderToStaticMarkup(
      <OfflineUnavailable other={undefined} onOpen={() => undefined} />,
    );

    assert.doesNotMatch(html, /<button/);
  });
});
