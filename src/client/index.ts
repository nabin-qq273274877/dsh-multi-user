/**
 * dsh-multi-user 正式插件 — Client 入口（浏览器环境，打进 shell bundle）。
 *
 * 职责：
 *  1. 经 `fetch('/api/mu/me/grants')` 拿当前用户身份（userId/role）与专属
 *     目录（JWT 为 HttpOnly cookie，JS 读不到 document.cookie，由浏览器
 *     自动携带、Host 侧验签；无多标签页串号）；
 *  2. 接管 `sidebar.workspaces` slot，扫描专属目录下的子目录作为工作区，
 *     每个用户（含主管理员）只看到自己专属目录内的工作区与会话；
 *  3. 设置页「用户管理」section：列表/新建/停用/删除/重置密码/改密码。
 *
 * 本文件经 esbuild 打包后由 scripts/build.ts 包进 DSH 工厂
 * （window.__ModuleLoader__.load），导出 `apply` / `inject`。
 */

import * as React from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import type { CSSProperties } from 'react';

export const inject = ['slots', 'sessions', 'locale'];

/* ---------------- 类型 ---------------- */

interface Identity {
  userId: string | null;
  username: string | null;
  role: string | null;
  workspaceRoot: string | null; // null = 尚未加载
  loading: boolean;
}

interface SessionSummary {
  id: string;
  title?: string;
  displayTitle: string;
  cwd?: string;
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

/** 专属目录下的一个子目录 = 一个工作区。 */
interface WorkspaceDir {
  name: string;
  path: string;
}

/* ---------------- 工具 ---------------- */

function normalizePath(p: unknown): string {
  return String(p || '').replace(/[/\\]+$/, '').replace(/\\/g, '/');
}

function isUnder(root: string, child: string): boolean {
  const r = normalizePath(root);
  const c = normalizePath(child);
  return c === r || c.startsWith(r + '/');
}

async function api(method: string, path: string, body?: Record<string, unknown>): Promise<{ status: number; json: any }> {
  const init: RequestInit = { method, credentials: 'same-origin' };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const r = await fetch(path, init);
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json };
}

/* ---------------- 身份 hook ---------------- */

function useIdentity(): Identity {
  const [identity, setIdentity] = React.useState<Identity>(() => ({
    userId: null,
    username: null,
    role: null,
    workspaceRoot: null,
    loading: true,
  }));
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/mu/me/grants', { credentials: 'same-origin' })
      .then((r) => {
        if (r.status === 401) return { userId: null, role: null, workspaceRoot: null };
        if (!r.ok) throw new Error('grants failed');
        return r.json();
      })
      .then((data: { userId?: string; username?: string; role?: string; workspaceRoot?: unknown }) => {
        if (cancelled) return;
        setIdentity({
          userId: data.userId ?? null,
          username: data.username ?? null,
          role: data.role ?? null,
          workspaceRoot: typeof data.workspaceRoot === 'string' ? data.workspaceRoot : null,
          loading: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setIdentity({ userId: null, username: null, role: null, workspaceRoot: null, loading: false });
      });
    return () => { cancelled = true; };
  }, []);
  return identity;
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
// header 图标按钮（搜索/视图/添加），对齐原生 iconButton
const iconBtnStyle: CSSProperties = {
  cursor: 'pointer', width: 28, height: 28, flex: 'none',
  color: 'var(--dsw-alias-label-secondary)', background: 'transparent',
  border: 'none', borderRadius: '50%', display: 'inline-flex',
  justifyContent: 'center', alignItems: 'center', padding: 0, fontSize: 16,
};

function WorkspaceItem({ workspace, sessions, onOpen, onDelete }: { workspace: WorkspaceDir; sessions: SessionSummary[]; onOpen: (id: string) => void; onDelete: () => void }) {
  const [expanded, setExpanded] = React.useState(false);
  // 会话按 cwd 落在该工作区目录下过滤
  const members = sessions.filter((s) => s.cwd && isUnder(workspace.path, s.cwd));
  return jsxs('div', { style: { marginBottom: 2 }, children: [
    jsxs('div', { style: { display: 'flex', alignItems: 'center', width: '100%' }, children: [
      jsxs('button', {
        type: 'button',
        onClick: () => setExpanded((v) => !v),
        style: { ...workspaceRowStyle, flex: 1, minWidth: 0 },
        children: [
          jsx('span', { style: { marginRight: 6 }, children: expanded ? '▾' : '▸' }),
          jsx('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: workspace.name }),
        ],
      }),
      jsx('button', {
        type: 'button',
        title: '删除工作区',
        onClick: onDelete,
        style: { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, padding: '4px 6px', flex: 'none' },
        children: '×',
      }),
    ] }),
    expanded && members.map((s) => jsx('button', {
      type: 'button',
      key: s.id,
      onClick: () => onOpen(s.id),
      style: sessionRowStyle,
      children: s.title || s.displayTitle || s.id,
    })),
  ] });
}

function WorkspaceBrowser({ ctx, identity, sessions, onChanged }: { ctx: any; identity: Identity; sessions: SessionSummary[]; onChanged: () => void }) {
  const [query, setQuery] = React.useState('');
  const [workspaces, setWorkspaces] = React.useState<WorkspaceDir[]>([]);
  const [loadingW, setLoadingW] = React.useState(true);
  const [searchExpanded, setSearchExpanded] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [addError, setAddError] = React.useState<string | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const reload = React.useCallback(() => {
    if (!identity.userId) { setWorkspaces([]); setLoadingW(false); return; }
    setLoadingW(true);
    fetch('/api/mu/me/workspaces', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('list failed'))))
      .then((data: { workspaces?: WorkspaceDir[] }) => { setWorkspaces(Array.isArray(data.workspaces) ? data.workspaces : []); setLoadingW(false); })
      .catch(() => { setWorkspaces([]); setLoadingW(false); });
  }, [identity.userId]);

  React.useEffect(() => { reload(); }, [reload]);

  const createWorkspace = async () => {
    const name = newName.trim();
    if (!name) { setAddError('请输入工作区名称'); return; }
    const r = await api('POST', '/api/mu/me/workspaces', { name });
    if (r.json.ok) {
      setNewName(''); setAdding(false); setAddError(null);
      reload(); onChanged();
    } else {
      setAddError(r.json.error || '创建失败');
    }
  };

  const deleteWorkspace = async (w: WorkspaceDir) => {
    if (!confirm(`删除工作区「${w.name}」及其目录内全部内容？此操作不可恢复。`)) return;
    const r = await api('POST', '/api/mu/me/workspaces/delete', { name: w.name });
    if (r.json.ok) { reload(); onChanged(); }
    else alert(r.json.error || '删除失败');
  };

  const q = query.trim().toLowerCase();
  const shown = q ? workspaces.filter((w) => w.name.toLowerCase().includes(q)) : workspaces;

  return jsxs('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '0 4px' }, children: [
    // header：左侧「工作区」文字，右侧 搜索 / 视图 / 添加 三按钮（对齐原生）
    jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 4, height: 36, margin: '2px -4px 4px', padding: '0 4px' }, children: [
      jsx('span', { style: { flex: 'none', maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', lineHeight: '20px' }, children: '工作区' }),

      // 搜索（点击展开）
      searchExpanded
        ? jsxs('div', { style: { flex: 1, display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, height: 30, padding: '0 4px 0 8px' }, children: [
            jsx('input', {
              ref: searchInputRef,
              value: query,
              autoFocus: true,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
              onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Escape') { setQuery(''); setSearchExpanded(false); } },
              placeholder: '搜索工作区',
              style: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--dsw-alias-label-primary)', fontSize: 13 },
            }),
            jsx('button', { type: 'button', onClick: () => { setQuery(''); setSearchExpanded(false); }, style: iconBtnStyle, children: '×' }),
          ] })
        : jsx('button', { type: 'button', title: '搜索', onClick: () => setSearchExpanded(true), style: iconBtnStyle, children: '⌕' }),

      // 视图（分组/排序；专属目录扫描下为占位，保留对齐原生三按钮）
      jsx('button', { type: 'button', title: '视图', onClick: () => reload(), style: iconBtnStyle, children: '≡' }),

      // 添加（点击展开输入框）
      jsx('button', { type: 'button', title: '新建工作区', onClick: () => { setAdding((v) => !v); setAddError(null); }, style: iconBtnStyle, children: '＋' }),
    ] }),

    // 添加工作区的内联输入框
    adding && jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }, children: [
      jsxs('div', { style: { display: 'flex', gap: 4 }, children: [
        jsx('input', {
          value: newName,
          autoFocus: true,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value),
          onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') createWorkspace(); if (e.key === 'Escape') setAdding(false); },
          placeholder: '工作区名称',
          style: { flex: 1, boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontSize: 13, outline: 'none' },
        }),
        jsx('button', { onClick: createWorkspace, style: primaryBtnStyle, children: '创建' }),
      ] }),
      addError && jsx('div', { style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 }, children: addError }),
    ] }),

    jsx('div', { style: { flex: 1, overflowY: 'auto', minHeight: 0 }, children: [
      loadingW
        ? jsx('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, padding: '12px 8px', textAlign: 'center' }, children: '加载中…' })
        : shown.map((w) => jsx(WorkspaceItem, {
            key: w.path,
            workspace: w,
            sessions,
            onOpen: (id: string) => { if (ctx.sessions?.open) ctx.sessions.open(id); },
            onDelete: () => deleteWorkspace(w),
          })),
      !loadingW && shown.length === 0 && jsx('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, padding: '12px 8px', textAlign: 'center' }, children: '暂无工作区，点击右上角 ＋ 新建' }),
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
    const sessions = useSessionSnapshot(ctx);
    return jsx(WorkspaceBrowser, {
      ctx,
      identity,
      sessions,
      onChanged: () => {},
    });
  }));

  // 退出登录入口（settings.action list，右上角按钮）
  ctx.slots.inject('settings.action', () => ctx.slots.register({
    name: 'settings.action',
    id: 'multi-user-logout',
    order: 100,
  }, function LogoutAction() {
    const identity = useIdentity();
    if (!identity.userId) return null;
    return jsx('button', {
      type: 'button',
      onClick: async () => {
        await api('POST', '/api/mu/auth/logout');
        location.href = '/';
      },
      style: {
        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
        height: 32, padding: '0 12px', borderRadius: 8,
        border: '1px solid var(--dsw-alias-state-error-primary)',
        background: 'transparent', color: 'var(--dsw-alias-state-error-primary)',
        fontSize: 12, fontWeight: 500,
      },
      children: `退出登录（${identity.username ?? ''}）`,
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
  workspaceRoot?: string;
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
  const isOwner = identity.role === 'owner';
  const [users, setUsers] = React.useState<AdminUserView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  // 新建表单（仅主管理员）
  const [newUsername, setNewUsername] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');

  // 改自己密码
  const [oldPw, setOldPw] = React.useState('');
  const [newPw, setNewPw] = React.useState('');

  const reload = React.useCallback(() => {
    setLoading(true);
    fetch('/api/mu/admin/users', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load users failed'))))
      .then((list) => { setUsers(Array.isArray(list) ? list : []); setLoading(false); })
      .catch(() => { setError('加载用户列表失败'); setLoading(false); });
  }, []);

  React.useEffect(() => { if (isOwner) reload(); }, [reload, isOwner]);

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 3000); };

  const createUser = async () => {
    const username = newUsername.trim();
    if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) { setError('用户名需为 2-32 位字母/数字/_.-'); return; }
    if (newPassword.length < 6) { setError('初始密码至少 6 位'); return; }
    const r = await api('POST', '/api/mu/admin/users', { username, initialPassword: newPassword });
    if (r.json.ok) {
      setNewUsername(''); setNewPassword('');
      setError(null); flash(`已创建用户 ${username}，专属目录：${r.json.workspaceRoot ?? '(自动分配)'}`);
      reload();
    } else {
      setError(r.json.error || '创建失败');
    }
  };

  const changeSelfPassword = async () => {
    if (newPw.length < 6) { setError('新密码至少 6 位'); return; }
    const r = await api('POST', '/api/mu/me/password', { oldPassword: oldPw, newPassword: newPw });
    if (r.json.ok) { setOldPw(''); setNewPw(''); setError(null); flash('密码已修改'); }
    else setError(r.json.error || '修改失败');
  };

  const toggleStatus = async (u: AdminUserView) => {
    const status = u.status === 'active' ? 'disabled' : 'active';
    await api('POST', '/api/mu/admin/users/update', { userId: u.id, status });
    reload();
  };

  const resetPassword = async (u: AdminUserView) => {
    const pw = prompt(`为 ${u.username} 设置新密码（至少 6 位）：`, '');
    if (pw === null) return;
    if (pw.length < 6) { setError('密码至少 6 位'); return; }
    const r = await api('POST', '/api/mu/admin/users/reset-password', { userId: u.id, password: pw });
    if (r.json.ok) flash(`已重置 ${u.username} 的密码`); else setError(r.json.error || '重置失败');
  };

  const deleteUser = async (u: AdminUserView) => {
    if (!confirm(`确定删除用户 ${u.username}？其账号将停用，专属目录保留。`)) return;
    await api('POST', '/api/mu/admin/users/delete', { userId: u.id });
    reload();
  };

  // 状态标签（问题 5：已停用用错误色）
  const statusTag = (u: AdminUserView) => {
    if (u.role === 'owner') return jsx('span', { style: { marginLeft: 8, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }, children: '主管理员' });
    if (u.status === 'disabled') return jsx('span', { style: { marginLeft: 8, fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' }, children: '已停用' });
    return jsx('span', { style: { marginLeft: 8, fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }, children: '子用户' });
  };

  const userList = loading
    ? jsx('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 13 }, children: '加载中…' })
    : jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: users.map((u) => jsxs('div', {
        key: u.id,
        style: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10 },
        children: [
          jsx('div', { style: { flex: 1, minWidth: 0 }, children: jsxs('div', { children: [
            jsxs('div', { children: [
              jsx('span', { style: { fontSize: 14, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }, children: u.displayName || u.username }),
              statusTag(u),
            ] }),
            u.workspaceRoot && jsx('div', { style: { marginTop: 2, fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', fontFamily: 'var(--ds-font-family-code, monospace)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: u.workspaceRoot }),
          ] }) }),
          u.role !== 'owner' && jsx('button', { onClick: () => resetPassword(u), style: btnStyle, children: '重置密码' }),
          u.role !== 'owner' && jsx('button', { onClick: () => toggleStatus(u), style: btnStyle, children: u.status === 'active' ? '停用' : '启用' }),
          u.role !== 'owner' && jsx('button', { onClick: () => deleteUser(u), style: dangerBtnStyle, children: '删除' }),
        ],
      })) });

  return jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720, padding: '0 4px' }, children: [
    jsx('h3', { style: { margin: 0, fontSize: 16, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }, children: '用户管理' }),
    jsx('p', { style: { margin: 0, fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }, children: '每个用户拥有一个专属工作区目录（按用户自动生成，互不重复）。用户只能看到自己专属目录内的工作区与会话。' }),

    // 修改自己的密码（所有登录用户可用，问题 3）
    jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12 }, children: [
      jsx('div', { style: { fontSize: 14, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }, children: '修改我的密码' }),
      jsxs('div', { style: { display: 'flex', gap: 8 }, children: [
        jsx('input', { value: oldPw, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setOldPw(e.target.value), placeholder: '当前密码', type: 'password', style: inputStyle }),
        jsx('input', { value: newPw, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setNewPw(e.target.value), placeholder: '新密码（≥6位）', type: 'password', style: inputStyle }),
      ] }),
      jsx('div', { children: jsx('button', { onClick: changeSelfPassword, style: primaryBtnStyle, children: '修改密码' }) }),
    ] }),

    // 新建子用户（仅主管理员）
    isOwner && jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12 }, children: [
      jsx('div', { style: { fontSize: 14, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }, children: '新建子用户' }),
      jsxs('div', { style: { display: 'flex', gap: 8 }, children: [
        jsx('input', { value: newUsername, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setNewUsername(e.target.value), placeholder: '用户名', style: inputStyle }),
        jsx('input', { value: newPassword, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value), placeholder: '初始密码（≥6位）', type: 'password', style: inputStyle }),
      ] }),
      jsx('div', { children: jsx('button', { onClick: createUser, style: primaryBtnStyle, children: '创建用户' }) }),
    ] }),

    // 用户列表（仅主管理员）
    isOwner && userList,

    error && jsx('div', { style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }, children: error }),
    notice && jsx('div', { style: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 13 }, children: notice }),
  ] });
}
