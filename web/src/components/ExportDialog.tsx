import { useState } from 'react';
import type { LayoutResult } from '../layout';
import { buildSvg, collectAvatars, printTree, svgToPngBlob } from '../exportTree';
import { downloadBlob } from '../utils';
import type { Direction, Person } from '../types';

interface Props {
  layout: LayoutResult;
  persons: Person[];
  direction: Direction;
  onClose: () => void;
}

const A4_WIDTH = 1049;
const A4_HEIGHT = 719;

export function ExportDialog({ layout, persons, direction, onClose }: Props) {
  const [title, setTitle] = useState('家谱');
  const [zoomMode, setZoomMode] = useState<'fit' | '100' | '75' | '50'>('fit');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const visibleIds = new Set(layout.nodes.filter((n) => n.personId).map((n) => n.personId!));
  const visiblePersons = persons.filter((p) => visibleIds.has(p.id));
  const personsById = new Map(persons.map((p) => [p.id, p]));

  async function buildCurrentSvg(): Promise<{ svg: string; width: number; height: number }> {
    const avatars = await collectAvatars(visiblePersons);
    const svg = buildSvg(layout, personsById, { title, direction, avatars });
    return { svg, width: layout.width + 80, height: layout.height + (title ? 136 : 80) };
  }

  async function exportSvg() {
    setBusy('svg');
    setError('');
    try {
      const { svg } = await buildCurrentSvg();
      downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${title || '家谱'}.svg`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function exportPng() {
    setBusy('png');
    setError('');
    try {
      const { svg, width, height } = await buildCurrentSvg();
      const blob = await svgToPngBlob(svg, width, height, 2);
      downloadBlob(blob, `${title || '家谱'}.png`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  function doPrint() {
    const zoom =
      zoomMode === 'fit'
        ? Math.min(1, A4_WIDTH / Math.max(1, layout.width), A4_HEIGHT / Math.max(1, layout.height))
        : Number(zoomMode) / 100;
    printTree(layout, Number(zoom.toFixed(2)));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>导出家谱</header>
        <div className="body">
          <label className="field">
            <span>标题（图片 / PDF 顶部显示）</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <p className="hint">
            当前导出范围：树状图上可见的 {visiblePersons.length} 人（折叠的支系不会导出）。
          </p>
          <div className="section-title">打印 / 另存为 PDF</div>
          <div className="row">
            <select value={zoomMode} onChange={(e) => setZoomMode(e.target.value as typeof zoomMode)} style={{ width: 160 }}>
              <option value="fit">自适应一页</option>
              <option value="100">原始大小（可能多页）</option>
              <option value="75">75%</option>
              <option value="50">50%</option>
            </select>
            <button onClick={doPrint}>打印 / 存为 PDF</button>
          </div>
          <p className="hint">在打印对话框里选择「另存为 PDF」，纸张建议 A4 横向。</p>
        </div>
        <footer>
          <button onClick={onClose}>关闭</button>
          <button disabled={!!busy} onClick={exportSvg}>
            {busy === 'svg' ? '导出中…' : '导出 SVG'}
          </button>
          <button className="primary" disabled={!!busy} onClick={exportPng}>
            {busy === 'png' ? '导出中…' : '导出 PNG'}
          </button>
        </footer>
        <div style={{ padding: '0 18px 12px' }}>
          <div className="error">{error}</div>
        </div>
      </div>
    </div>
  );
}
