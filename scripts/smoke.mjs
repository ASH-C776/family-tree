const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:8099';
const USER = `smoke${Date.now().toString(36)}`;

let token = '';
let failures = 0;

function assert(cond, message) {
  if (cond) {
    console.log(`  ok  ${message}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${message}`);
  }
}

async function call(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined && typeof init.body !== 'string') headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    body: init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  return { status: res.status, data };
}

async function main() {
  const state = await call('/api/auth/state');
  assert(state.data.initialized === true || state.data.initialized === false, 'GET /api/auth/state');

  const boot = await call('/api/auth/bootstrap', {
    method: 'POST',
    body: { username: USER, password: 'smoke123456', displayName: '冒烟测试' },
  });
  assert(boot.status === 200 || boot.status === 409, `bootstrap -> ${boot.status}`);

  if (boot.status === 200) {
    token = boot.data.token;
  } else {
    const login = await call('/api/auth/login', {
      method: 'POST',
      body: { username: process.env.FT_USER ?? 'uicheck', password: process.env.FT_PASS ?? 'ui-check-123' },
    });
    assert(login.status === 200, `已有管理员，用既有账号登录 -> ${login.status}`);
    token = login.data.token;
  }
  assert(!!token, '拿到登录令牌');

  const me = await call('/api/auth/me');
  assert(me.status === 200 && me.data.user.role === 'admin', 'GET /api/auth/me');

  const grandpa = await call('/api/persons', { method: 'POST', body: { name: '张建国', gender: 'male', birthDate: '1948-05-12' } });
  const grandma = await call('/api/persons', { method: 'POST', body: { name: '李秀英', gender: 'female', birthDate: '1950' } });
  const father = await call('/api/persons', { method: 'POST', body: { name: '张伟', gender: 'male', birthDate: '1975-03-02' } });
  assert(grandpa.status === 200 && grandma.status === 200 && father.status === 200, '创建 3 位成员');

  const union = await call('/api/unions', {
    method: 'POST',
    body: { spouseIds: [grandpa.data.person.id, grandma.data.person.id], childIds: [father.data.person.id] },
  });
  assert(union.status === 200, '创建家庭关系（夫妻 + 子女）');

  const tree = await call('/api/tree');
  assert(tree.status === 200 && tree.data.persons.length >= 3, `GET /api/tree 返回 ${tree.data.persons.length} 人`);
  assert(tree.data.unions.length >= 1, '家庭关系出现在树数据里');
  assert(tree.data.members.filter((m) => m.role === 'spouse').length >= 2, '配偶关系成员齐全');
  assert(tree.data.members.filter((m) => m.role === 'child').length >= 1, '子女关系成员齐全');

  const stale = await call(`/api/persons/${father.data.person.id}`, {
    method: 'PATCH',
    body: { name: '张伟改', expectedUpdatedAt: 1234 },
  });
  assert(stale.status === 409, '过期保存返回 409 冲突');

  const fresh = await call(`/api/persons/${father.data.person.id}`, {
    method: 'PATCH',
    body: { name: '张伟改', expectedUpdatedAt: father.data.person.updatedAt },
  });
  assert(fresh.status === 200 && fresh.data.person.name === '张伟改', '正常保存成功');

  const del = await call(`/api/persons/${grandma.data.person.id}`, { method: 'DELETE' });
  assert(del.status === 200, '删除人物（进入回收站）');

  const trash = await call('/api/trash');
  assert(trash.status === 200 && trash.data.persons.some((p) => p.id === grandma.data.person.id), '回收站能看到被删的人');

  const afterDelete = await call('/api/tree');
  assert(!afterDelete.data.persons.some((p) => p.id === grandma.data.person.id), '树里不再显示被删的人');

  const restore = await call(`/api/trash/${grandma.data.person.id}/restore`, { method: 'POST' });
  assert(restore.status === 200, '从回收站恢复');

  const restored = await call('/api/tree');
  assert(restored.data.persons.some((p) => p.id === grandma.data.person.id), '恢复后重新出现在树里');

  async function uploadPng() {
    const pngBytes = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
      (c) => c.charCodeAt(0),
    );
    const form = new FormData();
    form.append('file', new Blob([pngBytes], { type: 'image/png' }), 'test.png');
    const res = await fetch(`${BASE}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    return (await res.json()).url;
  }

  const uploadUrl = await uploadPng();
  assert(!!uploadUrl, '上传图片返回访问地址');
  if (uploadUrl) {
    const fetched = await fetch(`${BASE}${uploadUrl}`);
    assert(fetched.status === 200, '上传后的图片可以访问');
  }

  const adminToken = token;

  const setClosed = await call('/api/settings', { method: 'PUT', body: { registrationMode: 'closed' } });
  assert(setClosed.status === 200, '管理员切换注册模式');
  const closedReg = await call('/api/auth/register', {
    method: 'POST',
    body: { username: `x${Date.now().toString(36)}`, password: 'abcdef' },
  });
  assert(closedReg.status === 403, '关闭注册时拒绝注册');

  await call('/api/settings', { method: 'PUT', body: { registrationMode: 'invite' } });
  const inv = await call('/api/invites', { method: 'POST', body: { role: 'editor', note: '给二舅', expiresInDays: 7 } });
  assert(inv.status === 200 && !!inv.data.invite?.code, '管理员生成邀请码');
  const code = inv.data.invite?.code ?? '';

  const editorName = `m2${Date.now().toString(36)}`;
  const byInvite = await call('/api/auth/register', {
    method: 'POST',
    body: { username: editorName, password: 'abcdef', displayName: '二舅', code },
  });
  assert(byInvite.status === 200 && byInvite.data.user?.role === 'editor', '邀请码注册成功且角色正确');
  const editorToken = byInvite.data.token ?? '';

  const reuse = await call('/api/auth/register', {
    method: 'POST',
    body: { username: `${editorName}b`, password: 'abcdef', code },
  });
  assert(reuse.status === 400, '邀请码不能重复使用');

  const badCode = await call('/api/auth/register', {
    method: 'POST',
    body: { username: `${editorName}c`, password: 'abcdef', code: 'nope' },
  });
  assert(badCode.status === 400, '无效邀请码被拒绝');

  token = byInvite.data.token ?? '';
  const editorSeesUsers = await call('/api/users');
  assert(editorSeesUsers.status === 403, '编辑者访问用户列表被拒绝');
  const editorInvite = await call('/api/invites', { method: 'POST', body: { role: 'viewer' } });
  assert(editorInvite.status === 403, '编辑者不能生成邀请码');
  token = adminToken;

  await call('/api/settings', { method: 'PUT', body: { registrationMode: 'apply' } });
  const applyName = `m3${Date.now().toString(36)}`;
  const applied = await call('/api/auth/register', { method: 'POST', body: { username: applyName, password: 'abcdef' } });
  assert(applied.status === 200 && applied.data.pending === true, '开放申请时注册进入待审核');

  const pendingLogin = await call('/api/auth/login', { method: 'POST', body: { username: applyName, password: 'abcdef' } });
  assert(pendingLogin.status === 403, '待审核账号不能登录');

  const list = await call('/api/users');
  const pendingUser = list.data.users.find((u) => u.username === applyName);
  assert(!!pendingUser && pendingUser.status === 'pending', '用户列表显示待审核状态');
  const approve = await call(`/api/users/${pendingUser.id}`, {
    method: 'PATCH',
    body: { status: 'active', role: 'editor' },
  });
  assert(approve.status === 200, '管理员审核通过');
  const afterApprove = await call('/api/auth/login', { method: 'POST', body: { username: applyName, password: 'abcdef' } });
  assert(afterApprove.status === 200, '审核通过后可以登录');

  const disable = await call(`/api/users/${pendingUser.id}`, { method: 'PATCH', body: { status: 'disabled' } });
  assert(disable.status === 200, '停用账号');
  const disabledLogin = await call('/api/auth/login', { method: 'POST', body: { username: applyName, password: 'abcdef' } });
  assert(disabledLogin.status === 403, '停用后不能登录');

  const selfDemote = await call(`/api/users/${pendingUser.id}`, { method: 'PATCH', body: { status: 'active' } });
  assert(selfDemote.status === 200, '重新启用账号');
  const cleanup = await call(`/api/users/${pendingUser.id}`, { method: 'DELETE' });
  assert(cleanup.status === 200, '删除账号');

  await call('/api/settings', { method: 'PUT', body: { registrationMode: 'invite' } });

  const fullUrl = await uploadPng();
  const thumbUrl = await uploadPng();
  const addMedia = await call('/api/media', {
    method: 'POST',
    body: { personId: grandpa.data.person.id, path: fullUrl, thumbPath: thumbUrl, caption: '年轻时' },
  });
  assert(addMedia.status === 200, '新增照片记录');
  const mediaList = await call(`/api/persons/${grandpa.data.person.id}/media`);
  assert(
    mediaList.status === 200 && mediaList.data.media.some((m) => m.id === addMedia.data.media?.id),
    '照片列表能看到新增的照片',
  );
  assert(mediaList.data.media.some((m) => m.thumbUrl && m.url), '照片同时保存原图与缩略图地址');
  const delMedia = await call(`/api/media/${addMedia.data.media.id}`, { method: 'DELETE' });
  assert(delMedia.status === 200, '删除照片');
  const mediaAfter = await call(`/api/persons/${grandpa.data.person.id}/media`);
  assert(!mediaAfter.data.media.some((m) => m.id === addMedia.data.media?.id), '删除后照片不再返回');

  const fallback = await fetch(`${BASE}/some/spa/route`);
  const fallbackText = await fallback.text();
  assert(fallback.status === 200 && fallbackText.includes('<div id="root">'), '前端路由回退到 index.html');

  const noAuth = await fetch(`${BASE}/api/persons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '无名' }),
  });
  assert(noAuth.status === 401, '未登录写入被拒绝（401）');

  // ===== M3 隐私字段分级 =====
  const viewerInv = await call('/api/invites', { method: 'POST', body: { role: 'viewer' } });
  const viewerCode = viewerInv.data.invite?.code ?? '';
  const viewerName = `vw${Date.now().toString(36)}`;
  const viewerReg = await call('/api/auth/register', {
    method: 'POST',
    body: { username: viewerName, password: 'abcdef', code: viewerCode },
  });
  assert(viewerReg.status === 200 && viewerReg.data.user?.role === 'viewer', '邀请码注册 viewer 成功');
  const viewerToken = viewerReg.data.token ?? '';

  const privatePerson = await call('/api/persons', { method: 'POST', body: { name: '保密人物', privacy: 'private' } });
  assert(privatePerson.status === 200, '管理员创建 private 人物');
  const privateId = privatePerson.data.person.id;

  const adminTree = await call('/api/tree');
  assert(adminTree.data.persons.some((p) => p.id === privateId), 'admin 能看到 private 人物');

  token = viewerToken;
  const viewerTree = await call('/api/tree');
  assert(viewerTree.data.persons.some((p) => p.id === grandpa.data.person.id), 'viewer 能看到公开人物');
  assert(!viewerTree.data.persons.some((p) => p.id === privateId), 'viewer 看不到 private 人物');

  token = adminToken;
  const familyPerson = await call('/api/persons', { method: 'POST', body: { name: '家族人物', privacy: 'family' } });
  const familyId = familyPerson.data.person.id;
  token = editorToken;
  const editorFam = await call('/api/tree');
  assert(editorFam.data.persons.some((p) => p.id === familyId), 'editor 能看到 family 人物');
  token = viewerToken;
  const viewerFam = await call('/api/tree');
  assert(!viewerFam.data.persons.some((p) => p.id === familyId), 'viewer 看不到 family 人物');
  token = adminToken;

  const pmUrl = await uploadPng();
  const pmThumb = await uploadPng();
  const privateMedia = await call('/api/media', {
    method: 'POST',
    body: { personId: privateId, path: pmUrl, thumbPath: pmThumb, privacy: 'private', takenAt: 1609459200000 },
  });
  assert(privateMedia.status === 200, '管理员新增 private 照片');
  assert(privateMedia.data.media?.takenAt === 1609459200000, '照片返回 takenAt（EXIF 时间线）');
  const adminMedia = await call(`/api/persons/${privateId}/media`);
  assert(adminMedia.data.media.some((m) => m.id === privateMedia.data.media?.id), 'admin 能看到 private 照片');
  token = viewerToken;
  const viewerMedia = await call(`/api/persons/${privateId}/media`);
  assert(viewerMedia.data.media.length === 0, 'viewer 看不到 private 照片');
  token = adminToken;

  console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
