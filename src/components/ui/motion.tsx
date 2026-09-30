// src/components/ui/motion.tsx — minimal, native-driver entrance motion that
// automatically disables when the OS "reduce motion" setting is on.
import React, { useEffect, useState, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '@/design/use-reduced-motion';

export function FadeSlideIn({
  children,
  style,
  distance = 8,
  duration = 250,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  distance?: number;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  const [anim] = useState(() => new Animated.Value(reduced ? 1 : 0));

  useEffect(() => {
    if (reduced) { anim.setValue(1); return; }
    Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }).start();
  }, [anim, reduced, duration]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
