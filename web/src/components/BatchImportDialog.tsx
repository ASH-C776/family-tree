import { useState } from 'react';
import type { Gender, Person } from '../types';

interface Props {
  existing: Person[];
  onClose: () => void;
  onImport: (rows: ParsedRow[]) => Promise<void>;
}

export interface ParsedRow {
  name: string;
  gender: Gender;
  birthDate: string | null;
  birthPrecision: 'day' | 'month' | 'year' | null;
  deathDate: string | null;
  deathPrecision: 'day' | 'month' | 'year' | null;
  isAlive: boolean;
  spouseName: string | null;
  parentNames: string[];
}

const SAMPLE = `张建国,男,1948-05-12,,李秀英,
李秀英,女,1950,,张建国,
张伟,男,1975-03-02,,王芳,张建国/李秀英
王芳,女,1978,,张伟,`;

function parseDate(raw: string): { date: string | null; precision: 'day' | 'month' | 'year' | null } {
  const value = raw.trim();
  if (!value) return { date: null, precision: null };
  if (/^\d{4}$/.test(value)) return { date: `${value}-01-01`, precision: 'year' };
  if (/^\d{4}-\d{2}$/.test(value)) return { date: `${value}-01`, precision: 'month' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { date: value, precision: 'day' };
  return { date: null, precision: null };
}

export function parseRows(text: string): ParsedRow[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const cells = line.split(',').map((c) => c.trim());
      const birth = parseDate(cells[2] ?? '');
      const death = parseDate(cells[3] ?? '');
      return {
        name: cells[0] ?? '',
        gender: cells[1] === '男' ? 'male' : cells[1] === '女' ? 'female' : ('unknown' as Gender),
        birthDate: birth.date,
        birthPrecision: birth.precision,
        deathDate: death.date,
        deathPrecision: death.precision,
        isAlive: !death.date,
        spouseName: cells[4] || null,
        parentNames: (cells[5] ?? '')
          .split('/')
          .map((s) => s.trim())
          .filter(Boolean),
      };
    })
    .filter((r) => r.name);
}

export function BatchImportDialog({ existing, onClose, onImport }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const rows = text.trim() ? parseRows(text) : [];
  const dupNames = rows
    .map((r) => r.name)
    .filter((name) => existing.some((p) => p.name === name));

  async function run() {
    if (!rows.length) {
      setError('没有解析到任何记录');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onImport(rows);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
        <header>批量录入</header>
        <div className="body">
          <p className="hint">
            每行一个人，字段用英文逗号分隔：
            <br />
            姓名, 性别(男/女), 出生日期, 逝世日期, 配偶姓名, 父母姓名（多人用 / 分隔）
            <br />
            日期支持 1948 / 1948-05 / 1948-05-12。
          </p>
          <textarea
            rows={10}
            value={text}
            placeholder={SAMPLE}
            onChange={(e) => setText(e.target.value)}
            style={{ fontFamily: 'monospace', marginTop: 8 }}
          />
          <div className="section-title">解析预览：{rows.length} 人</div>
          {rows.length > 0 && (
            <ul className="rel-list">
              {rows.slice(0, 8).map((r, i) => (
                <li key={i}>
                  <span className={`dot ${r.gender}`} />
                  <span className="who">
                    {r.name}
                    {r.spouseName ? ` · 配偶 ${r.spouseName}` : ''}
                    {r.parentNames.length ? ` · 父母 ${r.parentNames.join('、')}` : ''}
                  </span>
                </li>
              ))}
              {rows.length > 8 && <li className="hint">…等共 {rows.length} 人</li>}
            </ul>
          )}
          {dupNames.length > 0 && (
            <p className="hint">注意：{dupNames.join('、')} 与已有成员同名，将复用已有记录。</p>
          )}
        </div>
        <footer>
          <button onClick={onClose}>取消</button>
          <button className="primary" disabled={busy || !rows.length} onClick={run}>
            {busy ? '导入中…' : `导入 ${rows.length} 人`}
          </button>
        </footer>
        <div style={{ padding: '0 18px 12px' }}>
          <div className="error">{error}</div>
        </div>
      </div>
    </div>
  );
}
