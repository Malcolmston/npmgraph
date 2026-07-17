import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SearchBar } from '@/components/npm/search-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const EXAMPLES = ['expo', 'next', 'express', 'sequelize', '@mstone6969/prorm'];

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const graph = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    router.push({ pathname: '/package/[name]', params: { name: trimmed } });
  };

  const go = () => graph(query);

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>
            <ThemedView style={styles.header}>
              <ThemedText type="title" style={styles.title}>
                npmgraph
              </ThemedText>
              <ThemedText style={styles.subtitle} themeColor="textSecondary">
                Explore the dependency graph of any npm package.
              </ThemedText>
            </ThemedView>

            <SearchBar value={query} onChangeText={setQuery} onSubmit={go} />

            <View style={styles.examples}>
              {EXAMPLES.map((name) => (
                <Pressable
                  key={name}
                  onPress={() => graph(name)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <ThemedText type="small">{name}</ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.four,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  examples: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
  },
});
