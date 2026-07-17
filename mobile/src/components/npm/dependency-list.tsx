import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { categoryColor, categoryOf } from '@/lib/format';
import type { GraphNode } from '@/lib/types';

const MAX_ROWS = 300;

function markerFor(node: GraphNode): string | null {
  if ((node.vulnerabilities ?? 0) > 0) return 'vuln';
  if (node.deprecated) return 'deprecated';
  return null;
}

function DependencyRow(props: {
  node: GraphNode;
  onSelect?: (node: GraphNode) => void;
}): React.JSX.Element {
  const { node, onSelect } = props;
  const theme = useTheme();
  const color = categoryColor(categoryOf(node));
  const marker = markerFor(node);

  const content = (
    <View style={[styles.row, { borderLeftColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText type="code" style={styles.key} numberOfLines={1}>
        {node.key}
      </ThemedText>
      <View style={styles.right}>
        {marker ? (
          <ThemedText
            type="small"
            style={[styles.marker, { color }]}
            numberOfLines={1}
          >
            {marker}
          </ThemedText>
        ) : (
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.depth}
            numberOfLines={1}
          >
            {`L${node.level}`}
          </ThemedText>
        )}
      </View>
    </View>
  );

  if (!onSelect) return content;

  return (
    <Pressable
      onPress={() => onSelect(node)}
      style={({ pressed }) => [
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}
    >
      {content}
    </Pressable>
  );
}

export function DependencyList(props: {
  nodes: GraphNode[];
  onSelect?: (node: GraphNode) => void;
}): React.JSX.Element {
  const { nodes, onSelect } = props;

  const sorted = [...nodes].sort(
    (a, b) => a.level - b.level || a.name.localeCompare(b.name),
  );
  const visible = sorted.slice(0, MAX_ROWS);
  const remaining = sorted.length - visible.length;

  return (
    <View style={styles.container}>
      {visible.map((node) => (
        <DependencyRow key={node.key} node={node} onSelect={onSelect} />
      ))}
      {remaining > 0 ? (
        <View style={styles.moreRow}>
          <ThemedText type="small" themeColor="textSecondary">
            {`… ${remaining} more`}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderLeftWidth: 3,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  key: {
    flex: 1,
  },
  right: {
    marginLeft: 'auto',
    alignItems: 'flex-end',
  },
  marker: {
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  depth: {
    fontVariant: ['tabular-nums'],
  },
  moreRow: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
