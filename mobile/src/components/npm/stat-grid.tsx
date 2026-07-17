import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function StatGrid(props: { items: { label: string; value: string }[] }): React.JSX.Element {
  const theme = useColorScheme() === 'dark' ? Colors.dark : Colors.light;

  return (
    <View style={styles.grid}>
      {props.items.map((item, index) => (
        <View
          key={`${item.label}-${index}`}
          style={[
            styles.tile,
            { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected },
          ]}
        >
          <ThemedText style={styles.value} numberOfLines={1}>
            {item.value}
          </ThemedText>
          <ThemedText style={styles.label} themeColor="textSecondary" numberOfLines={1}>
            {item.label}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tile: {
    width: '48%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    gap: Spacing.one,
  },
  value: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: 700,
  },
  label: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: 500,
  },
});
