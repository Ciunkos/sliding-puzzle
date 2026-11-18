// Hand-written boards (the data-board attribute, 0 is the blank). Never computed.

/** The known board seeded by startKnownGame: the solved board with tile 15 slid once. */
export const KNOWN_BOARD = '1,2,3,4,5,6,7,8,9,10,11,12,13,14,0,15';
/** KNOWN_BOARD after tile 11 slid down into the blank. */
export const AFTER_TILE_11 = '1,2,3,4,5,6,7,8,9,10,0,12,13,14,11,15';
/** AFTER_TILE_11 after tile 12 slid left into the blank. */
export const AFTER_TILE_11_THEN_12 = '1,2,3,4,5,6,7,8,9,10,12,0,13,14,11,15';
export const SOLVED_BOARD = '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0';
