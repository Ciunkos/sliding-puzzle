// The menu dialog's browser wiring: showModal (focus moves in, the page behind is inert, Escape
// closes) and close; when it closes, however it closed, focus goes back to the menu button. Tab
// and Shift+Tab wrap around inside the open menu instead of leaving for the browser's toolbar.
import { type RefObject, useEffect, useRef, useState } from 'react';

const FOCUSABLE = 'button, summary, input, select, textarea, a[href], [tabindex="0"]';

/** Keeps Tab inside `dialog`: from its last control to its first, and back with Shift. */
function wrapTab(dialog: HTMLDialogElement, event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const controls = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) =>
    element.checkVisibility(),
  );
  const first = controls.at(0);
  const last = controls.at(-1);
  const edge = event.shiftKey ? first : last;
  if (edge === undefined || document.activeElement !== edge) return;
  event.preventDefault();
  (event.shiftKey ? last : first)?.focus();
}

/** The dialog's close event (however it closed) and Tab wrapping, for the page's lifetime. */
function useDialogEvents(dialog: RefObject<HTMLDialogElement | null>, onClose: () => void): void {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const element = dialog.current;
    if (element === null) return undefined;
    const closed = () => {
      latest.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      wrapTab(element, event);
    };
    element.addEventListener('close', closed);
    element.addEventListener('keydown', onKeyDown);
    return () => {
      element.removeEventListener('close', closed);
      element.removeEventListener('keydown', onKeyDown);
    };
  }, [dialog]);
}

/**
 * `onClosed` hears every close (button, Escape, backdrop, a profile switch) except a quiet one: a
 * choice that closes the menu as part of what it does, and makes its own sound.
 */
export function useMenu(onClosed: () => void = () => undefined) {
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const closed = useRef(onClosed);
  closed.current = onClosed;
  const quiet = useRef(false);
  useDialogEvents(dialog, () => {
    setOpen(false);
    button.current?.focus();
    if (!quiet.current) closed.current();
    quiet.current = false;
  });
  return {
    dialog,
    button,
    open,
    show: () => {
      const element = dialog.current;
      if (element === null || element.open) return;
      element.showModal();
      setOpen(true);
    },
    close: (options: { quiet?: boolean } = {}) => {
      const element = dialog.current;
      if (element?.open !== true) return;
      quiet.current = options.quiet === true;
      element.close();
    },
  };
}
