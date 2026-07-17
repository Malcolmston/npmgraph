import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { scorePct } from '@/lib/format';
import type { PackageScore } from '@/lib/types';

const Tint = { light: '#3c87f7', dark: '#5c9dff' } as const;

type BarProps = { label: string; value: number; tint: string; track: string };

function Bar({ label, value, tint, track }: BarProps): React.JSX.Element {
  const clamped = Math.max(0, Math.min(1, value));
  const pct = Math.round(clamped * 100);

  return (
    <View style={styles.barRow}>
      <View style={styles.barHeader}>
        <ThemedText type="small">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{`${pct}%`}</ThemedText>
      </View>
      <View style={[styles.track, { backgroundColor: track }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: tint }]} />
      </View>
    </View>
  );
}

export function ScoreCard(props: { score: PackageScore | null }): React.JSX.Element | null {
  const { score } = props;
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';

  if (!score) return null;

  const tint = Tint[mode];
  const track = Colors[mode].backgroundSelected;
  const overall = scorePct(score);

  const bars: { label: string; value: number }[] = [];
  if (typeof score.quality === 'number') bars.push({ label: 'Quality', value: score.quality });
  if (typeof score.popularity === 'number')
    bars.push({ label: 'Popularity', value: score.popularity });
  if (typeof score.maintenance === 'number')
    bars.push({ label: 'Maintenance', value: score.maintenance });

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.header}>
        <ThemedText type="title">{`${overall ?? '—'}`}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.outOf}>
          /100
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {score.source}
      </ThemedText>

      {bars.length > 0 && (
        <View style={styles.bars}>
          {bars.map((bar) => (
            <Bar key={bar.label} label={bar.label} value={bar.value} tint={tint} track={track} />
          ))}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  outOf: {
    marginBottom: Spacing.one,
  },
  bars: {
    marginTop: Spacing.two,
    gap: Spacing.three,
  },
  barRow: {
    gap: Spacing.two,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  track: {
    height: Spacing.two,
    borderRadius: Spacing.one,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Spacing.one,
  },
});
