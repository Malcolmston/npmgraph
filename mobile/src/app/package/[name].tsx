import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryChip } from '@/components/npm/category-chip';
import { DependencyList } from '@/components/npm/dependency-list';
import { ScoreCard } from '@/components/npm/score-card';
import { StatGrid } from '@/components/npm/stat-grid';
import { ErrorView, Loading } from '@/components/npm/state-views';
import { VulnList } from '@/components/npm/vuln-list';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAudit, useGraph, usePackageInfo } from '@/hooks/use-npm';
import { useTheme } from '@/hooks/use-theme';
import { categoryOf, formatBytes, formatCount } from '@/lib/format';
import type { GraphNode, NodeCategory } from '@/lib/types';

const Tint = { light: '#3c87f7', dark: '#5c9dff' } as const;

const CATEGORY_ORDER: NodeCategory[] = [
  'root',
  'transitive',
  'deprecated',
  'vulnerable',
];

function LinkButton(props: {
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const tint = useColorScheme() === 'dark' ? Tint.dark : Tint.light;

  return (
    <Pressable
      onPress={props.onPress}
      style={[
        styles.linkButton,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.backgroundSelected,
        },
      ]}
    >
      <ThemedText type="smallBold" style={{ color: tint }}>
        {props.label}
      </ThemedText>
    </Pressable>
  );
}

export default function PackageScreen(): React.JSX.Element {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();

  const info = usePackageInfo(name);
  const graph = useGraph(name);
  const audit = useAudit(name);

  const categoryCounts = graph.data
    ? graph.data.nodes.reduce<Record<NodeCategory, number>>(
        (acc, node) => {
          acc[categoryOf(node)] += 1;
          return acc;
        },
        { root: 0, transitive: 0, deprecated: 0, vulnerable: 0 },
      )
    : null;

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <Stack.Screen options={{ title: name, headerBackTitle: 'Search' }} />
      <ThemedView style={styles.fill}>
        {info.loading && !info.data ? (
          <Loading label="Loading package…" />
        ) : info.error ? (
          <ErrorView message={info.error} />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <ThemedText type="title">
                {info.data ? `${info.data.name}@${info.data.version}` : name}
              </ThemedText>
              {info.data?.description ? (
                <ThemedText themeColor="textSecondary" style={styles.description}>
                  {info.data.description}
                </ThemedText>
              ) : null}
              <View style={styles.linkRow}>
                <LinkButton
                  label="npm"
                  onPress={() =>
                    Linking.openURL(
                      `https://www.npmjs.com/package/${name}`,
                    )
                  }
                />
                {info.data?.repository ? (
                  <LinkButton
                    label="repo"
                    onPress={() => Linking.openURL(info.data!.repository!)}
                  />
                ) : null}
                <LinkButton
                  label="View graph"
                  onPress={() =>
                    router.push({
                      pathname: '/graph/[name]',
                      params: { name },
                    })
                  }
                />
              </View>
            </View>

            <ScoreCard score={info.data?.score ?? null} />

            <StatGrid
              items={[
                {
                  label: 'Downloads/mo',
                  value: formatCount(info.data?.downloadsLastMonth),
                },
                {
                  label: 'Install size',
                  value: formatBytes(info.data?.dist.unpackedSize),
                },
                {
                  label: 'Dependencies',
                  value: String(graph.data?.nodeCount ?? '—'),
                },
                {
                  label: 'Maintainers',
                  value: String(info.data?.maintainers.length ?? '—'),
                },
                { label: 'License', value: info.data?.license ?? '—' },
                {
                  label: 'Deprecated',
                  value: info.data?.deprecated ? 'yes' : 'no',
                },
              ]}
            />

            {categoryCounts ? (
              <View style={styles.categoryRow}>
                {CATEGORY_ORDER.map((cat) => (
                  <CategoryChip
                    key={cat}
                    category={cat}
                    count={categoryCounts[cat]}
                  />
                ))}
              </View>
            ) : null}

            {audit.data && audit.data.vulnerablePackages.length > 0 ? (
              <View style={styles.section}>
                <ThemedText type="subtitle">Vulnerabilities</ThemedText>
                <VulnList items={audit.data.vulnerablePackages} />
              </View>
            ) : null}

            <View style={styles.section}>
              <ThemedText type="subtitle">Dependencies</ThemedText>
              <DependencyList
                nodes={graph.data?.nodes ?? []}
                onSelect={(n: GraphNode) =>
                  router.push({
                    pathname: '/package/[name]',
                    params: { name: n.name },
                  })
                }
              />
            </View>
          </ScrollView>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 20,
  },
  header: {
    gap: 8,
  },
  description: {
    fontSize: 15,
    lineHeight: 21,
  },
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  linkButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  section: {
    gap: 12,
  },
});
