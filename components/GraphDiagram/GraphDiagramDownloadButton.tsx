import { useEffect, useRef, useState } from 'react';
import { $$ } from 'select-dom';
import { getGlobalState } from '../../lib/GlobalStore.ts';
import { PARAM_SIZING } from '../../lib/constants.ts';
import { report } from '../../lib/bugsnag.ts';
import { saveCurrentGraph } from '../../lib/savedGraph.ts';
import { hashGet } from '../../lib/url_util.ts';
import { flash } from '../Flash/flash.ts';
import { CaretDownIcon, DownloadIcon } from '../Icons.tsx';
import {
  graphToCsv,
  graphToJson,
  graphToMarkdown,
  graphToMermaid,
} from './graph_export.ts';
import { composeDOT, getDiagramElement } from './graph_util.ts';
import type { GraphState } from './graph_util.ts';
import * as styles from './GraphDiagramDownloadButton.module.scss';

export default function GraphDiagramDownloadButton() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the menu on outside-click / Escape
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function run(action: () => void | Promise<void>) {
    setOpen(false);
    void Promise.resolve(action()).catch(error => {
      report.error(error instanceof Error ? error : new Error(String(error)));
      flash('Export failed');
    });
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        className={styles.toggle}
        onClick={() => {
          setOpen(o => !o);
        }}
        title="Export graph"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <DownloadIcon />
        <CaretDownIcon width={12} height={12} />
      </button>
      {open ? (
        <div className={styles.menu} role="menu">
          {MENU.map(item =>
            item === 'separator' ? (
              <hr key={`sep${MENU.indexOf(item)}`} />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  run(item.action);
                }}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

type MenuItem = { label: string; action: () => void | Promise<void> };

const MENU: (MenuItem | 'separator')[] = [
  { label: 'Download SVG', action: downloadSvg },
  { label: 'Download PNG', action: downloadPng },
  'separator',
  { label: 'Download JSON', action: downloadJson },
  { label: 'Download DOT', action: downloadDot },
  { label: 'Download Mermaid', action: downloadMermaid },
  { label: 'Download CSV', action: downloadCsv },
  { label: 'Download Markdown', action: downloadMarkdown },
  'separator',
  { label: 'Copy SVG', action: copySvgToClipboard },
  { label: 'Copy PNG', action: copyPngToClipboard },
  { label: 'Copy JSON', action: copyJsonToClipboard },
  { label: 'Copy DOT', action: copyDotToClipboard },
  { label: 'Copy Mermaid', action: copyMermaidToClipboard },
  'separator',
  { label: 'Save & copy link', action: saveAndCopyLink },
];

// --- Graph data helpers ---------------------------------------------------

function getGraph(): GraphState | undefined {
  const graph = getGlobalState('graph');
  return graph?.moduleInfos.size ? graph : undefined;
}

function getDot(graph: GraphState) {
  return composeDOT({ graph, sizing: hashGet(PARAM_SIZING) !== null });
}

// --- SVG / PNG rendering --------------------------------------------------

/** Build a fully self-contained SVG string (fonts + app styles inlined). */
function buildSvgString(): string | undefined {
  const svg = getDiagramElement()?.cloneNode(true) as SVGSVGElement | undefined;
  if (!svg) return;

  // Strip the interactive pan/zoom transform from the export. The diagram SVG
  // is parsed as image/svg+xml and has no `.style` IDL property, so the transform
  // lives in the `style` attribute — remove it directly.
  svg.removeAttribute('style');

  // Add link(s) to font files
  for (const link of $$('link[rel="stylesheet"]')) {
    if (!link.href.includes('fonts.googleapis.com')) continue;
    const fontElement = document.createElement('defs');
    fontElement.innerHTML = `<defs><style type="text/css">@import url('${link.href}');</style></defs>`;
    svg.insertBefore(fontElement, svg.firstChild);
  }

  // Inline every same-origin app stylesheet (e.g. /graph.<hash>.css) as an
  // inline <style>. The built stylesheet is served under a hashed filename, so
  // match on same-origin href rather than a fixed path. Skip the Google Fonts
  // sheet, which is already handled above.
  for (const link of $$('link[rel="stylesheet"]')) {
    if (link.href.includes('fonts.googleapis.com')) continue;
    const href = link.getAttribute('href') ?? '';
    const isSameOrigin =
      href.startsWith('/') || href.startsWith(location.origin);
    if (!isSameOrigin) continue;
    const styleElement = cloneStyleElementFromSheet(link.sheet);
    if (styleElement) svg.append(styleElement);
  }

  return new XMLSerializer().serializeToString(svg);
}

/** Rasterize the current diagram to a PNG blob. */
async function buildPngBlob(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const svg = getDiagramElement();
    if (!svg) {
      reject(new Error('No graph to export'));
      return;
    }

    const data = buildSvgString() ?? svg.outerHTML;
    const vb = svg.getAttribute('viewBox')?.split(' ');
    if (!vb) {
      reject(new Error('No viewBox'));
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Number(vb[2]);
    canvas.height = Number(vb[3]);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('No 2d context'));
      return;
    }

    const img = new Image();
    const svgBlob = new Blob([data], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);

    img.addEventListener('load', () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('PNG encoding failed'));
      }, 'image/png');
    });
    img.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG image failed to load'));
    });
    img.src = url;
  });
}

function cloneStyleElementFromSheet(sheet: StyleSheet | null) {
  if (!sheet) return null;
  const cssSheet = sheet as CSSStyleSheet;
  const styleElement = document.createElement('style');
  try {
    const cssText = [...cssSheet.cssRules]
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- Still works
      .filter(rule => rule.type !== CSSRule.MEDIA_RULE)
      .map(rule => rule.cssText)
      .join('\n');
    styleElement.textContent = cssText;
    return styleElement;
  } catch (error) {
    report.error(error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

// --- Download actions -----------------------------------------------------

function downloadName(extension: string) {
  const name = document.title.replace(/.*- /v, '').replaceAll(/\W+/gv, '_');
  return `${name}_dependencies.${extension}`;
}

function triggerDownload(blob: Blob, extension: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = downloadName(extension);
  link.click();
  // Give the browser a tick to start the download before revoking
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function downloadSvg() {
  const data = buildSvgString();
  if (!data) return;
  triggerDownload(
    new Blob([data], { type: 'image/svg+xml;charset=utf-8' }),
    'svg',
  );
}

async function downloadPng() {
  triggerDownload(await buildPngBlob(), 'png');
}

function downloadJson() {
  const graph = getGraph();
  if (!graph) {
    flash('No graph to export');
    return;
  }
  const data = JSON.stringify(graphToJson(graph), null, 2);
  triggerDownload(new Blob([data], { type: 'application/json' }), 'json');
}

function downloadDot() {
  const graph = getGraph();
  if (!graph) {
    flash('No graph to export');
    return;
  }
  triggerDownload(
    new Blob([getDot(graph)], { type: 'text/vnd.graphviz' }),
    'dot',
  );
}

/** Download a text-format export built from the current graph. */
function downloadGraphText(
  build: (graph: GraphState) => string,
  extension: string,
  mime: string,
) {
  const graph = getGraph();
  if (!graph) {
    flash('No graph to export');
    return;
  }
  triggerDownload(new Blob([build(graph)], { type: mime }), extension);
}

function downloadMermaid() {
  downloadGraphText(graphToMermaid, 'mmd', 'text/vnd.mermaid');
}

function downloadCsv() {
  downloadGraphText(graphToCsv, 'csv', 'text/csv');
}

function downloadMarkdown() {
  downloadGraphText(graphToMarkdown, 'md', 'text/markdown');
}

// --- Clipboard actions ----------------------------------------------------

async function copyText(text: string, label: string) {
  await navigator.clipboard.writeText(text);
  flash(`Copied ${label} to clipboard`);
}

async function copySvgToClipboard() {
  const data = buildSvgString();
  if (!data) {
    flash('No graph to export');
    return;
  }
  await copyText(data, 'SVG');
}

async function copyJsonToClipboard() {
  const graph = getGraph();
  if (!graph) {
    flash('No graph to export');
    return;
  }
  await copyText(JSON.stringify(graphToJson(graph), null, 2), 'JSON');
}

async function copyDotToClipboard() {
  const graph = getGraph();
  if (!graph) {
    flash('No graph to export');
    return;
  }
  await copyText(getDot(graph), 'DOT');
}

async function copyMermaidToClipboard() {
  const graph = getGraph();
  if (!graph) {
    flash('No graph to export');
    return;
  }
  await copyText(graphToMermaid(graph), 'Mermaid');
}

// --- Save / share ---------------------------------------------------------

async function saveAndCopyLink() {
  if (!getGraph()) {
    flash('No graph to save');
    return;
  }
  const link = await saveCurrentGraph();
  await navigator.clipboard.writeText(link);
  flash('Saved — shareable link copied to clipboard');
}

async function copyPngToClipboard() {
  if (typeof ClipboardItem === 'undefined') {
    flash('Image clipboard not supported in this browser');
    return;
  }
  const blob = await buildPngBlob();
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  flash('Copied PNG to clipboard');
}
