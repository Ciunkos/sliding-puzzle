// Inline styles of the puzzle screen.
import type { CSSProperties } from 'react';

export const page: CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  color: '#111',
  maxWidth: 360,
  margin: '0 auto',
  padding: 16,
};

export const board: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 72px)',
  gap: 6,
  justifyContent: 'center',
  margin: '16px 0',
};

const tileBase: CSSProperties = {
  width: 72,
  height: 72,
  fontSize: 28,
  fontWeight: 700,
  border: '2px solid #111',
  borderRadius: 8,
};

export function tile(movable: boolean): CSSProperties {
  return {
    ...tileBase,
    background: movable ? '#fff' : '#e5e5e5',
    color: movable ? '#111' : '#555',
    cursor: movable ? 'pointer' : 'default',
  };
}

export const blank: CSSProperties = { width: 72, height: 72 };

export const button: CSSProperties = {
  fontSize: 16,
  padding: '8px 14px',
  marginRight: 8,
  borderRadius: 6,
  border: '2px solid #111',
  background: '#fff',
  color: '#111',
  cursor: 'pointer',
};

export const banner: CSSProperties = {
  background: '#0a6b2d',
  color: '#fff',
  padding: '10px 12px',
  borderRadius: 6,
  fontWeight: 600,
};

export const error: CSSProperties = { color: '#b00020', fontWeight: 600 };

export const controls: CSSProperties = { marginTop: 12 };
