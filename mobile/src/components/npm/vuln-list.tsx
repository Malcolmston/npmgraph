import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { VulnerablePackage } from '@/lib/types';

const WARNING = '#d64545';

export function VulnList(props: { items: VulnerablePackage[] }): React.JSX.Element | null {
  const scheme = useColorScheme() ?? 'light';

  if (props.items.length === 0) {
    return null;
  }

  const cardBackground = scheme === 'dark' ? 'rgba(214, 69, 69, 0.15)' : 'rgba(214, 69, 69, 0.08)';

  return (
    <View style={styles.list}>
      {props.items.map((item) => (
        <View
          key={item.key}
          style={[styles.card, { backgroundColor: cardBackground, borderColor: WARNING }]}
        >
          <ThemedText type="smallBold" style={styles.key}>
            {item.key}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.ids}>
            {item.vulnerabilities.join(', ')}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  key: {
    color: WARNING,
  },
  ids: {
    marginTop: Spacing.one,
  },
});
