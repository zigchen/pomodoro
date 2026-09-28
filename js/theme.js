// Accent color theming: a few muted-pastel presets plus fully custom colors
// (native <input type="color"> pickers), applied as CSS custom properties so
// every existing rule that already reads var(--accent)/var(--accent-break)
// picks them up automatically.

import { ACCENT_FOCUS_KEY, ACCENT_BREAK_KEY } from './storage.js';

export const ACCENT_PRESETS = [
  { name: 'Classic', focus: '#ff6b6b', break: '#4ecdc4' },
  { name: 'Blush & Sage', focus: '#e8a0a0', break: '#9dbf9e' },
  { name: 'Lavender & Peach', focus: '#c9a8e0', break: '#f4b892' },
  { name: 'Dusty Blue & Rose', focus: '#8fb8d9', break: '#e3a9bb' },
  { name: 'Sand & Seafoam', focus: '#e0c097', break: '#a3d9c9' },
];

export function applyAccentColors(focus, breakColor) {
  document.documentElement.style.setProperty('--accent', focus);
  document.documentElement.style.setProperty('--accent-break', breakColor);
  localStorage.setItem(ACCENT_FOCUS_KEY, focus);
  localStorage.setItem(ACCENT_BREAK_KEY, breakColor);
}

/** Re-applies any saved colors and returns the active {focus, break} pair. */
export function restoreAccentColors() {
  const focus = localStorage.getItem(ACCENT_FOCUS_KEY);
  const breakColor = localStorage.getItem(ACCENT_BREAK_KEY);
  if (focus && breakColor) {
    document.documentElement.style.setProperty('--accent', focus);
    document.documentElement.style.setProperty('--accent-break', breakColor);
  }
  return {
    focus: focus || ACCENT_PRESETS[0].focus,
    break: breakColor || ACCENT_PRESETS[0].break,
  };
}
