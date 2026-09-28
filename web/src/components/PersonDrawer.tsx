import { useMemo, useState } from 'react';
import type { DatePrecision, Gender, Media, Person, PersonPatch, Privacy, TreeData } from '../types';
import { age, lifeSpan } from '../utils';

export type RelationMode = 'spouse' | 'child' | 'parent';

interface Props {
  person: Person;
  data: TreeData;
  canEdit: boolean;
  canSetPrivacy: boolean;
  media: Media[];
  onClose: () => void;
  onSave: (patch: PersonPatch) => Promise<string | null>;
  onSelect: (id: string) => void;
  onDelete: () => void;
  onAddRelation: (mode: RelationMode) => void;
  onRemoveRelation: (unionId: string, personId: string) => void;
  onUploadAvatar: (file: File) => void;
  onAddPhoto: (file: File, privacy: Privacy) => void;
  onRemovePhoto: (id: string) => void;
}

interface FormState {
  name: string;
  gender: Gender;
  birthDate: string;
  birthPrecision: DatePrecision;
  birthCirca: boolean;
  deathDate: string;
  deathPrecision: DatePrecision;
  deathCirca: boolean;
  isAlive: boolean;
  bio: string;
  phone: string;
  address: string;
  privacy: Privacy;
}

const PRIVACY_LABELS: Record<Privacy, string> = { public: '公开', family: '家族内', private: '仅自己' };

function toForm(p: Person): FormState {
  return {
    name: p.name,
    gender: p.gender,
    birthDate: p.birthDate ?? '',
    birthPrecision: p.birthPrecision ?? 'day',
    birthCirca: p.birthCirca,
    deathDate: p.deathDate ?? '',
    deathPrecision: p.deathPrecision ?? 'day',
    deathCirca: p.deathCirca,
    isAlive: p.isAlive,
    bio: p.bio ?? '',
    phone: p.phone ?? '',
    address: p.address ?? '',
    privacy: p.privacy ?? 'public',
  };
}

function monthLabel(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export function PersonDrawer({
  person,
  data,
  canEdit,
  canSetPrivacy,
  media,
  onClose,
  onSave,
  onSelect,
  onDelete,
  onAddRelation,
  onRemoveRelation,
  onUploadAvatar,
  onAddPhoto,
  onRemovePhoto,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(() => toForm(person));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photoPrivacy, setPhotoPrivacy] = useState<Privacy>('public');
  const [photoSort, setPhotoSort] = useState<'upload' | 'time'>('upload');

  const personsById = useMemo(() => new Map(data.persons.map((p) => [p.id, p])), [data.persons]);

  const spouseUnionIds = data.members.filter((m) => m.personId === person.id && m.role === 'spouse').map((m) => m.unionId);
  const childUnionIds = data.members.filter((m) => m.personId === person.id && m.role === 'child').map((m) => m.unionId);

  const spouses = data.members
    .filter((m) => spouseUnionIds.includes(m.unionId) && m.role === 'spouse' && m.personId !== person.id)
    .map((m) => ({ personId: m.personId, unionId: m.unionId }));
  const parents = data.members
    .filter((m) => childUnionIds.includes(m.unionId) && m.role === 'spouse')
    .map((m) => ({ personId: m.personId, unionId: m.unionId }));
  const children = data.members
    .filter((m) => spouseUnionIds.includes(m.unionId) && m.role === 'child')
    .map((m) => ({ personId: m.personId, unionId: m.unionId }));

  const sortedMedia = useMemo(() => {
    if (photoSort === 'upload') return media;
    return [...media].sort((a, b) => (b.takenAt ?? b.createdAt) - (a.takenAt ?? a.createdAt));
  }, [media, photoSort]);

  const timeline = useMemo(() => {
    if (photoSort !== 'time') return null;
    const groups: { label: string; items: Media[] }[] = [];
    const index = new Map<string, number>();
    for (const m of sortedMedia) {
      const label = monthLabel(m.takenAt ?? m.createdAt);
      if (!index.has(label)) {
        index.set(label, groups.length);
        groups.push({ label, items: [] });
      }
      groups[index.get(label)!].items.push(m);
    }
    return groups;
  }, [sortedMedia, photoSort]);

  function startEdit() {
    setForm(toForm(person));
    setError('');
    setEditing(true);
  }

  async function save() {
    if (!form.name.trim()) {
      setError('姓名不能为空');
      return;
    }
    setSaving(true);
    const err = await onSave({
      name: form.name.trim(),
      gender: form.gender,
      birthDate: form.birthDate || null,
      birthPrecision: form.birthDate ? form.birthPrecision : null,
      birthCirca: form.birthCirca,
      deathDate: form.deathDate || null,
      deathPrecision: form.deathDate ? form.deathPrecision : null,
      deathCirca: form.deathCirca,
      isAlive: form.isAlive,
      bio: form.bio || null,
      phone: form.phone || null,
      address: form.address || null,
      privacy: form.privacy,
      expectedUpdatedAt: person.updatedAt,
    });
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    setEditing(false);
  }

  function relationList(items: { personId: string; unionId: string }[]) {
    if (!items.length) return <p className="hint">暂无</p>;
    return (
      <ul className="rel-list">
        {items.map((it, i) => {
          const p = personsById.get(it.personId);
          if (!p) return null;
          return (
            <li key={`${it.unionId}-${it.personId}-${i}`}>
              <span className={`dot ${p.gender}`} />
              <button className="ghost who" onClick={() => onSelect(it.personId)}>
                {p.name}
              </button>
              {canEdit && (
                <button className="ghost" title="解除关系" onClick={() => onRemoveRelation(it.unionId, it.personId)}>
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  function renderPhoto(m: Media) {
    return (
      <div className="photo" key={m.id}>
        <img src={m.thumbUrl} alt={m.caption ?? person.name} onClick={() => window.open(m.url, '_blank')} />
        {canEdit && (
          <button className="photo-del" title="移除照片" onClick={() => onRemovePhoto(m.id)}>
            ✕
          </button>
        )}
      </div>
    );
  }

  return (
    <aside className="drawer">
      <header>
        <strong>{person.name}</strong>
        <span className={`privacy-chip ${person.privacy}`}>{PRIVACY_LABELS[person.privacy]}</span>
        <span className="spacer" />
        <button className="ghost" onClick={onClose}>
          关闭
        </button>
      </header>
      <div className="body">
        {editing ? (
          <>
            <label className="field">
              <span>姓名</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              <span>性别</span>
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as Gender })}>
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="other">其他</option>
                <option value="unknown">不详</option>
              </select>
            </label>
            {canSetPrivacy ? (
              <label className="field">
                <span>可见范围</span>
                <select value={form.privacy} onChange={(e) => setForm({ ...form, privacy: e.target.value as Privacy })}>
                  <option value="public">公开（所有登录用户）</option>
                  <option value="family">家族内（仅成员）</option>
                  <option value="private">仅自己</option>
                </select>
              </label>
            ) : (
              <p className="hint">可见范围：{PRIVACY_LABELS[form.privacy]}（仅创建者或管理员可修改）</p>
            )}
            <div className="section-title">出生</div>
            <div className="row">
              <input
                type="date"
                value={form.birthDate}
                onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
              />
              <select
                value={form.birthPrecision}
                onChange={(e) => setForm({ ...form, birthPrecision: e.target.value as DatePrecision })}
                style={{ width: 92 }}
              >
                <option value="day">精确到日</option>
                <option value="month">精确到月</option>
                <option value="year">只知年份</option>
              </select>
              <label className="row" style={{ width: 'auto' }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={form.birthCirca}
                  onChange={(e) => setForm({ ...form, birthCirca: e.target.checked })}
                />
                约
              </label>
            </div>
            <div className="section-title">逝世</div>
            <div className="row">
              <input
                type="date"
                value={form.deathDate}
                disabled={form.isAlive}
                onChange={(e) => setForm({ ...form, deathDate: e.target.value })}
              />
              <select
                value={form.deathPrecision}
                disabled={form.isAlive}
                onChange={(e) => setForm({ ...form, deathPrecision: e.target.value as DatePrecision })}
                style={{ width: 92 }}
              >
                <option value="day">精确到日</option>
                <option value="month">精确到月</option>
                <option value="year">只知年份</option>
              </select>
              <label className="row" style={{ width: 'auto' }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={form.deathCirca}
                  onChange={(e) => setForm({ ...form, deathCirca: e.target.checked })}
                />
                约
              </label>
            </div>
            <label className="row" style={{ margin: '8px 0' }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.isAlive}
                onChange={(e) => setForm({ ...form, isAlive: e.target.checked })}
              />
              在世
            </label>
            <label className="field">
              <span>简介 / 生平</span>
              <textarea rows={4} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            </label>
            <label className="field">
              <span>联系方式（仅登录可见）</span>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="field">
              <span>住址</span>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
            <label className="field">
              <span>头像</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadAvatar(file);
                }}
              />
            </label>
          </>
        ) : (
          <>
            <div className="row" style={{ marginBottom: 12 }}>
              {person.avatar ? (
                <img src={person.avatar} alt={person.name} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    background: person.gender === 'male' ? 'var(--male)' : person.gender === 'female' ? 'var(--female)' : 'var(--text-muted)',
                  }}
                >
                  {person.name.slice(-2)}
                </div>
              )}
              <div>
                <div style={{ fontSize: 18 }}>
                  <span className={`dot ${person.gender}`} />
                  {person.name}
                </div>
                <div className="hint">{lifeSpan(person) || '生卒不详'}</div>
                {age(person) !== null && <div className="hint">{person.isAlive ? `现年 ${age(person)} 岁` : `享年 ${age(person)} 岁`}</div>}
              </div>
            </div>
            {person.bio && <p style={{ whiteSpace: 'pre-wrap' }}>{person.bio}</p>}
            {person.phone && <div className="hint">联系方式：{person.phone}</div>}
            {person.address && <div className="hint">住址：{person.address}</div>}

            <div className="section-title">配偶</div>
            {relationList(spouses)}
            <div className="section-title">父母</div>
            {relationList(parents)}
            <div className="section-title">子女</div>
            {relationList(children)}
          </>
        )}

        <div className="section-title">照片{media.length ? `（${media.length}）` : ''}</div>
        <div className="row photo-toolbar">
          <select
            value={photoSort}
            onChange={(e) => setPhotoSort(e.target.value as 'upload' | 'time')}
            title="排序方式"
            style={{ width: 'auto' }}
          >
            <option value="upload">上传顺序</option>
            <option value="time">按拍摄时间</option>
          </select>
          {canEdit && (
            <select
              value={photoPrivacy}
              onChange={(e) => setPhotoPrivacy(e.target.value as Privacy)}
              title="新照片可见范围"
              style={{ width: 'auto' }}
            >
              <option value="public">公开</option>
              <option value="family">家族内</option>
              <option value="private">仅自己</option>
            </select>
          )}
        </div>
        {media.length === 0 ? (
          <p className="hint">还没有照片</p>
        ) : timeline ? (
          <div className="timeline">
            {timeline.map((g) => (
              <div key={g.label} className="timeline-group">
                <div className="timeline-label">{g.label}</div>
                <div className="photo-grid">{g.items.map(renderPhoto)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="photo-grid">{sortedMedia.map(renderPhoto)}</div>
        )}
        {canEdit && (
          <label className="field" style={{ marginTop: 8 }}>
            <span>添加照片（{PRIVACY_LABELS[photoPrivacy]}）</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onAddPhoto(file, photoPrivacy);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
      <footer>
        {editing ? (
          <>
            <button className="primary" disabled={saving} onClick={save}>
              {saving ? '保存中…' : '保存'}
            </button>
            <button onClick={() => setEditing(false)}>取消</button>
          </>
        ) : (
          <>
            {canEdit && <button className="primary" onClick={startEdit}>编辑</button>}
            {canEdit && <button onClick={() => onAddRelation('spouse')}>加配偶</button>}
            {canEdit && <button onClick={() => onAddRelation('child')}>加子女</button>}
            {canEdit && <button onClick={() => onAddRelation('parent')}>加父母</button>}
            {canEdit && <button className="danger" onClick={onDelete}>删除</button>}
          </>
        )}
      </footer>
      <div style={{ padding: '0 16px 12px' }}>
        <div className="error">{error}</div>
      </div>
    </aside>
  );
}
