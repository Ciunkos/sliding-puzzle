// Copies a link to the clipboard. The clipboard may be missing (an insecure page) or refuse
// (no permission), so this never throws: it says what happened.
export type CopyResult = 'copied' | 'unavailable' | 'failed';

type TextClipboard = Pick<Clipboard, 'writeText'>;

/** The browser's clipboard, or undefined when the page may not use it. */
function defaultClipboard(): TextClipboard | undefined {
  try {
    const clipboard: TextClipboard | undefined = globalThis.navigator.clipboard;
    return clipboard;
  } catch {
    return undefined;
  }
}

export async function copyText(
  text: string,
  clipboard: TextClipboard | undefined = defaultClipboard(),
): Promise<CopyResult> {
  if (clipboard === undefined) return 'unavailable';
  try {
    await clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
