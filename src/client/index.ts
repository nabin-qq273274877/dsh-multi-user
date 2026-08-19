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
}
