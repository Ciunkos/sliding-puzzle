// The game's menu: a modal dialog (opened with showModal by use-menu.ts) that holds the page's own
// part (who is playing, usage statistics) and the game's options: board size, the board's look and
// the best results. Presentational: texts and handlers come from the screen (client.tsx).
import { type ReactElement, type ReactNode, type Ref, useId } from 'react';
import { type Size, SIZES } from './rules.ts';
import { sizeLabel } from './view-model.ts';

/** The dialog's click: one on the backdrop (the dialog element itself, not its content) closes it. */
export function closeOnBackdrop(onClose: () => void) {
  return (event: { target: unknown; currentTarget: unknown }): void => {
    if (event.target === event.currentTarget) onClose();
  };
}

/** A size button's click: picks its size. */
export function pickSize(onPick: (size: Size) => void, size: Size): () => void {
  return () => {
    onPick(size);
  };
}

/**
 * The dialog itself: a title with a close button, then the sections. A click on the backdrop
 * (the dialog element itself, outside its content) closes it too; Escape is the browser's own.
 */
export function Menu(props: {
  dialogRef?: Ref<HTMLDialogElement>;
  onClose: () => void;
  children: ReactNode;
}): ReactElement {
  const titleId = useId();
  return (
    <dialog
      ref={props.dialogRef}
      data-testid="menu"
      className="sp-menu"
      aria-labelledby={titleId}
      onClick={closeOnBackdrop(props.onClose)}
    >
      <div className="sp-menu-inner">
        <div className="sp-menu-head">
          <h2 id={titleId} className="sp-menu-title">
            Menu
          </h2>
          <button
            type="button"
            data-testid="menu-close"
            className="sp-button sp-icon-button"
            onClick={props.onClose}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            <span className="sp-visually-hidden">Close menu</span>
          </button>
        </div>
        <div className="sp-menu-body">{props.children}</div>
      </div>
    </dialog>
  );
}

/** One section of the menu, under its own heading. */
export function MenuSection(props: { title: string; children: ReactNode }): ReactElement {
  const headingId = useId();
  return (
    <section className="sp-menu-section" aria-labelledby={headingId}>
      <h3 id={headingId} className="sp-menu-heading">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

/** Board size: picking one starts a new game of that size in place of this one. */
export function SizeChoice(props: {
  current: Size | undefined;
  busy: boolean;
  onPick: (size: Size) => void;
}): ReactElement {
  const labelId = useId();
  const hintId = useId();
  return (
    <section className="sp-menu-section sp-sizes" aria-labelledby={labelId}>
      <h3 id={labelId} className="sp-menu-heading">
        Board size
      </h3>
      <div className="sp-row" role="group" aria-labelledby={labelId} aria-describedby={hintId}>
        {SIZES.map((size) => (
          <button
            key={size}
            type="button"
            data-testid={`size-${String(size)}`}
            className="sp-button"
            aria-pressed={size === props.current}
            aria-disabled={props.busy}
            onClick={pickSize(props.onPick, size)}
          >
            {sizeLabel(size)}
          </button>
        ))}
      </div>
      <p id={hintId} className="sp-hint">
        Picking a size starts a new game in place of this one.
      </p>
    </section>
  );
}

/** The best results on the current board size, best first; nothing at all until there is one. */
export function BestResults(props: {
  title: string;
  lines: readonly string[];
}): ReactElement | null {
  const labelId = useId();
  if (props.lines.length === 0) return null;
  return (
    <section className="sp-menu-section sp-best" aria-labelledby={labelId}>
      <h3 id={labelId} className="sp-menu-heading">
        {props.title}
      </h3>
      <ol data-testid="best-list" aria-labelledby={labelId}>
        {props.lines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ol>
    </section>
  );
}
