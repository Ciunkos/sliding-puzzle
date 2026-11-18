// State of the profile picker form: the typed nickname, a validation or server error, busy.
import { type SyntheticEvent, useState } from 'react';
import { type createProfileApi, ProfileApiError } from './api.ts';
import { validateNickname } from './form.ts';
import type { Profile } from './index.ts';
import { loadLastNickname, saveLastNickname } from './last-profile.ts';

const GENERIC_MESSAGE = 'Could not reach the server';

export interface ProfileForm {
  value: string;
  error: string | undefined;
  busy: boolean;
  setValue: (value: string) => void;
  submit: (event: SyntheticEvent<HTMLFormElement>) => void;
}

export function useProfileForm(
  api: ReturnType<typeof createProfileApi>,
  onSelected: (profile: Profile) => void,
): ProfileForm {
  const [value, setValue] = useState<string>(() => loadLastNickname() ?? '');
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function select(nickname: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const profile = await api.selectOrCreate(nickname);
      saveLastNickname(nickname);
      onSelected(profile);
    } catch (err: unknown) {
      setError(err instanceof ProfileApiError ? err.message : GENERIC_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const checked = validateNickname(value);
    if (checked.ok) void select(checked.nickname);
    else setError(checked.message);
  }

  return { value, error, busy, setValue, submit };
}
