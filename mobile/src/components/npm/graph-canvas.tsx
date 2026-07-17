import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { categoryColor, categoryLabel, categoryOf } from '@/lib/format';
import type { DependencyGraph, GraphNode, NodeCategory } from '@/lib/types';

const LEGEND: NodeCategory[] = ['root', 'transitive', 'deprecated', 'vulnerable'];

const COL = 170; // horizontal gap per dependency level
const ROW = 28; // vertical gap per node within a level
const PAD = 28;
const R = 7; // node radius
const LABEL_LIMIT = 140; // above this, draw dots only (labels get too dense)

type Placed = { node: GraphNode; x: number; y: number; color: string };

function layout(graph: DependencyGraph) {
  const byLevel = new Map<number, GraphNode[]>();
  for (const node of graph.nodes) {
    const list = byLevel.get(node.level) ?? [];
    list.push(node);
    byLevel.set(node.level, list);
  }
  const placed = new Map<string, Placed>();
  let maxCount = 0;
  for (const [level, list] of byLevel) {
    list.sort((a, b) => a.name.localeCompare(b.name));
    maxCount = Math.max(maxCount, list.length);
    list.forEach((node, i) => {
      placed.set(node.key, {
        node,
        x: PAD + level * COL,
        y: PAD + i * ROW,
        color: categoryColor(categoryOf(node)),
      });
    });
  }
  const maxLevel = Math.max(0, ...[...byLevel.keys()]);
  return {
    placed,
    width: PAD * 2 + maxLevel * COL + 120,
    height: PAD * 2 + maxCount * ROW,
  };
}

export function GraphCanvas(props: {
  graph: DependencyGraph;
  onSelect?: (node: GraphNode) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const edgeColor = scheme === 'dark' ? '#3a3f4a' : '#c9ced8';
  const labelColor = scheme === 'dark' ? '#c7ccd6' : '#3a3f4a';
  const showLabels = props.graph.nodes.length <= LABEL_LIMIT;

  const { placed, width, height } = useMemo(
    () => layout(props.graph),
    [props.graph],
  );
  const [view, setView] = useState({ w: 0, h: 0 });

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);

  // Fit the content into the viewport once we know both sizes. The wrapper View
  // scales about its own centre, so centring only needs the unscaled delta
  // (independent of s) — the scale then shrinks symmetrically around it.
  const fit = useMemo(() => {
    if (!view.w || !view.h) return null;
    const s = Math.min(view.w / width, view.h / height, 1) * 0.9 || 1;
    return { s, x: (view.w - width) / 2, y: (view.h - height) / 2 };
  }, [view, width, height]);
  if (fit && startScale.value === 1 && tx.value === 0 && ty.value === 0) {
    scale.value = fit.s;
    tx.value = fit.x;
    ty.value = fit.y;
    startScale.value = fit.s;
    startTx.value = fit.x;
    startTy.value = fit.y;
  }

  // Pan/pinch drive an Animated.View that wraps the full-size SVG. Animating a
  // real View transform on the UI thread is reliable on every platform, unlike
  // animating react-native-svg's inner <G> transform (which silently no-ops on
  // the new architecture).
  const pan = Gesture.Pan()
    .minDistance(4) // let quick taps fall through to node onPress
    .onUpdate((e) => {
      tx.value = startTx.value + e.translationX;
      ty.value = startTy.value + e.translationY;
    })
    .onEnd(() => {
      startTx.value = tx.value;
      startTy.value = ty.value;
    });
  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(8, Math.max(0.05, startScale.value * e.scale));
    })
    .onEnd(() => {
      startScale.value = scale.value;
    });
  const gesture = Gesture.Simultaneous(pan, pinch);

  const canvasStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  const edges = props.graph.edges;

  // Only key the categories that actually appear in this graph.
  const present = useMemo(() => {
    const set = new Set<NodeCategory>();
    for (const node of props.graph.nodes) set.add(categoryOf(node));
    return LEGEND.filter((c) => set.has(c));
  }, [props.graph]);

  const panelBg = scheme === 'dark' ? 'rgba(28,30,36,0.92)' : 'rgba(255,255,255,0.94)';
  const panelBorder = scheme === 'dark' ? '#3a3f4a' : '#e2e5ea';

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.fill}
        onLayout={(e) =>
          setView({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
        }
      >
        <Animated.View style={[styles.canvas, { width, height }, canvasStyle]}>
          <Svg width={width} height={height}>
            {edges.map((edge, i) => {
              const a = placed.get(edge.from);
              const b = placed.get(edge.to);
              if (!a || !b) return null;
              return (
                <Line
                  key={`e${i}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={edgeColor}
                  strokeWidth={0.75}
                />
              );
            })}
            {[...placed.values()].map((p) => (
              <G key={p.node.key} onPress={() => props.onSelect?.(p.node)}>
                <Circle
                  cx={p.x}
                  cy={p.y}
                  r={p.node.level === 0 ? R + 2 : R}
                  fill={p.color}
                  stroke={p.node.level === 0 ? '#4f6bed' : 'rgba(0,0,0,0.15)'}
                  strokeWidth={p.node.level === 0 ? 2 : 1}
                />
                {showLabels ? (
                  <SvgText
                    x={p.x + R + 4}
                    y={p.y + 4}
                    fontSize={11}
                    fill={labelColor}
                  >
                    {p.node.key}
                  </SvgText>
                ) : null}
              </G>
            ))}
          </Svg>
        </Animated.View>

        <View
          style={[styles.legend, { backgroundColor: panelBg, borderColor: panelBorder }]}
          pointerEvents="none"
        >
          {present.map((cat) => (
            <View key={cat} style={styles.legendRow}>
              <View style={[styles.swatch, { backgroundColor: categoryColor(cat) }]} />
              <Text style={[styles.legendText, { color: labelColor }]}>
                {categoryLabel(cat)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  canvas: { position: 'absolute', top: 0, left: 0 },
  legend: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 12, fontWeight: '500' },
});
