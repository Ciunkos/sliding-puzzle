// "Enable tilt" on phones: device orientation is only read after the player asks for it. On iOS
// that needs DeviceOrientationEvent.requestPermission() from the tap itself; a refusal or a
// browser without the sensor API simply leaves tilt off.
import { useState } from 'react';
import { useMedia } from './use-media.ts';

export interface OrientationTilt {
  /** The device has an orientation API and a touch screen, so the control is worth showing. */
  available: boolean;
  on: boolean;
  toggle: () => void;
}

async function permission(): Promise<boolean> {
  const request: unknown = Reflect.get(DeviceOrientationEvent, 'requestPermission');
  if (typeof request !== 'function') return true;
  try {
    const answer: unknown = await Reflect.apply(request, DeviceOrientationEvent, []);
    return answer === 'granted';
  } catch {
    return false;
  }
}

export function useOrientationTilt(): OrientationTilt {
  const coarse = useMedia('(pointer: coarse)');
  const [on, setOn] = useState(false);
  const available = coarse && typeof DeviceOrientationEvent !== 'undefined';
  return {
    available,
    on,
    toggle: () => {
      if (on) {
        setOn(false);
        return;
      }
      void permission().then(setOn);
    },
  };
}
