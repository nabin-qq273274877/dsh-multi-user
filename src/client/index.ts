/**
 * dsh-multi-user 正式插件 — Client 入口（浏览器环境，打进 shell bundle）。
 *
 * 职责：
 *  1. 经 `fetch('/api/mu/me/grants')` 拿当前用户身份（userId/role）与授权
 *     目录列表（JWT 为 HttpOnly cookie，JS 读不到 document.cookie，由浏览器
 *     自动携带、Host 侧验签；无多标签页串号）；
 *  2. 接管 `sidebar.workspaces` slot，用 `ctx.workspaces.list` 读全量工作区，
 *     按 `path` 过滤，只渲染当前用户登记的目录；
 *  3. 会话随工作区同源过滤（只显示落在已登记工作区下的会话）。
 *
 * 本文件经 esbuild 打包后由 scripts/build.ts 包进 DSH 工厂
 * （window.__ModuleLoader__.load），导出 `apply` / `inject`。
 */

import * as React from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import type { CSSProperties } from 'react';

export const inject = ['slots', 'workspaces', 'sessions', 'locale'];

/* ---------------- 类型 ---------------- */

interface Identity {
  userId: string | null;
  username: string | null;
  role: string | null;
  workspaceDirs: string[] | null; // null = 尚未加载
  loading: boolean;
}

interface WorkspaceView {
  workspaceId: string;
  path: string;
  title: string;
  sessionIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface SessionSummary {
  id: string;
  title?: string;
  displayTitle: string;
  cwd?: string;
}

interface WorkspaceListState {
  items: WorkspaceView[];
  archivedSessionIds: string[];
}

interface SessionListState {
  ids: string[];
  byId: Record<string, SessionSummary>;
  current?: string;
  phase: 'pending' | 'ready';
}

interface ObservableSnapshot<T> {
  getSnapshot(): T;
  subscribe(fn: () => void): () => void;
}

/* ---------------- 工具 ---------------- */

function normalizePath(p: unknown): string {
  return String(p || '').replace(/[/\\]+$/, '').replace(/\\/g, '/');
}

/* ---------------- 身份 / 授权数据 hook ---------------- */

function useIdentity(): Identity {
  const [identity, setIdentity] = React.useState<Identity>(() => ({
    userId: null,
    username: null,
    role: null,
    workspaceDirs: null,
    loading: true,
  }));
  React.useEffect(() => {
    let cancelled = false;
    // JWT 是 HttpOnly cookie，JS 读不到 document.cookie；身份与授权统一从
    // /api/mu/me/grants 获取（浏览器自动携带 HttpOnly cookie，Host 侧验签）。
    fetch('/api/mu/me/grants', { credentials: 'same-origin' })
      .then((r) => {
        if (r.status === 401) return { userId: null, role: null, workspaceDirs: [] };
        if (!r.ok) throw new Error('grants failed');
        return r.json();
      })
      .then((data: { userId?: string; username?: string; role?: string; workspaceDirs?: unknown }) => {
        if (cancelled) return;
        setIdentity({
          userId: data.userId ?? null,
          username: data.username ?? null,
          role: data.role ?? null,
          workspaceDirs: Array.isArray(data.workspaceDirs) ? data.workspaceDirs : [],
          loading: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setIdentity({ userId: null, username: null, role: null, workspaceDirs: [], loading: false });
      });
    return () => { cancelled = true; };
  }, []);
  return identity;
}

/** 订阅 `ctx.workspaces.list`（ObservableSnapshot），返回快照。 */
function useWorkspaceSnapshot(ctx: any): WorkspaceListState {
  const list = ctx.workspaces?.list as ObservableSnapshot<WorkspaceListState> | undefined;
  const [snap, setSnap] = React.useState<WorkspaceListState>(() => {
    if (list && typeof list.getSnapshot === 'function') return list.getSnapshot();
    return { items: [], archivedSessionIds: [] };
  });
  React.useEffect(() => {
    if (!list || typeof list.subscribe !== 'function') return;
    const unsub = list.subscribe(() => setSnap(list.getSnapshot()));
    return unsub;
  }, [list]);
  return snap;
}

/** 订阅 `ctx.sessions.list`（ObservableSnapshot），返回会话数组。 */
function useSessionSnapshot(ctx: any): SessionSummary[] {
  const list = ctx.sessions?.list as ObservableSnapshot<SessionListState> | undefined;
  const [snap, setSnap] = React.useState<SessionListState>(() => {
    if (list && typeof list.getSnapshot === 'function') return list.getSnapshot();
    return { ids: [], byId: {}, phase: 'pending' };
  });
  React.useEffect(() => {
    if (!list || typeof list.subscribe !== 'function') return;
    const unsub = list.subscribe(() => setSnap(list.getSnapshot()));
    return unsub;
  }, [list]);
  const byId = snap.byId || {};
  const ids = snap.ids || [];
  return ids.map((id) => byId[id]).filter((s): s is SessionSummary => !!s);
}

/* ---------------- 过滤逻辑 ---------------- */

/** 按用户授权目录过滤工作区；owner 放行全量，member 按授权过滤。 */
function filterWorkspaces(items: WorkspaceView[], identity: Identity): WorkspaceView[] {
  if (!identity.userId) return [];
  if (identity.workspaceDirs == null) return items; // 授权尚未加载，先展示全量避免闪烁
  if (identity.role === 'owner') return items; // 主管理员看全部
  const allowed = new Set(identity.workspaceDirs.map(normalizePath));
  return items.filter((w) => allowed.has(normalizePath(w.path)));
}

/* ---------------- UI 组件 ---------------- */

const workspaceRowStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', width: '100%',
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 14,
  padding: '7px 8px', borderRadius: 8, textAlign: 'left',
};
const sessionRowStyle: CSSProperties = {
  display: 'block', width: '100%', background: 'transparent', border: 'none',
  cursor: 'pointer', color: 'var(--dsw-alias-label-secondary)', font: 'inherit',
  fontSize: 13, padding: '5px 8px 5px 30px', borderRadius: 8, textAlign: 'left',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

function WorkspaceItem({ workspace, sessions, onOpen }: { workspace: WorkspaceView; sessions: SessionSummary[]; onOpen: (id: string) => void }) {
  const [expanded, setExpanded] = React.useState(false);
  const members = (workspace.sessionIds || [])
    .map((id) => sessions.find((s) => s.id === id))
    .filter((s): s is SessionSummary => !!s);
  return jsxs('div', { style: { marginBottom: 2 }, children: [
    jsxs('button', {
      type: 'button',
      onClick: () => setExpanded((v) => !v),
      style: workspaceRowStyle,
      children: [
        jsx('span', { style: { marginRight: 6 }, children: expanded ? '▾' : '▸' }),
        jsx('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: workspace.title || workspace.path }),
      ],
    }),
    expanded && members.map((s) => jsx('button', {
      type: 'button',
      key: s.id,
      onClick: () => onOpen(s.id),
      style: sessionRowStyle,
      children: s.title || s.displayTitle || s.id,
    })),
  ] });
}

function WorkspaceBrowser({ ctx, identity, workspaces, sessions }: { ctx: any; identity: Identity; workspaces: WorkspaceView[]; sessions: SessionSummary[] }) {
  const [query, setQuery] = React.useState('');
  const filtered = filterWorkspaces(workspaces, identity);
  const q = query.trim().toLowerCase();
  const shown = q
    ? filtered.filter((w) => (w.title || '').toLowerCase().includes(q) || (w.path || '').toLowerCase().includes(q))
    : filtered;
  return jsxs('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '0 4px' }, children: [
    jsx('input', {
      value: query,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
      placeholder: '搜索工作区',
      style: {
        width: '100%', boxSizing: 'border-box', margin: '4px 0 8px',
        padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
        fontSize: 13, outline: 'none',
      },
    }),
    jsx('div', { style: { flex: 1, overflowY: 'auto', minHeight: 0 }, children: [
      shown.map((w) => jsx(WorkspaceItem, {
        key: w.workspaceId,
        workspace: w,
        sessions,
        onOpen: (id: string) => { if (ctx.sessions?.open) ctx.sessions.open(id); },
      })),
      shown.length === 0 && jsx('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, padding: '12px 8px', textAlign: 'center' }, children: identity.loading ? '加载中…' : '暂无工作区' }),
    ] }),
  ] });
}

/* ---------------- 插件 body ---------------- */

export function apply(ctx: any): void {
  ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({
    name: 'sidebar.workspaces',
    priority: -1, // 低于官方 ui-workspace 的默认 0，shadow 原生浏览区（lowest renders）
    inject: () => ({}),
  }, function FilteredBrowser() {
    const identity = useIdentity();
    const workspaceSnap = useWorkspaceSnapshot(ctx);
    const sessions = useSessionSnapshot(ctx);
    return jsx(WorkspaceBrowser, {
      ctx,
      identity,
      workspaces: workspaceSnap.items || [],
      sessions,
    });
  }));

  // 设置页「用户管理」section（仅主管理员可见，member 打开后显示无权限提示）
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'multi-user',
    order: 20,
    label: () => '用户管理',
  }, function UserManagementSection() {
    const identity = useIdentity();
    if (identity.role !== 'owner') {
      return jsx('div', { style: { color: 'var(--dsw-alias-label-tertiary)', padding: '24px', fontSize: 14 }, children: '仅主管理员可管理用户。' });
    }
    return jsx(UserManagement, { identity });
  }));
}

/* ---------------- 用户管理 UI ---------------- */

interface AdminUserView {
  id: string;
  username: string;
  displayName: string;
  role: string;
  status: string;
  hasPassword: boolean;
  createdAt: string;
}

function apiPost(path: string, body: Record<string, unknown>): Promise<any> {
  return fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  }).then((r) => r.json().then((j) => ({ status: r.status, json: j })));
}

const inputStyle: CSSProperties = {
  boxSizing: 'border-box', width: '100%', padding: '8px 10px',
  borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2)',
  background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
  fontSize: 13, outline: 'none',
};
const btnStyle: CSSProperties = {
  cursor: 'pointer', padding: '6px 12px', borderRadius: 8,
  border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent',
  color: 'var(--dsw-alias-label-primary)', fontSize: 12,
};
const primaryBtnStyle: CSSProperties = {
  ...btnStyle, background: 'var(--dsw-alias-brand-primary)',
  borderColor: 'var(--dsw-alias-brand-primary)', color: '#fff',
};
const dangerBtnStyle: CSSProperties = {
  ...btnStyle, color: 'var(--dsw-alias-state-error-primary)',
  borderColor: 'var(--dsw-alias-state-error-primary)',
};

function UserManagement({ identity }: { identity: Identity }) {
  const [users, setUsers] = React.useState<AdminUserView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  // 新建表单
  const [newUsername, setNewUsername] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [newDirs, setNewDirs] = React.useState('');

  const reload = React.useCallback(() => {
    setLoading(true);
    fetch('/api/mu/admin/users', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load users failed'))))
      .then((list) => { setUsers(Array.isArray(list) ? list : []); setLoading(false); })
      .catch(() => { setError('加载用户列表失败'); setLoading(false); });
  }, []);

  React.useEffect(() => { reload(); }, [reload]);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 3000); };

  const createUser = async () => {
    const username = newUsername.trim();
    if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) { setError('用户名需为 2-32 位字母/数字/_.-'); return; }
    if (newPassword.length < 6) { setError('初始密码至少 6 位'); return; }
    const dirs = newDirs.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean);
    const r = await apiPost('/api/mu/admin/users', { username, initialPassword: newPassword, workspaceDirs: dirs });
    if (r.json.ok) {
      setNewUsername(''); setNewPassword(''); setNewDirs('');
      setError(null); flash(`已创建用户 ${username}`);
      reload();
    } else {
      setError(r.json.error || '创建失败');
    }
  };

  const toggleStatus = async (u: AdminUserView) => {
    const status = u.status === 'active' ? 'disabled' : 'active';
    await apiPost('/api/mu/admin/users/update', { userId: u.id, status });
    reload();
  };

  const grantDirs = async (u: AdminUserView) => {
    const dirs = prompt(`为用户 ${u.username} 授权工作区目录（每行一个绝对路径）：`, '');
    if (dirs === null) return;
    const list = dirs.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean);
    await apiPost('/api/mu/admin/users/grants', { userId: u.id, workspaceDirs: list });
    flash(`已更新 ${u.username} 的工作区授权`);
  };

  const resetPassword = async (u: AdminUserView) => {
    const pw = prompt(`为 ${u.username} 设置新密码（至少 6 位）：`, '');
    if (pw === null) return;
    if (pw.length < 6) { setError('密码至少 6 位'); return; }
    const r = await apiPost('/api/mu/admin/users/reset-password', { userId: u.id, password: pw });
    if (r.json.ok) flash(`已重置 ${u.username} 的密码`); else setError(r.json.error || '重置失败');
  };

  const deleteUser = async (u: AdminUserView) => {
    if (!confirm(`确定删除用户 ${u.username}？其数据将匿名化保留。`)) return;
    await apiPost('/api/mu/admin/users/delete', { userId: u.id });
    reload();
  };

  const userList = loading
    ? jsx('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 }, children: '加载中…' })
    : jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: users.map((u) => jsxs('div', {
        key: u.id,
        style: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10 },
        children: [
          jsx('div', { style: { flex: 1, minWidth: 0 }, children: jsxs('div', { children: [
            jsx('span', { style: { fontSize: 14, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }, children: u.displayName || u.username }),
            jsx('span', { style: { marginLeft: 8, fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }, children: u.role === 'owner' ? '主管理员' : (u.status === 'disabled' ? '已停用' : '子用户') }),
          ] }) }),
          u.role !== 'owner' && jsx('button', { onClick: () => grantDirs(u), style: btnStyle, children: '授权' }),
          u.role !== 'owner' && jsx('button', { onClick: () => resetPassword(u), style: btnStyle, children: '重置密码' }),
          u.role !== 'owner' && jsx('button', { onClick: () => toggleStatus(u), style: btnStyle, children: u.status === 'active' ? '停用' : '启用' }),
          u.role !== 'owner' && jsx('button', { onClick: () => deleteUser(u), style: dangerBtnStyle, children: '删除' }),
        ],
      })) });

  return jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720, padding: '0 4px' }, children: [
    jsx('h3', { style: { margin: 0, fontSize: 16, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }, children: '用户管理' }),
    jsx('p', { style: { margin: 0, fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }, children: '添加子用户并授权其可见的工作区目录。子用户只能看到被授权目录下的工作区与会话。' }),

    // 新建用户
    jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12 }, children: [
      jsx('div', { style: { fontSize: 14, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }, children: '新建子用户' }),
      jsxs('div', { style: { display: 'flex', gap: 8 }, children: [
        jsx('input', { value: newUsername, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setNewUsername(e.target.value), placeholder: '用户名', style: inputStyle }),
        jsx('input', { value: newPassword, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value), placeholder: '初始密码（≥6位）', type: 'password', style: inputStyle }),
      ] }),
      jsx('input', { value: newDirs, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setNewDirs(e.target.value), placeholder: '授权工作区目录（逗号/换行分隔，留空=无工作区）', style: inputStyle }),
      jsx('div', { children: jsx('button', { onClick: createUser, style: primaryBtnStyle, children: '创建用户' }) }),
    ] }),

    // 用户列表
    userList,

    error && jsx('div', { style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }, children: error }),
    notice && jsx('div', { style: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 13 }, children: notice }),
  ] });
}
