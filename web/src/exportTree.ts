import type { LayoutResult } from './layout';
import type { Direction, Person } from './types';
import { escapeXml, lifeSpan } from './utils';

const C = {
  bg: '#ffffff',
  card: '#fffdf9',
  border: '#eadfd2',
  text: '#4a3f35',
  muted: '#8a7b6e',
  primary: '#b08968',
  male: '#5b8fb0',
  female: '#d98ba0',
  font: "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif",
};

export interface ExportOptions {
  title?: string;
  direction: Direction;
  padding?: number;
  avatars?: Map<string, string>;
}

function genderColor(person: Person): string {
  if (person.gender === 'male') return C.male;
  if (person.gender === 'female') return C.female;
  return C.muted;
}

export function buildSvg(
  layout: LayoutResult,
  persons: Map<string, Person>,
  opts: ExportOptions,
): string {
  const pad = opts.padding ?? 40;
  const titleHeight = opts.title ? 56 : 0;
  const width = Math.ceil(layout.width + pad * 2);
  const height = Math.ceil(layout.height + pad * 2 + titleHeight);
  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  parts.push(`<rect width="100%" height="100%" fill="${C.bg}"/>`);
  if (opts.title) {
    parts.push(
      `<text x="${pad}" y="${pad + 8}" font-family="${C.font}" font-size="22" fill="${C.text}">${escapeXml(opts.title)}</text>`,
    );
  }

  const offsetY = pad + titleHeight;
  const shift = (v: number) => v + pad;

  for (const e of layout.edges) {
    const s = nodeById.get(e.source);
    const t = nodeById.get(e.target);
    if (!s || !t) continue;
    const x1 = shift(s.x + s.width / 2);
    const y1 = offsetY + s.y + (opts.direction === 'TB' ? s.height : s.height / 2);
    const x2 = shift(t.x + t.width / 2);
    const y2 = offsetY + t.y + (opts.direction === 'TB' ? 0 : t.height / 2);
    let d: string;
    if (opts.direction === 'TB') {
      const mid = (y1 + y2) / 2;
      d = `M ${x1} ${y1} L ${x1} ${mid} L ${x2} ${mid} L ${x2} ${y2}`;
    } else {
      const mid = (x1 + x2) / 2;
      d = `M ${x1} ${y1} L ${mid} ${y1} L ${mid} ${y2} L ${x2} ${y2}`;
    }
    parts.push(
      `<path d="${d}" fill="none" stroke="${e.kind === 'spouse' ? C.primary : C.border}" stroke-width="${e.kind === 'spouse' ? 2 : 1.5}"/>`,
    );
  }

  for (const n of layout.nodes) {
    const x = shift(n.x);
    const y = offsetY + n.y;
    if (n.kind === 'union') {
      parts.push(`<circle cx="${x + n.width / 2}" cy="${y + n.height / 2}" r="3.5" fill="${C.primary}"/>`);
      continue;
    }
    const person = persons.get(n.personId!);
    if (!person) continue;
    parts.push(`<rect x="${x}" y="${y}" width="${n.width}" height="${n.height}" rx="12" fill="${C.card}" stroke="${C.border}"/>`);
    const cx = x + 30;
    const cy = y + n.height / 2;
    const avatar = opts.avatars?.get(person.id);
    if (avatar) {
      parts.push(`<clipPath id="clip-${person.id}"><circle cx="${cx}" cy="${cy}" r="20"/></clipPath>`);
      parts.push(
        `<image x="${cx - 20}" y="${cy - 20}" width="40" height="40" href="${avatar}" clip-path="url(#clip-${person.id})" preserveAspectRatio="xMidYMid slice"/>`,
      );
    } else {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="20" fill="${genderColor(person)}"/>`);
      parts.push(
        `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="${C.font}" font-size="14" fill="#ffffff">${escapeXml(
          person.name.slice(-2),
        )}</text>`,
      );
    }
    parts.push(
      `<text x="${x + 58}" y="${y + 32}" font-family="${C.font}" font-size="15" fill="${C.text}">${escapeXml(person.name)}</text>`,
    );
    const span = lifeSpan(person) || '生卒不详';
    parts.push(
      `<text x="${x + 58}" y="${y + 52}" font-family="${C.font}" font-size="12" fill="${C.muted}">${escapeXml(span)}</text>`,
    );
  }

  parts.push('</svg>');
  return parts.join('\n');
}

async function fetchAvatar(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function collectAvatars(persons: Person[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const jobs = persons.filter((p) => p.avatar).map(async (p) => {
    const data = await fetchAvatar(p.avatar!);
    if (data) result.set(p.id, data);
  });
  await Promise.all(jobs);
  return result;
}

export async function svgToPngBlob(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  const img = new Image();
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('图片渲染失败'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('导出失败'))), 'image/png');
  });
}

export function printTree(layout: LayoutResult, zoom: number): void {
  const root = document.documentElement;
  root.style.setProperty('--print-w', `${Math.ceil(layout.width + 80)}px`);
  root.style.setProperty('--print-h', `${Math.ceil(layout.height + 80)}px`);
  root.style.setProperty('--print-zoom', String(zoom));
  window.setTimeout(() => window.print(), 60);
}
