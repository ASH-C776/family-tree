import { useMemo, useState } from 'react';
import type { Gender, Person } from '../types';
import type { RelationMode } from './PersonDrawer';

interface Props {
  mode: RelationMode;
  personName: string;
  persons: Person[];
  excludeIds: string[];
  busy: boolean;
  onClose: () => void;
  onCreate: (name: string, gender: Gender) => void;
  onPick: (id: string) => void;
}

const TITLE: Record<RelationMode, string> = {
  spouse: '添加配偶',
  child: '添加子女',
  parent: '添加父母',
};

export function AddRelationDialog({ mode, personName, persons, excludeIds, busy, onClose, onCreate, onPick }: Props) {
  const [tab, setTab] = useState<'new' | 'pick'>('new');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('unknown');
  const [keyword, setKeyword] = useState('');
  const [picked, setPicked] = useState('');

  const candidates = useMemo(() => {
    const excluded = new Set(excludeIds);
    const kw = keyword.trim();
    return persons
      .filter((p) => !excluded.has(p.id))
      .filter((p) => (kw ? p.name.includes(kw) : true))
      .slice(0, 50);
  }, [persons, excludeIds, keyword]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          {TITLE[mode]} · {personName}
        </header>
        <div className="body">
          <div className="row" style={{ marginBottom: 12 }}>
            <button className={tab === 'new' ? 'primary' : ''} onClick={() => setTab('new')}>
              新建成员
            </button>
            <button className={tab === 'pick' ? 'primary' : ''} onClick={() => setTab('pick')}>
              从已有成员选
            </button>
          </div>
          {tab === 'new' ? (
            <>
              <label className="field">
                <span>姓名</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="必填" autoFocus />
              </label>
              <label className="field">
                <span>性别</span>
                <select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
                  <option value="unknown">不详</option>
                  <option value="male">男</option>
                  <option value="female">女</option>
                  <option value="other">其他</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索姓名"
                style={{ marginBottom: 8 }}
              />
              <select size={10} value={picked} onChange={(e) => setPicked(e.target.value)} style={{ width: '100%' }}>
                {candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <footer>
          <button onClick={onClose}>取消</button>
          {tab === 'new' ? (
            <button className="primary" disabled={busy || !name.trim()} onClick={() => onCreate(name.trim(), gender)}>
              {busy ? '处理中…' : '创建并关联'}
            </button>
          ) : (
            <button className="primary" disabled={busy || !picked} onClick={() => onPick(picked)}>
              {busy ? '处理中…' : '关联'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
