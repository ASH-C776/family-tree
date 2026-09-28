import { useState } from 'react';
import type { Gender } from '../types';

interface Props {
  busy: boolean;
  onClose: () => void;
  onCreate: (name: string, gender: Gender) => void;
}

export function NewPersonDialog({ busy, onClose, onCreate }: Props) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('unknown');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>新增成员</header>
        <div className="body">
          <label className="field">
            <span>姓名</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="必填" />
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
          <p className="hint">创建后可在详情里补充生卒、照片与关系。</p>
        </div>
        <footer>
          <button onClick={onClose}>取消</button>
          <button className="primary" disabled={busy || !name.trim()} onClick={() => onCreate(name.trim(), gender)}>
            {busy ? '创建中…' : '创建'}
          </button>
        </footer>
      </div>
    </div>
  );
}
