import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function Loading(props: { label?: string }): React.JSX.Element {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];

  return (
    <ThemedView style={styles.center}>
      <ActivityIndicator color={theme.text} />
      {props.label ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.spaced}>
          {props.label}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

export function ErrorView(props: { message: string; onRetry?: () => void }): React.JSX.Element {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = Colors[scheme];

  return (
    <ThemedView style={styles.center}>
      <ThemedText type="small" style={styles.errorText}>
        {props.message}
      </ThemedText>
      {props.onRetry ? (
        <Pressable
          onPress={props.onRetry}
          style={[styles.retry, { backgroundColor: theme.backgroundElement }]}
        >
          <ThemedText type="smallBold">Retry</ThemedText>
        </Pressable>
      ) : null}
    </ThemedView>
  );
}

export function EmptyState(props: { text: string }): React.JSX.Element {
  return (
    <ThemedView style={styles.center}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
        {props.text}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  spaced: {
    marginTop: Spacing.two,
  },
  centerText: {
    textAlign: 'center',
  },
  errorText: {
    color: '#d64545',
    textAlign: 'center',
  },
  retry: {
    marginTop: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
  },
});
