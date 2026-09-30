import React, { useState } from 'react';
import { Image, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/design/use-app-theme';

interface PhotoThumbProps {
  uri: string | null | undefined;
  size?: number;
  borderRadius?: number;
  borderColor?: string;
  label?: string;
}

/**
 * Resilient photo thumbnail for admin views.
 * - Stores data-URLs (base64) render directly.
 * - Device-local file:// paths only render on the device that took the photo;
 *   anywhere else (or after cache wipe) the image fails and we fall back to a
 *   labelled placeholder instead of a broken blank box.
 */
export default function PhotoThumb({
  uri,
  size = 72,
  borderRadius = 8,
  borderColor,
  label,
}: PhotoThumbProps) {
  const theme = useAppTheme();
  const [failed, setFailed] = useState(false);
  const border = borderColor ?? theme.colors.border;

  const raw = typeof uri === 'string' ? uri : '';
  if (!raw) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius,
          borderWidth: 1,
          borderColor: border,
          backgroundColor: theme.colors.surfaceVariant,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="image-outline" size={Math.round(size * 0.35)} color={theme.colors.textMuted} />
      </View>
    );
  }

  const cleanUri = !raw.startsWith('http') && !raw.startsWith('data:') && !raw.startsWith('file:')
    ? `data:image/jpeg;base64,${raw}`
    : raw;

  if (failed) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius,
          borderWidth: 1,
          borderColor: border,
          backgroundColor: theme.colors.surfaceVariant,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="image-outline" size={Math.round(size * 0.35)} color={theme.colors.textMuted} />
        {label ? (
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.textMuted,
              fontSize: Math.max(9, Math.round(size * 0.14)),
              marginTop: 2,
              paddingHorizontal: 4,
            }}
          >
            {label}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <Image
      source={{ uri: cleanUri }}
      style={{ width: size, height: size, borderRadius }}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}
