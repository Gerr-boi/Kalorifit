/**
 * Haptic feedback choreography.
 * Web Vibration API — works on Android browsers, silently no-ops on iOS/desktop.
 * Three named levels with distinct tactile signatures:
 *   light  → single short tap (food add, water log, generic confirmation)
 *   medium → double pulse (milestone: 50% goal reached)
 *   strong → crescendo + thump (ring complete, perfect day)
 */

function vibe(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

export const haptics = {
  /** Quick confirmation tap. */
  light() {
    vibe(10);
  },

  /** Double pulse — "checkpoint reached". */
  medium() {
    vibe([22, 16, 22]);
  },

  /**
   * Crescendo thump — short-short-pause-LONG.
   * The build-up makes the final beat feel earned.
   */
  strong() {
    vibe([14, 10, 24, 10, 70]);
  },
};
