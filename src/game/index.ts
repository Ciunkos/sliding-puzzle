import { z } from 'zod';
import { isValidBoard } from '../puzzle/index.ts';

const board = z
  .array(z.number().int().min(0).max(15))
  .length(16)
  .refine((value) => isValidBoard(value))
  .readonly();

export const gameStateSchema = z.object({
  board,
  initial: board,
  moves: z.number().int().min(0),
  solved: z.boolean(),
  version: z.number().int().min(1),
});

export type GameState = z.infer<typeof gameStateSchema>;

export const moveRequestSchema = z.object({
  tile: z.number().int().min(1).max(15),
});

export type MoveRequest = z.infer<typeof moveRequestSchema>;
