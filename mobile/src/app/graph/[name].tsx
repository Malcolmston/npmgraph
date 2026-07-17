import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { GraphCanvas } from '@/components/npm/graph-canvas';
import { ErrorView, Loading } from '@/components/npm/state-views';
import { useGraph } from '@/hooks/use-npm';

export default function GraphScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const graph = useGraph(name);
  const captureTarget = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const onShare = useCallback(async () => {
    if (sharing || !captureTarget.current) return;
    setSharing(true);
    try {
      // Snapshot the currently rendered viewport (not an offscreen re-render),
      // which keeps this cheap even for huge 700+ node graphs.
      const uri = await captureRef(captureTarget.current, {
        format: 'png',
        quality: 1,
      });
      if (!(await Sharing.isAvailableAsync())) {
        console.warn('[graph] sharing is unavailable on this platform');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `${name} dependency graph`,
        UTI: 'public.png',
      });
    } catch (err) {
      console.warn('[graph] failed to export graph', err);
    } finally {
      setSharing(false);
    }
  }, [sharing, name]);

  const canShare = !!graph.data;

  return (
    <View style={styles.fill}>
      <Stack.Screen
        options={{
          title: `${name} · graph`,
          headerRight: () =>
            canShare ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share graph"
                onPress={onShare}
                disabled={sharing}
                hitSlop={8}
                style={styles.headerBtn}
              >
                {sharing ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text style={styles.headerBtnText}>Share</Text>
                )}
              </Pressable>
            ) : null,
        }}
      />
      {graph.loading && !graph.data ? (
        <Loading label="Building graph…" />
      ) : graph.error ? (
        <ErrorView message={graph.error} />
      ) : graph.data ? (
        <View ref={captureTarget} collapsable={false} style={styles.fill}>
          <GraphCanvas
            graph={graph.data}
            onSelect={(node) =>
              router.push({
                pathname: '/package/[name]',
                params: { name: node.name },
              })
            }
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headerBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  headerBtnText: { color: '#4f6bed', fontSize: 16, fontWeight: '600' },
});
