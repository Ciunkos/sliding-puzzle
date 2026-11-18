// Shown for a profile URL whose name breaks the nickname rules. Nothing is created for it.
import { type ReactElement, useId } from 'react';
import { validateNickname } from './form.ts';
import * as styles from './styles.ts';

/** The rule the name breaks, in the words of the nickname rules (index.ts), capitalised. */
function ruleBroken(raw: string): string {
  const checked = validateNickname(raw);
  const message = checked.ok ? 'invalid nickname' : checked.message;
  return `${message.charAt(0).toUpperCase()}${message.slice(1)}.`;
}

function Explanation({ raw }: { raw: string }): ReactElement {
  if (raw === '') return <p>The link has no profile name.</p>;
  return (
    <p>
      The link asks for the profile <span style={styles.raw}>“{raw}”</span>, but that name cannot be
      used.
    </p>
  );
}

export function InvalidProfile(props: { raw: string; onNewRandom: () => void }): ReactElement {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} data-testid="invalid-profile" style={styles.section}>
      <h2 id={headingId} style={styles.heading}>
        This profile name cannot be used
      </h2>
      <Explanation raw={props.raw} />
      <p>{ruleBroken(props.raw)}</p>
      <p>Nothing was created for this link.</p>
      <button
        type="button"
        data-testid="invalid-new-random"
        style={styles.button}
        onClick={props.onNewRandom}
      >
        Play as a new random profile
      </button>
    </section>
  );
}
