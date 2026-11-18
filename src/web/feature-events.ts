// What a game's screen may send to usage statistics: an allowlist owned by the composition root.
// An event that is not on the list is dropped; a property that is not on it is removed; a string
// must be one of its known values and a number must be finite. So a screen can never send a
// nickname, a board or a picture, whatever it reports.
import type { FeatureEvent } from '../game/client.tsx';

type Value = FeatureEvent['properties'][string];
/** Whether a property's value may be sent. */
type Rule = (value: Value) => boolean;

const FINITE: Rule = (value) => typeof value === 'number' && Number.isFinite(value);
const oneOf =
  (...values: string[]): Rule =>
  (value) =>
    typeof value === 'string' && values.includes(value);

/** Event name -> its allowed properties and their rules. */
const ALLOWLIST = new Map<string, Readonly<Record<string, Rule>>>([
  ['game_started', { size: FINITE }],
  ['game_solved', { size: FINITE, moves: FINITE, seconds: FINITE }],
  ['skin_changed', { kind: oneOf('numbers', 'picture', 'photo') }],
]);

/** The event as it may leave the page, or undefined when it may not leave at all. */
export function allowedEvent(event: FeatureEvent): FeatureEvent | undefined {
  const rules = ALLOWLIST.get(event.name);
  if (rules === undefined) return undefined;
  const properties = Object.fromEntries(
    Object.entries(event.properties).filter(([key, value]) => rules[key]?.(value) === true),
  );
  return { name: event.name, properties };
}

/** The screens' `onEvent`: hands `track` the allowed part of each event, and nothing else. */
export function forwardFeatureEvents(
  track: (event: FeatureEvent) => void,
): (event: FeatureEvent) => void {
  return (event) => {
    const allowed = allowedEvent(event);
    if (allowed !== undefined) track(allowed);
  };
}
