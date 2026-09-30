export const theme = {
  bg: '#101512',
  bgRaised: '#1a221e',
  ink: '#f3f1ea',
  muted: '#a7b0a8',
  line: '#2c3832',
  accent: '#d7a15e',
  water: '#7eb8b2',
};

export const fps = 30;

export const seconds = (value: number): number => Math.round(value * fps);
