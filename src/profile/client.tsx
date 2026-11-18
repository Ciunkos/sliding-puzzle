// Client entry: the profile picker. Logic lives in api.ts, last-profile.ts, form.ts and
// use-profile-form.ts; this stays presentational.
import { type ReactElement, useId } from 'react';
import { createProfileApi } from './api.ts';
import type { Profile } from './index.ts';
import { type ProfileForm, useProfileForm } from './use-profile-form.ts';

const api = createProfileApi();

const styles = {
  form: { display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '20rem' },
  input: { padding: '0.5rem', fontSize: '1rem' },
  button: { padding: '0.5rem', fontSize: '1rem' },
  error: { color: '#b00020', margin: 0 },
} as const;

function NicknameField({ form }: { form: ProfileForm }): ReactElement {
  const inputId = useId();
  return (
    <>
      <label htmlFor={inputId}>Nickname</label>
      <input
        id={inputId}
        data-testid="nickname-input"
        style={styles.input}
        type="text"
        autoComplete="nickname"
        value={form.value}
        disabled={form.busy}
        aria-invalid={form.error !== undefined}
        onChange={(event) => {
          form.setValue(event.target.value);
        }}
      />
    </>
  );
}

export function ProfilePicker(props: { onSelected: (profile: Profile) => void }): ReactElement {
  const form = useProfileForm(api, props.onSelected);
  return (
    <section>
      <h2>Who is playing?</h2>
      <form style={styles.form} onSubmit={form.submit} noValidate>
        <NicknameField form={form} />
        <button
          type="submit"
          data-testid="profile-submit"
          style={styles.button}
          disabled={form.busy}
        >
          Play
        </button>
        {form.error !== undefined ? (
          <p role="alert" data-testid="profile-error" style={styles.error}>
            {form.error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
