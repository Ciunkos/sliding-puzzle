// Client entry: the profile picker. Logic lives in api.ts, last-profile.ts and form.ts; this stays presentational.
import { type ReactElement, type SyntheticEvent, useId, useMemo, useState } from 'react';
import { createProfileApi, ProfileApiError } from './api.ts';
import { loadLastNickname, saveLastNickname } from './last-profile.ts';
import type { Profile } from './index.ts';
import { validateNickname } from './form.ts';

export { createProfileApi, ProfileApiError } from './api.ts';
export { loadLastNickname, saveLastNickname } from './last-profile.ts';

const GENERIC_MESSAGE = 'Could not reach the server';

const styles = {
  form: { display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '20rem' },
  input: { padding: '0.5rem', fontSize: '1rem' },
  button: { padding: '0.5rem', fontSize: '1rem' },
  error: { color: '#b00020', margin: 0 },
} as const;

export function ProfilePicker(props: {
  onSelected: (profile: Profile) => void;
  api?: ReturnType<typeof createProfileApi>;
}): ReactElement {
  const { onSelected, api } = props;
  const client = useMemo(() => api ?? createProfileApi(), [api]);
  const inputId = useId();
  const [value, setValue] = useState<string>(() => loadLastNickname() ?? '');
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const checked = validateNickname(value);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const profile = await client.selectOrCreate(checked.nickname);
      saveLastNickname(checked.nickname);
      onSelected(profile);
    } catch (err: unknown) {
      setError(err instanceof ProfileApiError ? err.message : GENERIC_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Who is playing?</h2>
      <form
        style={styles.form}
        onSubmit={(event) => {
          void submit(event);
        }}
        noValidate
      >
        <label htmlFor={inputId}>Nickname</label>
        <input
          id={inputId}
          data-testid="nickname-input"
          style={styles.input}
          type="text"
          autoComplete="nickname"
          value={value}
          disabled={busy}
          aria-invalid={error !== undefined}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
        <button type="submit" data-testid="profile-submit" style={styles.button} disabled={busy}>
          Play
        </button>
        {error !== undefined ? (
          <p role="alert" data-testid="profile-error" style={styles.error}>
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
