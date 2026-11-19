// The menu dialog's browser wiring: showModal (focus moves in, the page behind is inert, Escape
// closes) and close; when it closes, however it closed, focus goes back to the menu button. Tab
// and Shift+Tab wrap around inside the open menu instead of leaving for the browser's toolbar.
import { useEffect, useRef, useState } from 'react';

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

/** `onClosed` hears every close (button, Escape, backdrop, a choice that closes it). */
export function useMenu(onClosed: () => void = () => undefined) {
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const closed = useRef(onClosed);
  closed.current = onClosed;
  useEffect(() => {
    const element = dialog.current;
    if (element === null) return undefined;
    const onClose = () => {
      setOpen(false);
      button.current?.focus();
      closed.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      wrapTab(element, event);
    };
    element.addEventListener('close', onClose);
    element.addEventListener('keydown', onKeyDown);
    return () => {
      element.removeEventListener('close', onClose);
      element.removeEventListener('keydown', onKeyDown);
    };
  }, []);
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
    close: () => {
      dialog.current?.close();
    },
  };
}
