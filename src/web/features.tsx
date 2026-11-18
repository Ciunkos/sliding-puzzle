// The installed game features. Every line naming a feature ends with its `// pin:` comment.
import type { ClientFeature } from '../game/client.tsx';
import { puzzle } from '../puzzle/client.tsx'; // pin: puzzle

export const features: ClientFeature[] = [
  puzzle, // pin: puzzle
];
