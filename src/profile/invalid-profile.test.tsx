import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvalidProfile } from './invalid-profile.tsx';

function renderFor(raw: string): string {
  return renderToStaticMarkup(<InvalidProfile raw={raw} onNewRandom={() => undefined} />);
}

describe('InvalidProfile', () => {
  test('an unusable name is shown with the rule it breaks and the one way on', () => {
    // When the screen is rendered for a one-letter name
    const html = renderFor('a');

    // Then it names the problem, the rule from the nickname rules, and offers a new random profile
    assert.match(html, /This profile name cannot be used/);
    assert.match(html, /“a”.*Nickname must be 2-30 characters\./);
    assert.match(html, /<button type="button"[^>]*>Play as a new random profile<\/button>/);
  });

  test('an empty name says that the link has no profile name', () => {
    assert.match(renderFor(''), /The link has no profile name\./);
  });
});
