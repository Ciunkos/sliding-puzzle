// Inline styles of the profile screens. Buttons and the field are at least 44px tall (touch targets).
import type { CSSProperties } from 'react';

export const section: CSSProperties = {
  border: '2px solid #111',
  borderRadius: 8,
  padding: '12px 16px',
  margin: '0 0 16px',
  color: '#111',
  background: '#fff',
};

export const heading: CSSProperties = { fontSize: 18, margin: '0 0 4px', overflowWrap: 'anywhere' };

export const notice: CSSProperties = { margin: '0 0 8px' };

export const row: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
  margin: '8px 0 0',
};

export const button: CSSProperties = {
  minHeight: 44,
  fontSize: 16,
  padding: '8px 14px',
  borderRadius: 6,
  border: '2px solid #111',
  background: '#fff',
  color: '#111',
  cursor: 'pointer',
};

export const input: CSSProperties = {
  minHeight: 44,
  boxSizing: 'border-box',
  fontSize: 16,
  padding: '8px',
  flex: '1 1 10rem',
  minWidth: 0,
};

/** Keeps the default display (list-item), so the disclosure triangle stays visible. */
export const summary: CSSProperties = {
  minHeight: 44,
  boxSizing: 'border-box',
  padding: '12px 0',
  cursor: 'pointer',
  fontWeight: 600,
};

export const error: CSSProperties = { color: '#b00020', fontWeight: 600, margin: '8px 0 0' };

export const raw: CSSProperties = { overflowWrap: 'anywhere', fontWeight: 600 };
