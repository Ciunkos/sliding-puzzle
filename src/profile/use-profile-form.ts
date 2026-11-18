// State of the "play as another nickname" form: the typed nickname and a validation message.
import { type SyntheticEvent, useState } from 'react';
import { validateNickname } from './form.ts';

export interface ProfileForm {
  value: string;
  error: string | undefined;
  setValue: (value: string) => void;
  submit: (event: SyntheticEvent<HTMLFormElement>) => void;
}

/** A valid nickname goes to `onSubmit` and clears the field; an invalid one shows the rule message. */
export function useProfileForm(onSubmit: (nickname: string) => void): ProfileForm {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const checked = validateNickname(value);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(undefined);
    setValue('');
    onSubmit(checked.nickname);
  }

  return { value, error, setValue, submit };
}
