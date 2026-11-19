// The first-visit toast: who is playing, and that the link is the login. It floats over the page
// (nothing moves when it comes or goes), takes no taps (the game under it stays playable) and goes
// by itself; the same notice stays in the game's menu for good.
import { type ReactElement, type Ref, useEffect, useId, useRef } from 'react';
import * as styles from './styles.ts';

export function WelcomeToast(props: {
  /** The toast itself, so focus can leave it before it goes (use-welcome.ts). */
  toastRef?: Ref<HTMLElement>;
  nickname: string;
  /** Moves focus to its heading, e.g. after leaving the invalid-name screen. */
  focusOnMount: boolean;
}): ReactElement {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (props.focusOnMount) heading.current?.focus();
    // Only when the toast appears.
  }, []);
  return (
    <section
      ref={props.toastRef}
      aria-labelledby={headingId}
      data-testid="welcome"
      className={styles.toast}
    >
      <h2 id={headingId} ref={heading} tabIndex={-1} className={styles.toastHeading}>
        Playing as <span className={styles.toastName}>{props.nickname}</span>
      </h2>
      <p data-testid="profile-notice" className={styles.toastNotice}>
        There is no login. Anyone with this link can play this profile.
      </p>
    </section>
  );
}
