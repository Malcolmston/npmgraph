import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function ExploreScreen() {
  const theme = useTheme();
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title">About</ThemedText>
        <ThemedText style={styles.p}>
          npmgraph explores the dependency graph of any npm package — its quality
          score, downloads, install size, maintainers, and known vulnerabilities.
          Search a package on the Home tab to get started.
        </ThemedText>
        <ThemedText type="subtitle" style={styles.h}>
          Risk categories
        </ThemedText>
        <ThemedText style={styles.p}>
          Packages are color-coded as Direct, Transitive, Deprecated, or
          Vulnerable so risk reads at a glance. Open any package and tap
          “View graph” to explore its full dependency graph — rendered right
          here on your device.
        </ThemedText>
        <ThemedText style={[styles.small, { color: theme.textSecondary }]}>
          Data via the npmgraph API · graphs cached in Neo4j.
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  h: { marginTop: Spacing.two },
  p: { lineHeight: 22 },
  link: { padding: Spacing.three, borderRadius: 12 },
  pressed: { opacity: 0.6 },
  small: { fontSize: 12, marginTop: Spacing.two },
});
