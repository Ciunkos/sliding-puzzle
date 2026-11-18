// A friendly nickname such as tortoise-squirrel-123. Pure: the random source is a required argument,
// supplied by the web composition root.
import { ADJECTIVES, ANIMALS } from './words.ts';

/** An index into `length` items for a random value in [0, 1); clamped so 1 cannot overflow. */
function indexFor(value: number, length: number): number {
  return Math.min(Math.floor(value * length), length - 1);
}

function pick(words: readonly string[], random: () => number): string {
  return words[indexFor(random(), words.length)] ?? '';
}

export function generateNickname(random: () => number): string {
  const adjective = pick(ADJECTIVES, random);
  const animal = pick(ANIMALS, random);
  const number = 100 + indexFor(random(), 900);
  return `${adjective}-${animal}-${String(number)}`;
}
