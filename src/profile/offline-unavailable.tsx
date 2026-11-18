// Shown offline for a profile this device has never opened: its game is on the server only.
import { type ReactElement, useId } from 'react';
import * as styles from './styles.ts';

export function OfflineUnavailable(props: {
  /** A profile this device can open offline, if any. */
  other: string | undefined;
  onOpen: (nickname: string) => void;
}): ReactElement {
  const headingId = useId();
  const { other } = props;
  return (
    <section aria-labelledby={headingId} data-testid="profile-offline" className={styles.section}>
      <h2 id={headingId} className={styles.heading}>
        This profile cannot be opened offline
      </h2>
      <p>It has not been played on this device yet. It opens when you are back online.</p>
      {other === undefined ? null : (
        <button
          type="button"
          data-testid="offline-open-other"
          className={styles.button}
          onClick={() => {
            props.onOpen(other);
          }}
        >
          Play as {other} instead
        </button>
      )}
    </section>
  );
}
