import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfileBar } from './profile-bar.tsx';

function renderBar(): string {
  return renderToStaticMarkup(
    <ProfileBar
      nickname="brave-otter-100"
      shareUrl="http://localhost/sliding-puzzle/p/brave-otter-100"
      focusOnMount={false}
      onOpen={() => undefined}
      onRandom={() => undefined}
    />,
  );
}

describe('ProfileBar', () => {
  test('the bar names the player and says plainly that anyone with the link can play', () => {
    // When the bar is rendered for a profile
    const html = renderBar();

    // Then it shows the nickname and the notice as text
    assert.match(html, /Playing as <span data-testid="current-profile">brave-otter-100<\/span>/);
    assert.match(html, /There is no login\. Anyone with this link can play this profile\./);
  });

  test('the switch form has a labelled nickname input and named buttons', () => {
    const html = renderBar();

    assert.match(
      html,
      /<label for="([^"]+)">Play as another nickname<\/label><div[^>]*><input id="\1"/,
    );
    assert.match(html, /<button type="submit" data-testid="profile-submit"[^>]*>Play<\/button>/);
    assert.match(
      html,
      /<button type="button" data-testid="new-random-profile"[^>]*>New random profile<\/button>/,
    );
  });
});
