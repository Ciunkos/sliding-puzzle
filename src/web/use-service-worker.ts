// Registers the service worker and follows its updates; what to show and do is decided by update.ts.
// Browsers without service workers (an insecure origin, some private windows) simply get no offline
// support: a failed registration is not an error worth a console message.
import { useEffect, useState } from 'react';
import { type UpdateState, updateStep } from './update.ts';

/** The registration scope: the app's base without a trailing slash, so /sliding-puzzle is in it. */
const SCOPE = '/sliding-puzzle';

/** Calls `onWaiting` when `registration` has, or later gets, a new version waiting. */
function watchWaiting(registration: ServiceWorkerRegistration, onWaiting: () => void): void {
  if (registration.waiting !== null && navigator.serviceWorker.controller !== null) onWaiting();
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller !== null) {
        onWaiting();
      }
    });
  });
}

type Change = Partial<UpdateState> | ((current: UpdateState) => Partial<UpdateState>);

/**
 * A change of controller on a page no worker controlled is the first install claiming it: from then
 * on the page is controlled. On a controlled page it is a new version taking over.
 */
const CONTROLLER_CHANGED = (current: UpdateState): Partial<UpdateState> =>
  current.hadController ? { controllerChanged: true } : { hadController: true };

/** Registers `url` and reports a waiting version and a change of controller into `update`. */
function useRegistration(url: string | undefined, update: (change: Change) => void) {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | undefined>();
  useEffect(() => {
    if (url === undefined || !('serviceWorker' in navigator)) return;
    const container = navigator.serviceWorker;
    update({ hadController: container.controller !== null });
    const onChange = () => {
      update(CONTROLLER_CHANGED);
    };
    container.addEventListener('controllerchange', onChange);
    container.register(url, { scope: SCOPE, updateViaCache: 'none' }).then(
      (registered) => {
        setRegistration(registered);
        watchWaiting(registered, () => {
          update({ waiting: true });
        });
      },
      () => undefined,
    );
    return () => {
      container.removeEventListener('controllerchange', onChange);
    };
  }, [url]);
  return registration;
}

/**
 * `url` is the worker script, or undefined to register nothing (development). Returns whether to
 * offer the new version, and the action of its Reload button.
 */
export function useServiceWorker(url: string | undefined): { offer: boolean; reload: () => void } {
  const [state, setState] = useState<UpdateState>({
    hadController: false,
    waiting: false,
    controllerChanged: false,
    requested: false,
  });
  const update = (change: Change) => {
    setState((current) => ({
      ...current,
      ...(typeof change === 'function' ? change(current) : change),
    }));
  };
  const registration = useRegistration(url, update);
  const step = updateStep(state);

  useEffect(() => {
    if (step === 'activate') registration?.waiting?.postMessage('skip-waiting');
    if (step === 'reload') window.location.reload();
  }, [step, registration]);

  return {
    offer: step !== 'none',
    reload: () => {
      update({ requested: true });
    },
  };
}
