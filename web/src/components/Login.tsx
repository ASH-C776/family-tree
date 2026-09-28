import { useEffect, useState } from 'react';
import { api } from '../api';
import type { AuthUser } from '../types';

interface Props {
  onAuthed: (token: string, user: AuthUser) => void;
}

export function Login({ onAuthed }: Props) {
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'closed' | 'invite' | 'apply'>('invite');
  const [siteTitle, setSiteTitle] = useState('家谱');
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const preset = new URLSearchParams(window.location.search).get('code');
    if (preset) {
      setCode(preset);
      setTab('register');
    }
    api
      .state()
      .then((s) => {
        setInitialized(s.initialized);
        setMode(s.registrationMode);
        if (s.siteTitle) setSiteTitle(s.siteTitle);
      })
      .catch(() => setError('无法连接服务器'));
  }, []);

  async function submit() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!initialized) {
        const res = await api.bootstrap(username, password, displayName || username);
        onAuthed(res.token, res.user);
        return;
      }
      if (tab === 'login') {
        const res = await api.login(username, password);
        onAuthed(res.token, res.user);
        return;
      }
      const res = await api.register({ username, password, displayName: displayName || undefined, code: code || undefined });
      if (res.token && res.user) {
        onAuthed(res.token, res.user);
        return;
      }
      setNotice(res.message ?? '已提交，等待管理员审核');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canRegister = initialized && mode !== 'closed';

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{siteTitle}</h1>
        <p className="sub">
          {initialized === null
            ? '正在连接…'
            : !initialized
              ? '首次使用，请创建管理员账号'
              : tab === 'login'
                ? '登录后即可查看与编辑家谱'
                : mode === 'invite'
                  ? '填入家人给你的邀请码即可加入'
                  : '提交后需要管理员审核通过才能登录'}
        </p>

        {initialized && canRegister && (
          <div className="row" style={{ marginBottom: 12 }}>
            <button className={tab === 'login' ? 'primary' : ''} onClick={() => setTab('login')}>
              登录
            </button>
            <button className={tab === 'register' ? 'primary' : ''} onClick={() => setTab('register')}>
              注册
            </button>
          </div>
        )}

        <label className="field">
          <span>用户名</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        {(!initialized || tab === 'register') && (
          <label className="field">
            <span>显示名称（可选）</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
        )}
        {tab === 'register' && mode === 'invite' && (
          <label className="field">
            <span>邀请码</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="向管理员索取" />
          </label>
        )}
        <label className="field">
          <span>密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={initialized && tab === 'login' ? 'current-password' : 'new-password'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        </label>

        {notice && <p className="hint">{notice}</p>}
        <div className="error">{error}</div>
        <button className="primary" style={{ width: '100%' }} disabled={busy || !username || !password} onClick={submit}>
          {busy ? '处理中…' : !initialized ? '创建管理员并进入' : tab === 'login' ? '登录' : '提交注册'}
        </button>
        {initialized && mode === 'closed' && (
          <p className="hint" style={{ marginTop: 12 }}>
            当前不接受自行注册，请让管理员给你开账号。
          </p>
        )}
      </div>
    </div>
  );
}
