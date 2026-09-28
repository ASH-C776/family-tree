import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import exifr from 'exifr';
import { ApiError, api, getToken, setToken } from './api';
import type { AuthUser, Direction, Gender, Media, Person, PersonPatch, Privacy, TreeData } from './types';
import type { LayoutResult } from './layout';
import { Login } from './components/Login';
import { TreeCanvas } from './components/TreeCanvas';
import { PersonDrawer, type RelationMode } from './components/PersonDrawer';
import { AddRelationDialog } from './components/AddRelationDialog';
import { NewPersonDialog } from './components/NewPersonDialog';
import { BatchImportDialog, type ParsedRow } from './components/BatchImportDialog';
import { ExportDialog } from './components/ExportDialog';
import { AdminDialog } from './components/AdminDialog';
import { compressImage } from './utils';

const FONT_SIZES = [14, 16, 18, 21];
type FontLevel = 0 | 1 | 2 | 3;
const FONT_LABELS = ['标准', '大', '特大', '超大'];

const EMPTY: TreeData = { persons: [], unions: [], members: [] };

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(() => !!getToken());
  const [data, setData] = useState<TreeData>(EMPTY);
  const [direction, setDirection] = useState<Direction>('TB');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('ft_collapsed');
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('ft_theme') as 'light' | 'dark') ?? 'light');
  const [fontLevel, setFontLevel] = useState<FontLevel>(() => {
    const v = Number(localStorage.getItem('ft_fontlevel'));
    return ([0, 1, 2, 3].includes(v) ? v : 0) as FontLevel;
  });
  const [dialog, setDialog] = useState<'none' | 'export' | 'batch' | 'trash' | 'account' | 'new' | 'admin'>('none');
  const [media, setMedia] = useState<Media[]>([]);
  const [relation, setRelation] = useState<RelationMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const canEdit = !!user && (user.role === 'admin' || user.role === 'editor');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ft_theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--base-font', `${FONT_SIZES[fontLevel]}px`);
    document.body.classList.toggle('large-ui', fontLevel >= 2);
    localStorage.setItem('ft_fontlevel', String(fontLevel));
  }, [fontLevel]);

  useEffect(() => {
    const handler = () => {
      setToken('');
      setUser(null);
      setChecking(false);
    };
    window.addEventListener('ft:unauthorized', handler);
    return () => window.removeEventListener('ft:unauthorized', handler);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    api
      .me()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  const refresh = useCallback(async () => {
    setData(await api.tree());
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMedia([]);
      return;
    }
    api
      .personMedia(selectedId)
      .then((res) => setMedia(res.media))
      .catch(() => setMedia([]));
  }, [selectedId]);

  useEffect(() => {
    if (user) refresh().catch(() => undefined);
  }, [user, refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const personsById = useMemo(() => new Map(data.persons.map((p) => [p.id, p])), [data.persons]);
  const selected = selectedId ? personsById.get(selectedId) ?? null : null;

  const matches = useMemo(() => {
    const kw = keyword.trim();
    if (!kw) return [];
    return data.persons.filter((p) => p.name.includes(kw)).slice(0, 20);
  }, [keyword, data.persons]);

  const dimIds = useMemo(() => (keyword.trim() ? new Set(matches.map((p) => p.id)) : null), [keyword, matches]);

  const onLayout = useCallback((result: LayoutResult) => setLayout(result), []);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem('ft_collapsed', JSON.stringify([...next]));
      } catch {
        /* localStorage 不可用时忽略 */
      }
      return next;
    });
  }, []);

  async function guard(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  async function savePerson(patch: PersonPatch): Promise<string | null> {
    if (!selected) return null;
    try {
      await api.updatePerson(selected.id, patch);
      await refresh();
      return null;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await refresh();
        return err.message;
      }
      return (err as Error).message;
    }
  }

  async function createPersonNow(name: string, gender: Gender): Promise<Person> {
    const res = await api.createPerson({ name, gender });
    await refresh();
    return res.person;
  }

  async function handleAddRelation(mode: RelationMode, payload: { name?: string; gender?: Gender; existingId?: string }) {
    if (!selected) return;
    await guard(async () => {
      let targetId = payload.existingId;
      if (!targetId) {
        const person = await createPersonNow(payload.name!, payload.gender ?? 'unknown');
        targetId = person.id;
      }
      const spouseUnionIds = data.members.filter((m) => m.personId === selected.id && m.role === 'spouse').map((m) => m.unionId);

      if (mode === 'spouse') {
        const lonely = spouseUnionIds.find(
          (uid) => data.members.filter((m) => m.unionId === uid && m.role === 'spouse').length === 1,
        );
        if (lonely) {
          const spouses = data.members.filter((m) => m.unionId === lonely && m.role === 'spouse').map((m) => m.personId);
          await api.updateUnion(lonely, { spouseIds: [...spouses, targetId!] });
        } else {
          await api.createUnion({ spouseIds: [selected.id, targetId!] });
        }
      } else if (mode === 'child') {
        let unionId = spouseUnionIds[0];
        if (!unionId) {
          const created = await api.createUnion({ spouseIds: [selected.id] });
          unionId = created.union.id;
        }
        const children = data.members.filter((m) => m.unionId === unionId && m.role === 'child').map((m) => m.personId);
        await api.updateUnion(unionId, { childIds: [...children, targetId!] });
      } else {
        const parentUnionIds = data.members.filter((m) => m.personId === selected.id && m.role === 'child').map((m) => m.unionId);
        if (parentUnionIds.length) {
          const uid = parentUnionIds[0];
          const spouses = data.members.filter((m) => m.unionId === uid && m.role === 'spouse').map((m) => m.personId);
          await api.updateUnion(uid, { spouseIds: [...spouses, targetId!] });
        } else {
          await api.createUnion({ spouseIds: [targetId!], childIds: [selected.id] });
        }
      }
      await refresh();
      setRelation(null);
    });
  }

  async function removeRelation(unionId: string, personId: string) {
    await guard(async () => {
      const spouses = data.members.filter((m) => m.unionId === unionId && m.role === 'spouse').map((m) => m.personId);
      const children = data.members.filter((m) => m.unionId === unionId && m.role === 'child').map((m) => m.personId);
      const nextSpouses = spouses.filter((id) => id !== personId);
      const nextChildren = children.filter((id) => id !== personId);
      if (!nextSpouses.length && !nextChildren.length) {
        await api.deleteUnion(unionId);
      } else {
        await api.updateUnion(unionId, { spouseIds: nextSpouses, childIds: nextChildren });
      }
      await refresh();
    });
  }

  async function deleteSelected() {
    if (!selected) return;
    if (!window.confirm(`确定把「${selected.name}」移入回收站吗？关系会保留，可随时恢复。`)) return;
    await guard(async () => {
      await api.deletePerson(selected.id);
      setSelectedId(null);
      await refresh();
      setToast('已移入回收站');
    });
  }

  async function uploadAvatar(file: File) {
    if (!selected) return;
    await guard(async () => {
      const blob = await compressImage(file, 512);
      const { url } = await api.upload(blob);
      await api.updatePerson(selected.id, { avatar: url, expectedUpdatedAt: selected.updatedAt });
      await refresh();
    });
  }

  async function addPhoto(file: File, privacy: Privacy) {
    if (!selected) return;
    await guard(async () => {
      let takenAt: number | null = null;
      try {
        const exif = await exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'] });
        const dt = exif?.DateTimeOriginal ?? exif?.CreateDate ?? exif?.ModifyDate;
        if (dt instanceof Date) takenAt = dt.getTime();
      } catch {
        /* EXIF 解析失败不影响上传 */
      }
      if (takenAt == null) takenAt = file.lastModified || null;
      const full = await compressImage(file, 1600);
      const { url } = await api.upload(full);
      const thumbFile = await compressImage(file, 320);
      const thumb = await api.upload(thumbFile);
      await api.addMedia({ personId: selected.id, path: url, thumbPath: thumb.url, privacy, takenAt });
      const res = await api.personMedia(selected.id);
      setMedia(res.media);
      setToast('照片已添加');
    });
  }

  async function removePhoto(id: string) {
    if (!selected) return;
    await guard(async () => {
      await api.deleteMedia(id);
      const res = await api.personMedia(selected.id);
      setMedia(res.media);
    });
  }

  async function importRows(rows: ParsedRow[]) {
    await guard(async () => {
      const byName = new Map<string, string>();
      for (const p of data.persons) byName.set(p.name, p.id);

      const ensure = async (name: string, gender: Gender, row?: ParsedRow): Promise<string> => {
        const hit = byName.get(name);
        if (hit) return hit;
        const res = await api.createPerson(
          row
            ? {
                name,
                gender: row.gender,
                birthDate: row.birthDate,
                birthPrecision: row.birthPrecision,
                deathDate: row.deathDate,
                deathPrecision: row.deathPrecision,
                isAlive: row.isAlive,
              }
            : { name, gender },
        );
        byName.set(name, res.person.id);
        return res.person.id;
      };

      for (const row of rows) await ensure(row.name, row.gender, row);
      for (const row of rows) {
        if (row.spouseName) await ensure(row.spouseName, 'unknown');
        for (const parentName of row.parentNames) await ensure(parentName, 'unknown');
      }

      for (const row of rows) {
        const selfId = byName.get(row.name)!;
        if (row.spouseName) {
          const spouseId = byName.get(row.spouseName)!;
          const exists = data.members.some(
            (m) => m.role === 'spouse' && m.personId === selfId && m.unionId === data.members.find((x) => x.personId === spouseId && x.role === 'spouse')?.unionId,
          );
          if (!exists) await api.createUnion({ spouseIds: [selfId, spouseId] });
        }
        if (row.parentNames.length) {
          const parentIds = row.parentNames.map((n) => byName.get(n)!).filter(Boolean);
          if (parentIds.length) {
            const shared = data.unions.find((u) => {
              const spouses = data.members.filter((m) => m.unionId === u.id && m.role === 'spouse').map((m) => m.personId);
              return parentIds.every((id) => spouses.includes(id));
            });
            if (shared) {
              const children = data.members.filter((m) => m.unionId === shared.id && m.role === 'child').map((m) => m.personId);
              if (!children.includes(selfId)) {
                await api.updateUnion(shared.id, { spouseIds: parentIds, childIds: [...children, selfId] });
              }
            } else {
              await api.createUnion({ spouseIds: parentIds, childIds: [selfId] });
            }
          }
        }
      }
      await refresh();
      setToast(`已导入 ${rows.length} 条记录`);
    });
  }

  if (!user) {
    if (checking) {
      return (
        <div className="auth-page">
          <div className="auth-card">正在登录…</div>
        </div>
      );
    }
    return (
      <Login
        onAuthed={(token, u) => {
          setToken(token);
          setUser(u);
        }}
      />
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">家谱</span>
        <div className="search">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索姓名"
            style={{ width: 220 }}
          />
          {matches.length > 0 && keyword.trim() && (
            <div className="search-results">
              {matches.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedId(p.id);
                    setFocusId(p.id);
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => setDirection(direction === 'TB' ? 'LR' : 'TB')}>
          {direction === 'TB' ? '切换为横向' : '切换为纵向'}
        </button>
        <select
          className="ghost"
          value={fontLevel}
          onChange={(e) => setFontLevel(Number(e.target.value) as FontLevel)}
          title="字号大小"
          style={{ width: 'auto' }}
        >
          {FONT_LABELS.map((l, i) => (
            <option key={i} value={i}>
              {l}字号
            </option>
          ))}
        </select>
        {canEdit && <button onClick={() => setDialog('new')}>加人</button>}
        {canEdit && <button onClick={() => setDialog('batch')}>批量录入</button>}
        {user.role === 'admin' && <button onClick={() => setDialog('admin')}>管理</button>}
        <button onClick={() => setDialog('export')} disabled={!layout}>
          导出
        </button>
        <span className="spacer" />
        <button className="ghost" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          {theme === 'light' ? '夜间' : '日间'}
        </button>
        <button className="ghost" onClick={() => setDialog('trash')}>
          回收站
        </button>
        <button className="ghost" onClick={() => setDialog('account')}>
          {user.displayName}
        </button>
      </div>

      <div className="canvas-wrap">
        <ReactFlowProvider>
          <TreeCanvas
            data={data}
            direction={direction}
            collapsed={collapsed}
            selectedId={selectedId}
            focusId={focusId}
            dimIds={dimIds}
            onSelect={(id) => {
              setSelectedId(id);
              setFocusId(null);
            }}
            onToggleCollapse={toggleCollapse}
            onLayout={onLayout}
          />
        </ReactFlowProvider>

        {data.persons.length === 0 && (
          <div className="modal-backdrop" style={{ background: 'transparent' }}>
            <div className="modal">
              <header>先建立第一位成员</header>
              <div className="body">
                <p className="hint">从家族中最年长的一位开始，之后在详情里加配偶、加子女即可生长出整棵树。</p>
              </div>
              <footer>
                <button className="primary" onClick={() => setDialog('new')}>
                  新增成员
                </button>
              </footer>
            </div>
          </div>
        )}

        {selected && (
          <PersonDrawer
            person={selected}
            data={data}
            canEdit={canEdit}
            canSetPrivacy={canEdit && (user.role === 'admin' || selected.createdBy === user.id)}
            media={media}
            onClose={() => setSelectedId(null)}
            onSave={savePerson}
            onSelect={(id) => {
              setSelectedId(id);
              setFocusId(id);
            }}
            onDelete={deleteSelected}
            onAddRelation={(mode) => setRelation(mode)}
            onRemoveRelation={removeRelation}
            onUploadAvatar={uploadAvatar}
            onAddPhoto={addPhoto}
            onRemovePhoto={removePhoto}
          />
        )}
      </div>

      <div className="statusbar">
        <span>共 {data.persons.length} 人</span>
        <span>{data.unions.length} 个家庭</span>
        <span className="spacer" />
        <span>{toast}</span>
      </div>

      {relation && selected && (
        <AddRelationDialog
          mode={relation}
          personName={selected.name}
          persons={data.persons}
          excludeIds={[selected.id]}
          busy={busy}
          onClose={() => setRelation(null)}
          onCreate={(name, gender) => handleAddRelation(relation, { name, gender })}
          onPick={(id) => handleAddRelation(relation, { existingId: id })}
        />
      )}

      {dialog === 'new' && (
        <NewPersonDialog
          busy={busy}
          onClose={() => setDialog('none')}
          onCreate={async (name, gender) => {
            await guard(async () => {
              const person = await createPersonNow(name, gender);
              setSelectedId(person.id);
              setDialog('none');
            });
          }}
        />
      )}

      {dialog === 'batch' && (
        <BatchImportDialog existing={data.persons} onClose={() => setDialog('none')} onImport={importRows} />
      )}

      {dialog === 'export' && layout && (
        <ExportDialog layout={layout} persons={data.persons} direction={direction} onClose={() => setDialog('none')} />
      )}

      {dialog === 'trash' && <TrashDialog onClose={() => setDialog('none')} onChanged={refresh} />}

      {dialog === 'admin' && (
        <AdminDialog
          me={user}
          onClose={() => setDialog('none')}
          onUsersChanged={() => {
            refresh().catch(() => undefined);
          }}
        />
      )}

      {dialog === 'account' && (
        <AccountDialog
          user={user}
          onClose={() => setDialog('none')}
          onLogout={() => {
            setToken('');
            setUser(null);
          }}
        />
      )}
    </div>
  );
}

function TrashDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => Promise<void> }) {
  const [items, setItems] = useState<Person[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .trash()
      .then((res) => setItems(res.persons))
      .catch((err) => setError((err as Error).message));
  }, []);

  async function run(fn: () => Promise<unknown>) {
    setError('');
    try {
      await fn();
      setItems((await api.trash()).persons);
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>回收站</header>
        <div className="body">
          {items.length === 0 && <p className="hint">回收站是空的。</p>}
          <ul className="rel-list">
            {items.map((p) => (
              <li key={p.id}>
                <span className="who">{p.name}</span>
                <button onClick={() => run(() => api.restorePerson(p.id))}>恢复</button>
                <button
                  className="danger"
                  onClick={() => {
                    if (window.confirm(`彻底删除「${p.name}」？此操作不可撤销。`)) run(() => api.purgePerson(p.id));
                  }}
                >
                  彻底删除
                </button>
              </li>
            ))}
          </ul>
        </div>
        <footer>
          <button onClick={onClose}>关闭</button>
        </footer>
        <div style={{ padding: '0 18px 12px' }}>
          <div className="error">{error}</div>
        </div>
      </div>
    </div>
  );
}

function AccountDialog({ user, onClose, onLogout }: { user: AuthUser; onClose: () => void; onLogout: () => void }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function change() {
    setError('');
    setMessage('');
    try {
      await api.changePassword(oldPassword, newPassword);
      setMessage('密码已更新');
      setOldPassword('');
      setNewPassword('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>账号 · {user.displayName}</header>
        <div className="body">
          <p className="hint">
            用户名 {user.username} · 角色 {user.role === 'admin' ? '管理员' : user.role === 'editor' ? '编辑者' : '访客'}
          </p>
          <div className="section-title">修改密码</div>
          <label className="field">
            <span>当前密码</span>
            <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
          </label>
          <label className="field">
            <span>新密码（至少 6 位）</span>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          {message && <p className="hint">{message}</p>}
        </div>
        <footer>
          <button onClick={onLogout}>退出登录</button>
          <button onClick={onClose}>关闭</button>
          <button className="primary" disabled={!oldPassword || newPassword.length < 6} onClick={change}>
            保存
          </button>
        </footer>
        <div style={{ padding: '0 18px 12px' }}>
          <div className="error">{error}</div>
        </div>
      </div>
    </div>
  );
}
