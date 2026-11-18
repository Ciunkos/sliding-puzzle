// Who is playing, that there is no login, the share link, and how to switch to another profile.
import { type ReactElement, useEffect, useId, useRef, useState } from 'react';
import { copyText, type CopyResult } from './copy-link.ts';
import * as styles from './styles.ts';
import { type ProfileForm, useProfileForm } from './use-profile-form.ts';

const COPY_MESSAGES: Record<CopyResult, string> = {
  copied: 'Link copied.',
  unavailable: 'Could not copy. Copy the link from the address bar.',
  failed: 'Could not copy. Copy the link from the address bar.',
};

function CopyLink({ url }: { url: string }): ReactElement {
  const [result, setResult] = useState<CopyResult | undefined>(undefined);
  return (
    <div className={styles.row}>
      <button
        type="button"
        data-testid="copy-link"
        className={styles.button}
        onClick={() => {
          void copyText(url).then(setResult);
        }}
      >
        Copy link
      </button>
      <span role="status" data-testid="copy-status">
        {result === undefined ? '' : COPY_MESSAGES[result]}
      </span>
    </div>
  );
}

function SwitchForm({ form }: { form: ProfileForm }): ReactElement {
  const inputId = useId();
  const errorId = useId();
  return (
    <form onSubmit={form.submit} noValidate>
      <label htmlFor={inputId}>Play as another nickname</label>
      <div className={styles.row}>
        <input
          id={inputId}
          data-testid="nickname-input"
          className={styles.input}
          type="text"
          autoComplete="nickname"
          autoCapitalize="none"
          value={form.value}
          aria-invalid={form.error !== undefined}
          aria-describedby={form.error === undefined ? undefined : errorId}
          onChange={(event) => {
            form.setValue(event.target.value);
          }}
        />
        <button type="submit" data-testid="profile-submit" className={styles.button}>
          Play
        </button>
      </div>
      {form.error === undefined ? null : (
        <p id={errorId} role="alert" data-testid="profile-error" className={styles.error}>
          {form.error}
        </p>
      )}
    </form>
  );
}

function SwitchProfile(props: {
  onOpen: (nickname: string) => void;
  onRandom: () => void;
}): ReactElement {
  const form = useProfileForm(props.onOpen);
  return (
    <details data-testid="switch-profile">
      <summary className={styles.summary}>Switch profile</summary>
      <SwitchForm form={form} />
      <div className={styles.row}>
        <button
          type="button"
          data-testid="new-random-profile"
          className={styles.button}
          onClick={props.onRandom}
        >
          New random profile
        </button>
      </div>
    </details>
  );
}

export function ProfileBar(props: {
  nickname: string;
  /** The full URL of this profile, to share. */
  shareUrl: string;
  /** Moves focus to the heading when it appears, e.g. after leaving the invalid-name screen. */
  focusOnMount: boolean;
  onOpen: (nickname: string) => void;
  onRandom: () => void;
}): ReactElement {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (props.focusOnMount) heading.current?.focus();
    // Only when the bar appears; later changes of the profile keep focus where it is.
  }, []);
  return (
    <section aria-labelledby={headingId} className={styles.section}>
      {/* The profile's stylesheet; the bar is on screen whenever the profile's error can be. */}
      <style>{styles.css}</style>
      <h2 id={headingId} ref={heading} tabIndex={-1} className={styles.heading}>
        Playing as <span data-testid="current-profile">{props.nickname}</span>
      </h2>
      <p data-testid="profile-notice" className={styles.notice}>
        There is no login. Anyone with this link can play this profile.
      </p>
      <CopyLink key={props.shareUrl} url={props.shareUrl} />
      <SwitchProfile onOpen={props.onOpen} onRandom={props.onRandom} />
    </section>
  );
}
