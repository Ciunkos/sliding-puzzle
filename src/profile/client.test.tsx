import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfilePicker } from './client.tsx';

describe('ProfilePicker', () => {
  test('the picker renders a labelled nickname input and a submit button', () => {
    // When the picker is rendered
    const html = renderToStaticMarkup(<ProfilePicker onSelected={() => undefined} />);

    // Then the label points at the input, and the test ids e2e relies on are present
    assert.match(html, /<label for="([^"]+)">Nickname<\/label><input id="\1"/);
    assert.match(html, /<input [^>]*data-testid="nickname-input"/);
    assert.match(html, /<button type="submit" data-testid="profile-submit"[^>]*>Play<\/button>/);
  });
});
