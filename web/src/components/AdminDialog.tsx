import { useEffect, useState } from 'react';
import { ApiError, api } from '../api';
import type { AuthUser, Invite, RegistrationMode, UserRole } from '../types';

interface Props {
  me: AuthUser;
  onClose: () => void;
  onUsersChanged: () => void;
}

const ROLE_LABEL: Record<UserRole, string> = { admin: '管理员', editor: '编辑者', viewer: '访客' };
const STATUS_LABEL: Record<string, string> = { active: '正常', pending: '待审核', disabled: '已停用' };
const MODE_LABEL: Record<RegistrationMode, string> = { closed: '关闭注册', invite: '邀请码', apply: '申请后审核' };

export function AdminDialog({ me, onClose, onUsersChanged }: Props) {
  const [tab, setTab] = useState<'users' | 'invites' | 'settings'>('users');
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [mode, setMode] = useState<RegistrationMode>('invite');
  const [siteTitle, setSiteTitle] = useState('家谱');
  const [newRole, setNewRole] = useState<UserRole>('editor');
  const [expireDays, setExpireDays] = useState('7');
  const [note, setNote] = useState('');
  const [freshCode, setFreshCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  async function load() {
    const [u, iv, st] = await Promise.all([api.users(), api.invites(), api.settings()]);
    setUsers(u.users);
    setInvites(iv.invites);
    setMode(st.registrationMode);
    setSiteTitle(st.siteTitle);
  }

  useEffect(() => {
    load().catch((err) => setError((err as Error).message));
  }, []);

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      onUsersChanged();
      if (done) setToast(done);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  async function createInvite() {
    await run(async () => {
      const days = Number(expireDays);
      const res = await api.createInvite({
        role: newRole,
        note: note || undefined,
        expiresInDays: Number.isFinite(days) && days > 0 ? days : undefined,
      });
      setFreshCode(res.invite.code);
      setNote('');
    });
  }

  const inviteLink = freshCode ? `${window.location.origin}/?code=${freshCode}` : '';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 620 }}>
        <header>管理</header>
        <div className="body">
          <div className="row" style={{ marginBottom: 12 }}>
            <button className={tab === 'users' ? 'primary' : ''} onClick={() => setTab('users')}>
              成员账号
            </button>
            <button className={tab === 'invites' ? 'primary' : ''} onClick={() => setTab('invites')}>
              邀请码
            </button>
            <button className={tab === 'settings' ? 'primary' : ''} onClick={() => setTab('settings')}>
              站点设置
            </button>
          </div>

          {tab === 'users' && (
            <>
              {users.length === 0 && <p className="hint">还没有其他账号。</p>}
              <ul className="rel-list">
                {users.map((u) => (
                  <li key={u.id}>
                    <span className="who">
                      {u.displayName}
                      <span className="hint"> · {u.username}</span>
                    </span>
                    <span className="chip">{ROLE_LABEL[u.role]}</span>
                    <span className="chip">{STATUS_LABEL[u.status]}</span>
                    {u.id !== me.id && (
                      <>
                        <select
                          value={u.role}
                          disabled={busy}
                          onChange={(e) => run(() => api.updateUser(u.id, { role: e.target.value as UserRole }))}
                          style={{ width: 96 }}
                        >
                          <option value="admin">管理员</option>
                          <option value="editor">编辑者</option>
                          <option value="viewer">访客</option>
                        </select>
                        {u.status === 'pending' && (
                          <button disabled={busy} onClick={() => run(() => api.updateUser(u.id, { status: 'active' }), '已通过')}>
                            通过
                          </button>
                        )}
                        {u.status === 'active' && (
                          <button
                            disabled={busy}
                            onClick={() => run(() => api.updateUser(u.id, { status: 'disabled' }), '已停用')}
                          >
                            停用
                          </button>
                        )}
                        {u.status === 'disabled' && (
                          <button
                            disabled={busy}
                            onClick={() => run(() => api.updateUser(u.id, { status: 'active' }), '已启用')}
                          >
                            启用
                          </button>
                        )}
                        <button
                          disabled={busy}
                          onClick={() => {
                            const pwd = window.prompt(`为 ${u.displayName} 设置新密码（至少 6 位）`);
                            if (pwd) run(() => api.updateUser(u.id, { password: pwd }), '密码已重置');
                          }}
                        >
                          改密
                        </button>
                        <button
                          className="danger"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(`删除账号「${u.displayName}」？`)) run(() => api.deleteUser(u.id));
                          }}
                        >
                          删除
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {tab === 'invites' && (
            <>
              <div className="section-title">生成新的邀请码</div>
              <div className="row">
                <select value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)} style={{ width: 120 }}>
                  <option value="editor">编辑者</option>
                  <option value="viewer">访客</option>
                  <option value="admin">管理员</option>
                </select>
                <select value={expireDays} onChange={(e) => setExpireDays(e.target.value)} style={{ width: 120 }}>
                  <option value="7">7 天有效</option>
                  <option value="30">30 天有效</option>
                  <option value="0">长期有效</option>
                </select>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注（给谁）" />
                <button className="primary" disabled={busy} onClick={createInvite}>
                  生成
                </button>
              </div>
              {freshCode && (
                <div className="row" style={{ marginTop: 12 }}>
                  <span className="chip">{freshCode}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(inviteLink);
                      setToast('邀请链接已复制');
                    }}
                  >
                    复制链接
                  </button>
                </div>
              )}
              <div className="section-title">已有邀请码</div>
              {invites.length === 0 && <p className="hint">还没有生成过邀请码。</p>}
              <ul className="rel-list">
                {invites.map((iv) => (
                  <li key={iv.id}>
                    <span className="who">
                      {iv.code}
                      {iv.note ? <span className="hint"> · {iv.note}</span> : null}
                    </span>
                    <span className="chip">{ROLE_LABEL[iv.role]}</span>
                    <span className="chip">
                      {iv.usedByName ? `已被 ${iv.usedByName} 使用` : iv.expiresAt ? `有效期至 ${new Date(iv.expiresAt).toLocaleDateString()}` : '长期'}
                    </span>
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={() => run(() => api.deleteInvite(iv.id))}
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {tab === 'settings' && (
            <>
              <label className="field">
                <span>谁可以注册新账号</span>
                <select value={mode} onChange={(e) => setMode(e.target.value as RegistrationMode)}>
                  <option value="invite">邀请码（推荐）</option>
                  <option value="apply">开放申请，管理员审核</option>
                  <option value="closed">关闭注册</option>
                </select>
              </label>
              <p className="hint">
                {MODE_LABEL[mode] === MODE_LABEL.closed
                  ? '只有管理员能手动建账号，最省心也最安全。'
                  : MODE_LABEL[mode] === MODE_LABEL.invite
                    ? '把邀请链接发给家人，对方填码即可加入，角色由你指定。'
                    : '任何人可提交注册，你在「成员账号」里点通过才会生效。'}
              </p>
              <label className="field">
                <span>站点标题</span>
                <input value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} />
              </label>
              <button className="primary" disabled={busy} onClick={() => run(() => api.updateSettings({ registrationMode: mode, siteTitle }), '已保存')}>
                保存设置
              </button>
            </>
          )}
        </div>
        <footer>
          {toast && <span className="hint">{toast}</span>}
          <span className="spacer" />
          <button onClick={onClose}>关闭</button>
        </footer>
        <div style={{ padding: '0 18px 12px' }}>
          <div className="error">{error}</div>
        </div>
      </div>
    </div>
  );
}
