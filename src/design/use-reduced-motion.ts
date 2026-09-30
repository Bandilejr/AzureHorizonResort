// src/design/use-reduced-motion.ts — honors the OS "reduce motion" setting so
// all animated UI can opt out. Motion elsewhere must use the native driver.
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (alive) setReduced(!!v); })
      .catch(() => { /* default false */ });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduced(!!v));
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduced;
}
