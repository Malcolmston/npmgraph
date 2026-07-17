import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { categoryColor, categoryLabel } from '@/lib/format';
import type { NodeCategory } from '@/lib/types';

export function CategoryChip(props: {
  category: NodeCategory;
  count?: number;
  active?: boolean;
  onPress?: () => void;
}): React.JSX.Element {
  const { category, count, active = true, onPress } = props;

  const scheme = useColorScheme();
  const theme = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const content = (
    <View
      style={[
        styles.pill,
        {
          borderColor: theme.backgroundSelected,
          backgroundColor: theme.backgroundElement,
          opacity: active ? 1 : 0.45,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: categoryColor(category) }]} />
      <ThemedText type="small">{categoryLabel(category)}</ThemedText>
      {count !== undefined ? (
        <ThemedText type="small" themeColor="textSecondary">
          {count}
        </ThemedText>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button">
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
});
