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
import { IconSearchOutline16, IconPersonalizationOutline16, IconProjectAddOutline16, IconCloseFill14, IconFolderClose16, IconFolderOpen16, IconTriangleRightFill14, IconEllipsisOutline16, IconPlusOutline16, IconEditOutline16, IconTrashOutline16, IconChevronRightOutline14, IconCheckOutline16, Button, Menu, Modal } from '@deepseek-ai/dsh-client-ui-primitives';

export const inject = ['slots', 'workspaces', 'sessions', 'locale'];

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

/** 原生工作区视图（来自 ctx.workspaces.list）。 */
interface WorkspaceView {
  workspaceId: string;
  path: string;
  title: string;
  sessionIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceListState {
  items: WorkspaceView[];
  archivedSessionIds: string[];
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

/** 专属目录只做视图过滤：只显示 path 落在专属目录内的工作区（主管理员也过滤）。 */
function filterWorkspaces(items: WorkspaceView[], identity: Identity): WorkspaceView[] {
  if (!identity.userId) return [];
  if (identity.workspaceRoot == null) return items; // 专属目录尚未加载，先展示全量避免闪烁
  const root = normalizePath(identity.workspaceRoot);
  return items.filter((w) => isUnder(root, w.path));
}

/* ---------------- UI 组件 ---------------- */

// 对齐原生 ui-workspace 的行样式（Rows.module.css 尺寸）
const workspaceRowStyle: CSSProperties = {
  boxSizing: 'border-box', display: 'flex', alignItems: 'center', width: '100%',
  height: 34, background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 14,
  padding: '0 8px', borderRadius: 8, gap: 6, textAlign: 'left',
};
const sessionRowStyle: CSSProperties = {
  boxSizing: 'border-box', display: 'flex', alignItems: 'center', width: '100%',
  height: 32, background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 14,
  padding: '0 8px', borderRadius: 8, gap: 6, textAlign: 'left',
};
// header 图标按钮（搜索/视图/添加），对齐原生 iconButton
const iconBtnStyle: CSSProperties = {
  cursor: 'pointer', width: 28, height: 28, flex: 'none',
  color: 'var(--dsw-alias-label-secondary)', background: 'transparent',
  border: 'none', borderRadius: '50%', display: 'inline-flex',
  justifyContent: 'center', alignItems: 'center', padding: 0, fontSize: 16,
};
// 行内小图标按钮（hover 显示的菜单/加号），对齐原生
const rowIconBtnStyle: CSSProperties = {
  cursor: 'pointer', width: 28, height: 28, flex: 'none',
  color: 'var(--dsw-alias-label-secondary)', background: 'transparent',
  border: 'none', borderRadius: '50%', display: 'inline-flex',
  justifyContent: 'center', alignItems: 'center', padding: 0,
};
// 图标槽位（文件夹/chevron），对齐原生 slot（16px 宽）
const slotStyle: CSSProperties = {
  width: 16, height: 20, flex: 'none',
  display: 'inline-flex', justifyContent: 'center', alignItems: 'center',
  color: 'var(--dsw-alias-label-tertiary)',
};

function SessionRow({ session, onOpen }: { session: SessionSummary; onOpen: (id: string) => void }) {
  return jsxs('button', {
    type: 'button',
    onClick: () => onOpen(session.id),
    style: { ...sessionRowStyle, paddingLeft: 30 },
    children: [
      jsx('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }, children: session.title || session.displayTitle || session.id }),
    ],
  });
}

function WorkspaceItem({ workspace, sessions, onOpen, onDelete, onRename, onStartSession }: { workspace: WorkspaceView; sessions: SessionSummary[]; onOpen: (id: string) => void; onDelete: () => void; onRename: () => void; onStartSession: () => void }) {
  const [expanded, setExpanded] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  // 会话按工作区自带的 sessionIds（原生已按 cwd 过滤）+ cwd 落在目录内双保险
  const members = sessions.filter((s) => (workspace.sessionIds.includes(s.id)) || (s.cwd && isUnder(workspace.path, s.cwd)));

  const menuItems = [
    { id: 'rename', label: '重命名', icon: jsx(IconEditOutline16, {}) },
    { id: 'delete', label: '删除工作区', icon: jsx(IconTrashOutline16, {}), danger: true },
  ];

  return jsxs('div', { style: { marginBottom: 2 }, children: [
    jsxs('div', {
      role: 'treeitem',
      'aria-expanded': expanded,
      onClick: () => setExpanded((v) => !v),
      style: workspaceRowStyle,
      children: [
        jsx('span', { style: slotStyle, children: expanded ? jsx(IconFolderOpen16, {}) : jsx(IconFolderClose16, {}) }),
        jsx('span', { style: { ...slotStyle, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }, children: jsx(IconTriangleRightFill14, {}) }),
        jsx('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: workspace.title || workspace.path }),
        // 右侧操作（hover 显示：重命名/删除菜单 + 新建会话）
        jsxs('span', {
          style: { display: 'flex', alignItems: 'center', gap: 0, flex: 'none' },
          children: [
            jsx(Menu, {
              open: menuOpen,
              onClose: () => setMenuOpen(false),
              items: menuItems,
              onSelect: (id: string) => { setMenuOpen(false); if (id === 'rename') onRename(); else if (id === 'delete') onDelete(); },
              portal: true,
              closeOnPointerLeave: true,
              anchor: jsx('button', {
                type: 'button',
                'aria-label': `工作区 ${workspace.title || workspace.path} 操作`,
                onClick: (e: React.MouseEvent) => { e.stopPropagation(); setMenuOpen((v) => !v); },
                style: rowIconBtnStyle,
                children: jsx(IconEllipsisOutline16, {}),
              }),
            }),
            jsx('button', {
              type: 'button',
              'aria-label': '新建会话',
              onClick: (e: React.MouseEvent) => { e.stopPropagation(); onStartSession(); },
              style: rowIconBtnStyle,
              children: jsx(IconPlusOutline16, {}),
            }),
          ],
        }),
      ],
    }),
    expanded && members.map((s) => jsx(SessionRow, { key: s.id, session: s, onOpen })),
  ] });
}

function WorkspaceBrowser({ ctx, identity, sessions }: { ctx: any; identity: Identity; sessions: SessionSummary[] }) {
  const workspaceSnap = useWorkspaceSnapshot(ctx);
  const [query, setQuery] = React.useState('');
  const [searchExpanded, setSearchExpanded] = React.useState(false);
  const [groupBy, setGroupBy] = React.useState<'workspace' | 'flat'>('workspace');
  const [orderBy, setOrderBy] = React.useState<'manual' | 'updated'>('updated');
  const [viewMenuOpen, setViewMenuOpen] = React.useState(false);
  const [addFlowOpen, setAddFlowOpen] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const addBtnRef = React.useRef<HTMLButtonElement>(null);

  const filtered = filterWorkspaces(workspaceSnap.items || [], identity);
  const q = query.trim().toLowerCase();
  const shown = q ? filtered.filter((w) => (w.title || '').toLowerCase().includes(q) || (w.path || '').toLowerCase().includes(q)) : filtered;
  if (orderBy === 'updated') shown.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  // 新建工作区：打开 browse 目录选择器（renderSlot directoryFlow），选完 createWorkspace
  const openAddFlow = () => { setViewMenuOpen(false); setAddFlowOpen(true); };
  const closeAddFlow = () => setAddFlowOpen(false);

  const deleteWorkspace = async (w: WorkspaceView) => {
    if (!confirm(`删除工作区「${w.title || w.path}」？仅移除工作区记录，目录与会话数据保留。`)) return;
    try {
      await ctx.workspaces.delete(w.workspaceId);
    } catch (err) {
      alert(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const renameWorkspace = async (w: WorkspaceView) => {
    const title = prompt('重命名工作区：', w.title || w.path);
    if (title === null) return;
    if (!title.trim()) return;
    try {
      await ctx.workspaces.rename(w.workspaceId, title.trim());
    } catch (err) {
      alert(`重命名失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return jsxs('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '0 4px' }, children: [
    // header：左侧「工作区」文字，右侧 搜索/视图/添加 三按钮（对齐原生）
    jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 4, height: 36, margin: '2px -4px 4px', padding: '0 4px' }, children: [
      jsx('span', { style: { flex: 'none', maxWidth: searchExpanded ? 0 : '45%', marginRight: searchExpanded ? 0 : 'auto', opacity: searchExpanded ? 0 : 1, visibility: searchExpanded ? 'hidden' : 'visible', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', lineHeight: '20px', transition: 'max-width .18s ease, opacity .12s ease, margin-right .18s ease' }, children: groupBy === 'flat' ? '会话' : '工作区' }),

      // 搜索：同一容器，放大镜始终在左，输入框 width 0→100% 过渡（照抄原生）
      jsxs('div', {
        onClick: () => { setAddFlowOpen(false); setSearchExpanded(true); requestAnimationFrame(() => searchInputRef.current?.focus()); },
        style: {
          flex: searchExpanded ? 1 : 'none',
          minWidth: 0,
          display: 'flex', alignItems: 'center',
          height: searchExpanded ? 30 : 28,
          width: searchExpanded ? '100%' : 28,
          border: searchExpanded ? '1px solid var(--dsw-alias-border-l2)' : 'none',
          borderRadius: searchExpanded ? 10 : '50%',
          padding: searchExpanded ? '0 4px 0 4px' : 0,
          overflow: 'hidden',
          transition: 'width .18s ease, padding .18s ease, border-color .18s ease',
        },
        children: [
          jsx('button', {
            type: 'button',
            title: '搜索会话',
            onClick: (e: React.MouseEvent) => { e.stopPropagation(); setAddFlowOpen(false); setSearchExpanded(true); requestAnimationFrame(() => searchInputRef.current?.focus()); },
            style: iconBtnStyle,
            children: jsx(IconSearchOutline16, { size: searchExpanded ? 11 : 14 }),
          }),
          jsx('input', {
            ref: searchInputRef,
            value: query,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
            onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Escape') { setQuery(''); setSearchExpanded(false); } },
            placeholder: '搜索会话…',
            style: {
              flex: 1, minWidth: 0,
              width: searchExpanded ? 'auto' : 0,
              opacity: searchExpanded ? 1 : 0,
              pointerEvents: searchExpanded ? 'auto' : 'none',
              background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--dsw-alias-label-primary)', fontSize: 13, lineHeight: '18px',
              transition: 'opacity .12s ease',
            },
          }),
          searchExpanded && jsx('button', { type: 'button', title: '清除搜索', onClick: (e: React.MouseEvent) => { e.stopPropagation(); setQuery(''); setSearchExpanded(false); }, style: iconBtnStyle, children: jsx(IconCloseFill14, {}) }),
        ],
      }),

      // 视图：分组/排序菜单（照抄 ViewOptionsMenu；搜索展开时隐藏）
      !searchExpanded && jsx(Menu, {
        open: viewMenuOpen,
        onClose: () => setViewMenuOpen(false),
        align: 'end',
        dense: true,
        portal: true,
        selectedIds: [groupBy, orderBy],
        items: [
          { type: 'label', id: 'group-by', text: '分组' },
          { id: 'workspace', label: '按工作区' },
          { id: 'flat', label: '平铺会话' },
          { type: 'separator', id: 'order-by-sep' },
          { type: 'label', id: 'order-by', text: '排序' },
          { id: 'manual', label: '手动' },
          { id: 'updated', label: '最近更新' },
        ],
        onSelect: (id: string) => {
          if (id === 'workspace' || id === 'flat') setGroupBy(id);
          else if (id === 'manual' || id === 'updated') setOrderBy(id);
          setViewMenuOpen(false);
        },
        anchor: jsx('button', { type: 'button', title: '视图', onClick: () => setViewMenuOpen((v) => !v), style: iconBtnStyle, children: jsx(IconPersonalizationOutline16, {}) }),
      }),

      // 添加：打开目录选择器（browse；搜索展开时隐藏）
      !searchExpanded && jsx('button', { ref: addBtnRef, type: 'button', title: '新建工作区', onClick: openAddFlow, style: iconBtnStyle, children: jsx(IconProjectAddOutline16, { size: 16 }) }),
    ] }),

    // 目录选择器（browse 能力，Modal 弹出）
    jsx(DirectoryPicker, {
      ctx,
      open: addFlowOpen,
      initialPath: identity.workspaceRoot ?? undefined,
      onPick: async (path: string) => {
        try { await ctx.workspaces.create({ path }); } catch (err) { alert(`添加工作区失败：${err instanceof Error ? err.message : String(err)}`); }
        closeAddFlow();
      },
      onCancel: closeAddFlow,
    }),

    jsx('div', { style: { flex: 1, overflowY: 'auto', minHeight: 0 }, children: [
      shown.map((w) => jsx(WorkspaceItem, {
        key: w.workspaceId,
        workspace: w,
        sessions,
        onOpen: (id: string) => { if (ctx.sessions?.open) ctx.sessions.open(id); },
        onDelete: () => deleteWorkspace(w),
        onRename: () => renameWorkspace(w),
        onStartSession: () => { if (ctx.workspaces?.startSession) ctx.workspaces.startSession(w.workspaceId); },
      })),
      shown.length === 0 && jsx('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, padding: '12px 8px', textAlign: 'center' }, children: identity.loading ? '加载中…' : '暂无工作区，点击右上角添加目录' }),
    ] }),
  ] });
}

/* ---------------- 目录选择器（browse 能力，Miller columns，Modal 弹出） ---------------- */

interface DirectoryEntry {
  name: string;
  path: string;
  hidden?: boolean;
}
interface DirectoryListing {
  path: string;
  home: string;
  crumbs: DirectoryEntry[];
  entries: DirectoryEntry[];
  truncated: boolean;
}

/** 目录选择模态框：Miller 多列 + 面包屑 + 新建文件夹 + 打开（对齐原生 browse 选择器）。 */
function DirectoryPicker({ ctx, open, initialPath, onPick, onCancel }: { ctx: any; open: boolean; initialPath?: string; onPick: (path: string) => void; onCancel: () => void }) {
  // 两列递归导航（对齐原生）：parent = 父目录，selected = 选中的条目，child = 选中目录的内容
  const [parent, setParent] = React.useState<DirectoryListing | null>(null);
  const [selected, setSelected] = React.useState<DirectoryEntry | null>(null);
  const [child, setChild] = React.useState<DirectoryListing | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showHidden, setShowHidden] = React.useState(false);
  // 新建文件夹子对话框
  const [folderDraft, setFolderDraft] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  // 路径编辑（铅笔图标 → 可编辑输入框）
  const [pathDraft, setPathDraft] = React.useState<string | null>(null);
  const pathInputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback((path?: string) => {
    setError(null);
    return ctx.workspaces.listDirectory(path).catch((e: Error) => { setError(e.message || '无法列出目录'); return null; });
  }, [ctx]);

  // 打开时重置：加载初始目录作为父目录
  React.useEffect(() => {
    if (!open) return;
    setParent(null);
    setSelected(null);
    setChild(null);
    setShowHidden(false);
    setFolderDraft(null);
    setCreateError(null);
    setPathDraft(null);
    load(initialPath).then((listing: DirectoryListing | null) => { if (listing) setParent(listing); });
  }, [open, load, initialPath]);

  // 点父列的某个目录 → 选中它，加载其内容到右列
  const selectEntry = async (entry: DirectoryEntry) => {
    setSelected(entry);
    const listing = await load(entry.path);
    setChild(listing);
  };

  // 点右列（子目录）里的某个目录 → 把它提升为父列，清空选中，右列消失
  const advance = async (entry: DirectoryEntry) => {
    const listing = await load(entry.path);
    if (!listing) return;
    setParent(listing);
    setSelected(null);
    setChild(null);
  };

  // 点面包屑 → 回到该层级
  const navigateTo = async (path: string) => {
    // 如果 path 是 parent 的 path，清空选中回到单列
    if (parent && path === parent.path) {
      setSelected(null);
      setChild(null);
      return;
    }
    // 否则直接加载该路径为父目录
    const listing = await load(path);
    if (listing) { setParent(listing); setSelected(null); setChild(null); }
  };

  // 路径编辑：提交输入框里的路径
  const commitPathDraft = async () => {
    const p = (pathDraft ?? '').trim();
    setPathDraft(null);
    if (p === '') return;
    const listing = await load(p);
    if (listing) { setParent(listing); setSelected(null); setChild(null); }
  };

  const confirmCreate = async () => {
    const name = (folderDraft ?? '').trim();
    if (!name) return;
    // 新建到「当前打开的目标」：优先选中的目录，否则父目录
    const target = selected?.path ?? parent?.path;
    if (!target) return;
    setCreating(true);
    try {
      await ctx.workspaces.createDirectory(target, name);
      setFolderDraft(null);
      setCreateError(null);
      const listing = await load(target);
      if (listing) {
        // 新建后刷新：如果新建在选中的子目录里，刷新 child；否则刷新 parent
        if (selected && target === selected.path) setChild(listing);
        else setParent(listing);
      }
    } catch (e) {
      setCreateError((e as Error).message || '新建文件夹失败');
    } finally {
      setCreating(false);
    }
  };

  // 面包屑：显示当前最深层的 crumbs（选中子目录时用 child 的 crumbs，否则 parent 的）
  const crumbs = (selected && child ? child.crumbs : (parent?.crumbs ?? []));
  // 路径编辑的当前目录
  const currentDir = selected?.path ?? parent?.path ?? '';
  // 「打开」目标：当前选中的目录，否则父目录
  const targetPath = selected?.path ?? parent?.path ?? null;

  // 单列渲染函数
  const renderColumn = (listing: DirectoryListing, isChildCol: boolean) => {
    return jsxs('div', { role: 'list', style: { flex: '1 1 0', minWidth: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }, children: [
      ...listing.entries.filter((e) => showHidden || !e.hidden).map((e) => {
        const isSel = selected?.path === e.path;
        return jsxs('button', {
          type: 'button',
          key: e.path,
          role: 'listitem',
          onClick: () => isChildCol ? advance(e) : selectEntry(e),
          style: {
            display: 'flex', alignItems: 'center', gap: 4, width: '100%', height: 28,
            background: isSel ? 'var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover))' : 'transparent',
            border: 'none', borderRadius: 6, cursor: 'pointer', padding: 4, textAlign: 'left',
          },
          children: [
            isSel
              ? jsx(IconFolderOpen16, { size: 16, style: { color: 'var(--dsw-alias-button-info-fill)', flex: 'none' } })
              : jsx(IconFolderClose16, { size: 16, style: { color: 'var(--dsw-alias-label-secondary)', flex: 'none' } }),
            jsx('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--dsw-alias-label-primary)', fontSize: 13, fontWeight: 500 }, children: e.name }),
            jsx(IconChevronRightOutline14, { size: 12, style: { color: 'var(--dsw-alias-label-tertiary)', flex: 'none' } }),
          ],
        });
      }),
      listing.entries.filter((e) => showHidden || !e.hidden).length === 0 && jsx('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, padding: '8px 4px' }, children: '（空目录）' }),
    ] });
  };

  return jsxs(Modal, {
    open,
    onClose: onCancel,
    title: '选择工作区目录',
    closeLabel: '取消',
    className: 'dsh-mu-dirpicker',
    headless: true,
    children: [
      jsxs('div', { style: { display: 'flex', flexDirection: 'column', height: 'min(500px, 100dvh - 32px)' }, children: [
      // header：标题 + 面包屑
      jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 24px 8px', borderBottom: '1px solid var(--dsw-alias-border-l3)', flex: 'none' }, children: [
        jsx('h2', { style: { margin: 0, minHeight: 28, fontSize: 16, fontWeight: 510, lineHeight: '24px', color: 'var(--dsw-alias-label-primary)' }, children: '选择工作区目录' }),
        // 面包屑 / 路径编辑（铅笔图标切换）
        pathDraft === null
          ? jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 4, minHeight: 24, overflowX: 'auto' }, children: [
              ...crumbs.map((c, i) => jsxs(React.Fragment, { key: c.path, children: [
                i > 0 && jsx(IconChevronRightOutline14, { size: 12, style: { color: 'var(--dsw-alias-label-tertiary)', flex: 'none' } }),
                jsx('button', { type: 'button', onClick: () => navigateTo(c.path), style: { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, fontWeight: 500, padding: 0, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: c.name }),
              ] })),
              jsx('button', { type: 'button', title: '编辑路径', onClick: () => { const sep = currentDir.includes('/') ? '/' : '\\'; setPathDraft(currentDir.endsWith(sep) ? currentDir : currentDir + sep); requestAnimationFrame(() => pathInputRef.current?.focus()); }, style: { display: 'inline-flex', alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dsw-alias-label-tertiary)', padding: 2, marginLeft: 4, flex: 'none' }, children: jsx(IconEditOutline16, { size: 14 }) }),
            ] })
          : jsx('input', {
              ref: pathInputRef,
              value: pathDraft,
              autoFocus: true,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => setPathDraft(e.target.value),
              onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') commitPathDraft(); if (e.key === 'Escape') setPathDraft(null); },
              onBlur: () => commitPathDraft(),
              'aria-label': '编辑路径',
              style: { boxSizing: 'border-box', width: '100%', minWidth: 0, height: 24, padding: '0 8px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontSize: 13, outline: 'none' },
            }),
      ] }),

      // content：两列（父列 + 选中的子列）
      jsxs('div', { style: { display: 'flex', flex: 1, gap: 12, padding: '16px 24px', minHeight: 0, overflow: 'hidden' }, children: [
        parent === null
          ? jsx('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, padding: '24px 0' }, children: '加载目录…' })
          : renderColumn(parent, false),
        selected !== null && jsx('span', { style: { width: 1, flex: 'none', background: 'var(--dsw-alias-border-l3)' } }),
        selected !== null && (child === null
          ? jsx('div', { style: { flex: '1 1 0', color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, padding: '24px 0' }, children: '加载目录…' })
          : renderColumn(child, true)),
      ] }),

      error && jsx('div', { role: 'alert', style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12, padding: '4px 24px' }, children: error }),

      // footer：新建文件夹 + 显示隐藏 + 取消 + 打开
      jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '16px 24px', borderTop: '1px solid var(--dsw-alias-border-l3)', flex: 'none' }, children: [
        jsx(Button, { variant: 'outline', size: 'sm', icon: jsx(IconPlusOutline16, { size: 14 }), disabled: parent === null, onClick: () => { setFolderDraft(''); setCreateError(null); }, children: '新建文件夹' }),
        jsxs('button', { type: 'button', 'aria-pressed': showHidden, onClick: () => setShowHidden((v) => !v), style: { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: showHidden ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)', fontSize: 13, fontWeight: 500, padding: 0, whiteSpace: 'nowrap' }, children: [
          '显示隐藏文件',
          showHidden && jsx(IconCheckOutline16, { size: 14 }),
        ] }),
        jsx('span', { style: { flex: 1 } }),
        jsx(Button, { variant: 'outline', size: 'sm', onClick: onCancel, children: '取消' }),
        jsx(Button, { variant: 'primary', size: 'sm', disabled: targetPath === null, onClick: () => { if (targetPath) onPick(targetPath); }, children: '打开' }),
      ] }),
      ] }),
      // 新建文件夹子对话框
      jsx(Modal, {
      open: folderDraft !== null,
      onClose: () => { if (!creating) setFolderDraft(null); },
      title: '新建文件夹',
      closeLabel: '取消',
      headless: true,
      children: jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, padding: '22px 24px 20px' }, children: [
        jsx('h3', { style: { margin: 0, fontSize: 16, fontWeight: 510, color: 'var(--dsw-alias-label-primary)' }, children: '新建文件夹' }),
        jsx('p', { style: { margin: 0, fontSize: 14, color: 'var(--dsw-alias-label-primary)' }, children: `在「${targetPath ?? ''}」中新建文件夹` }),
        jsx('input', {
          value: folderDraft ?? '',
          autoFocus: true,
          disabled: creating,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setFolderDraft(e.target.value),
          onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') { if (!creating) setFolderDraft(null); } },
          placeholder: '未命名文件夹',
          style: { boxSizing: 'border-box', width: '100%', height: 44, padding: '7px 14px', borderRadius: 22, border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'var(--dsw-alias-label-primary)', fontSize: 14, outline: 'none' },
        }),
        createError && jsx('div', { style: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 }, children: createError }),
        jsxs('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }, children: [
          jsx(Button, { variant: 'outline', size: 'sm', onClick: () => { if (!creating) setFolderDraft(null); }, children: '取消' }),
          jsx(Button, { variant: 'primary', size: 'sm', disabled: creating || !(folderDraft ?? '').trim(), onClick: confirmCreate, children: '创建' }),
        ] }),
      ] }),
      }),
    ],
  });
}

/* ---------------- 插件 body ---------------- */

// 目录选择器弹窗宽度样式（Modal 的 className 是 CSS 类名，注入样式对齐原生 680px 宽）
const DIRPICKER_CSS = `.dsh-mu-dirpicker.dsh-mu-dirpicker{width:min(680px,100%);max-width:calc(100vw - 32px);padding:0;gap:0}`;

function injectDirPickerCss(): void {
  if (typeof document === 'undefined') return;
  const tagId = 'dsh-multi-user/dir-picker.css';
  if (document.querySelector(`style[data-plugin-css="${tagId}"]`)) return;
  const style = document.createElement('style');
  style.dataset.plugin = 'dsh-multi-user';
  style.dataset.pluginCss = tagId;
  style.textContent = DIRPICKER_CSS;
  document.head.appendChild(style);
}

export function apply(ctx: any): void {
  injectDirPickerCss();
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
    });
  }));

  // 退出登录入口（settings.action list，右上角按钮，与「打开配置文件」同为 outline sm）
  ctx.slots.inject('settings.action', () => ctx.slots.register({
    name: 'settings.action',
    id: 'multi-user-logout',
    order: 100,
  }, function LogoutAction() {
    const identity = useIdentity();
    if (!identity.userId) return null;
    return jsx(Button, {
      variant: 'outline',
      size: 'sm',
      onClick: async () => {
        await api('POST', '/api/mu/auth/logout');
        location.href = '/';
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
