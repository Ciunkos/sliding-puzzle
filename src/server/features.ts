// The installed game features. Every line naming a feature ends with its `// pin:` comment.
import type { ServerFeature } from '../game/server.ts';
import { puzzle } from '../puzzle/server.ts'; // pin: puzzle

export const features: ServerFeature[] = [
  puzzle, // pin: puzzle
];
