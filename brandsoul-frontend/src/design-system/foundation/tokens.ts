export const foundationTokens = {
  color: {
    bg: {
      canvas: 'var(--ds-color-bg-canvas)',
      surface: 'var(--ds-color-bg-surface)',
      subtle: 'var(--ds-color-bg-subtle)',
      inverse: 'var(--ds-color-bg-inverse)',
    },
    text: {
      primary: 'var(--ds-color-text-primary)',
      secondary: 'var(--ds-color-text-secondary)',
      muted: 'var(--ds-color-text-muted)',
      inverse: 'var(--ds-color-text-inverse)',
    },
    border: {
      default: 'var(--ds-color-border-default)',
      strong: 'var(--ds-color-border-strong)',
    },
    accent: {
      primary: 'var(--ds-color-accent-primary)',
      hover: 'var(--ds-color-accent-primary-hover)',
      active: 'var(--ds-color-accent-primary-active)',
    },
  },
  space: {
    1: 'var(--ds-space-1)',
    2: 'var(--ds-space-2)',
    3: 'var(--ds-space-3)',
    4: 'var(--ds-space-4)',
    5: 'var(--ds-space-5)',
    6: 'var(--ds-space-6)',
    7: 'var(--ds-space-7)',
  },
  radius: {
    sm: 'var(--ds-radius-sm)',
    md: 'var(--ds-radius-md)',
    lg: 'var(--ds-radius-lg)',
  },
  elevation: {
    1: 'var(--ds-elevation-1)',
    2: 'var(--ds-elevation-2)',
  },
  motion: {
    fast: 'var(--ds-motion-duration-fast)',
    base: 'var(--ds-motion-duration-base)',
    slow: 'var(--ds-motion-duration-slow)',
    easeStandard: 'var(--ds-motion-ease-standard)',
  },
} as const;

export type FoundationTokens = typeof foundationTokens;
