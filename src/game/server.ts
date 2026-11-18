// Server entry: the generic game service, its routes, and the shape of a game feature's server side.
import { Hono } from 'hono';
import type { Db } from '../db/index.ts';
import type { GameDefinition } from './index.ts';
import { gameRoutes, type ProfileLookup } from './routes.ts';
import { createGameService, type GameService } from './service.ts';

export * from './index.ts';
/** What a game feature hands to the server composition root. */
export interface ServerFeature<State = unknown, Move = unknown, Options = unknown> {
  definition: GameDefinition<State, Move, Options>;
  /** Test-only routes. Mounted only when the composition root enables test routes. */
  testRoutes?(context: {
    service: GameService<State, Move, Options>;
    profiles: ProfileLookup;
  }): Hono;
}

export interface FeatureContext {
  db: Db;
  profiles: ProfileLookup;
  random: () => number;
  now: () => Date;
  enableTestRoutes: boolean;
}

/** The routes of one game feature: its game routes, plus its test routes when enabled. */
export function featureRoutes<State, Move, Options>(
  feature: ServerFeature<State, Move, Options>,
  context: FeatureContext,
): Hono {
  const { definition } = feature;
  const service = createGameService(context.db, definition, context);
  const app = new Hono();
  app.route('/', gameRoutes(definition, service, context.profiles));
  if (context.enableTestRoutes && feature.testRoutes) {
    app.route('/', feature.testRoutes({ service, profiles: context.profiles }));
  }
  return app;
}
