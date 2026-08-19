window.__ModuleLoader__.load({
	id: "dsh-multi-user",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		"use strict";
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
		  for (var name in all)
		    __defProp(target, name, { get: all[name], enumerable: true });
		};
		var __copyProps = (to, from, except, desc) => {
		  if (from && typeof from === "object" || typeof from === "function") {
		    for (let key of __getOwnPropNames(from))
		      if (!__hasOwnProp.call(to, key) && key !== except)
		        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
		  }
		  return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
		  // If the importer is in node compatibility mode or this is not an ESM
		  // file that has been converted to a CommonJS file using a Babel-
		  // compatible transform (i.e. "__esModule" has not been set), then set
		  // "default" to the CommonJS "module.exports" for node compatibility.
		  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
		  mod
		));
		var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

		// src/client/index.ts
		var index_exports = {};
		__export(index_exports, {
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(index_exports);
		var React = __toESM(require("react"), 1);
		var import_jsx_runtime = require("react/jsx-runtime");
		var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		var inject = ["slots", "workspaces", "sessions", "locale"];
		function normalizePath(p) {
		  return String(p || "").replace(/[/\\]+$/, "").replace(/\\/g, "/");
		}
		function isUnder(root, child) {
		  const r = normalizePath(root);
		  const c = normalizePath(child);
		  return c === r || c.startsWith(r + "/");
		}
		async function api(method, path, body) {
		  const init = { method, credentials: "same-origin" };
		  if (body !== void 0) {
		    init.headers = { "content-type": "application/json" };
		    init.body = JSON.stringify(body);
		  }
		  const r = await fetch(path, init);
		  const json = await r.json().catch(() => ({}));
		  return { status: r.status, json };
		}
		function useIdentity() {
		  const [identity, setIdentity] = React.useState(() => ({
		    userId: null,
		    username: null,
		    role: null,
		    workspaceRoot: null,
		    loading: true
		  }));
		  React.useEffect(() => {
		    let cancelled = false;
		    fetch("/api/mu/me/grants", { credentials: "same-origin" }).then((r) => {
		      if (r.status === 401) return { userId: null, role: null, workspaceRoot: null };
		      if (!r.ok) throw new Error("grants failed");
		      return r.json();
		    }).then((data) => {
		      if (cancelled) return;
		      setIdentity({
		        userId: data.userId ?? null,
		        username: data.username ?? null,
		        role: data.role ?? null,
		        workspaceRoot: typeof data.workspaceRoot === "string" ? data.workspaceRoot : null,
		        loading: false
		      });
		    }).catch(() => {
		      if (cancelled) return;
		      setIdentity({ userId: null, username: null, role: null, workspaceRoot: null, loading: false });
		    });
		    return () => {
		      cancelled = true;
		    };
		  }, []);
		  return identity;
		}
		function useSessionSnapshot(ctx) {
		  const list = ctx.sessions?.list;
		  const [snap, setSnap] = React.useState(() => {
		    if (list && typeof list.getSnapshot === "function") return list.getSnapshot();
		    return { ids: [], byId: {}, phase: "pending" };
		  });
		  React.useEffect(() => {
		    if (!list || typeof list.subscribe !== "function") return;
		    const unsub = list.subscribe(() => setSnap(list.getSnapshot()));
		    return unsub;
		  }, [list]);
		  const byId = snap.byId || {};
		  const ids = snap.ids || [];
		  return ids.map((id) => byId[id]).filter((s) => !!s);
		}
		function useWorkspaceSnapshot(ctx) {
		  const list = ctx.workspaces?.list;
		  const [snap, setSnap] = React.useState(() => {
		    if (list && typeof list.getSnapshot === "function") return list.getSnapshot();
		    return { items: [], archivedSessionIds: [] };
		  });
		  React.useEffect(() => {
		    if (!list || typeof list.subscribe !== "function") return;
		    const unsub = list.subscribe(() => setSnap(list.getSnapshot()));
		    return unsub;
		  }, [list]);
		  return snap;
		}
		function filterWorkspaces(items, identity) {
		  if (!identity.userId) return [];
		  if (identity.workspaceRoot == null) return items;
		  const root = normalizePath(identity.workspaceRoot);
		  return items.filter((w) => isUnder(root, w.path));
		}
		var workspaceRowStyle = {
		  boxSizing: "border-box",
		  display: "flex",
		  alignItems: "center",
		  width: "100%",
		  height: 34,
		  background: "transparent",
		  border: "none",
		  cursor: "pointer",
		  color: "var(--dsw-alias-label-primary)",
		  font: "inherit",
		  fontSize: 14,
		  padding: "0 8px",
		  borderRadius: 8,
		  gap: 6,
		  textAlign: "left"
		};
		var sessionRowStyle = {
		  boxSizing: "border-box",
		  display: "flex",
		  alignItems: "center",
		  width: "100%",
		  height: 32,
		  background: "transparent",
		  border: "none",
		  cursor: "pointer",
		  color: "var(--dsw-alias-label-primary)",
		  font: "inherit",
		  fontSize: 14,
		  padding: "0 8px",
		  borderRadius: 8,
		  gap: 6,
		  textAlign: "left"
		};
		var iconBtnStyle = {
		  cursor: "pointer",
		  width: 28,
		  height: 28,
		  flex: "none",
		  color: "var(--dsw-alias-label-secondary)",
		  background: "transparent",
		  border: "none",
		  borderRadius: "50%",
		  display: "inline-flex",
		  justifyContent: "center",
		  alignItems: "center",
		  padding: 0,
		  fontSize: 16
		};
		var rowIconBtnStyle = {
		  cursor: "pointer",
		  width: 28,
		  height: 28,
		  flex: "none",
		  color: "var(--dsw-alias-label-secondary)",
		  background: "transparent",
		  border: "none",
		  borderRadius: "50%",
		  display: "inline-flex",
		  justifyContent: "center",
		  alignItems: "center",
		  padding: 0
		};
		var slotStyle = {
		  width: 16,
		  height: 20,
		  flex: "none",
		  display: "inline-flex",
		  justifyContent: "center",
		  alignItems: "center",
		  color: "var(--dsw-alias-label-tertiary)"
		};
		function SessionRow({ session, onOpen }) {
		  return (0, import_jsx_runtime.jsxs)("button", {
		    type: "button",
		    onClick: () => onOpen(session.id),
		    style: { ...sessionRowStyle, paddingLeft: 30 },
		    children: [
		      (0, import_jsx_runtime.jsx)("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }, children: session.title || session.displayTitle || session.id })
		    ]
		  });
		}
		function WorkspaceItem({ workspace, sessions, onOpen, onDelete, onRename, onStartSession }) {
		  const [expanded, setExpanded] = React.useState(false);
		  const [menuOpen, setMenuOpen] = React.useState(false);
		  const members = sessions.filter((s) => workspace.sessionIds.includes(s.id) || s.cwd && isUnder(workspace.path, s.cwd));
		  const menuItems = [
		    { id: "rename", label: "\u91CD\u547D\u540D", icon: (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconEditOutline16, {}) },
		    { id: "delete", label: "\u5220\u9664\u5DE5\u4F5C\u533A", icon: (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconTrashOutline16, {}), danger: true }
		  ];
		  return (0, import_jsx_runtime.jsxs)("div", { style: { marginBottom: 2 }, children: [
		    (0, import_jsx_runtime.jsxs)("div", {
		      role: "treeitem",
		      "aria-expanded": expanded,
		      onClick: () => setExpanded((v) => !v),
		      style: workspaceRowStyle,
		      children: [
		        (0, import_jsx_runtime.jsx)("span", { style: slotStyle, children: expanded ? (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconFolderOpen16, {}) : (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconFolderClose16, {}) }),
		        (0, import_jsx_runtime.jsx)("span", { style: { ...slotStyle, transform: expanded ? "rotate(90deg)" : "none", transition: "transform .12s" }, children: (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconTriangleRightFill14, {}) }),
		        (0, import_jsx_runtime.jsx)("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: workspace.title || workspace.path }),
		        // 右侧操作（hover 显示：重命名/删除菜单 + 新建会话）
		        (0, import_jsx_runtime.jsxs)("span", {
		          style: { display: "flex", alignItems: "center", gap: 0, flex: "none" },
		          children: [
		            (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Menu, {
		              open: menuOpen,
		              onClose: () => setMenuOpen(false),
		              items: menuItems,
		              onSelect: (id) => {
		                setMenuOpen(false);
		                if (id === "rename") onRename();
		                else if (id === "delete") onDelete();
		              },
		              portal: true,
		              closeOnPointerLeave: true,
		              anchor: (0, import_jsx_runtime.jsx)("button", {
		                type: "button",
		                "aria-label": `\u5DE5\u4F5C\u533A ${workspace.title || workspace.path} \u64CD\u4F5C`,
		                onClick: (e) => {
		                  e.stopPropagation();
		                  setMenuOpen((v) => !v);
		                },
		                style: rowIconBtnStyle,
		                children: (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconEllipsisOutline16, {})
		              })
		            }),
		            (0, import_jsx_runtime.jsx)("button", {
		              type: "button",
		              "aria-label": "\u65B0\u5EFA\u4F1A\u8BDD",
		              onClick: (e) => {
		                e.stopPropagation();
		                onStartSession();
		              },
		              style: rowIconBtnStyle,
		              children: (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconPlusOutline16, {})
		            })
		          ]
		        })
		      ]
		    }),
		    expanded && members.map((s) => (0, import_jsx_runtime.jsx)(SessionRow, { key: s.id, session: s, onOpen }))
		  ] });
		}
		function WorkspaceBrowser({ ctx, identity, sessions }) {
		  const workspaceSnap = useWorkspaceSnapshot(ctx);
		  const [query, setQuery] = React.useState("");
		  const [searchExpanded, setSearchExpanded] = React.useState(false);
		  const [groupBy, setGroupBy] = React.useState("workspace");
		  const [orderBy, setOrderBy] = React.useState("updated");
		  const [viewMenuOpen, setViewMenuOpen] = React.useState(false);
		  const [addFlowOpen, setAddFlowOpen] = React.useState(false);
		  const searchInputRef = React.useRef(null);
		  const addBtnRef = React.useRef(null);
		  const filtered = filterWorkspaces(workspaceSnap.items || [], identity);
		  const q = query.trim().toLowerCase();
		  const shown = q ? filtered.filter((w) => (w.title || "").toLowerCase().includes(q) || (w.path || "").toLowerCase().includes(q)) : filtered;
		  if (orderBy === "updated") shown.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
		  const openAddFlow = () => {
		    setViewMenuOpen(false);
		    setAddFlowOpen(true);
		  };
		  const closeAddFlow = () => setAddFlowOpen(false);
		  const deleteWorkspace = async (w) => {
		    if (!confirm(`\u5220\u9664\u5DE5\u4F5C\u533A\u300C${w.title || w.path}\u300D\uFF1F\u4EC5\u79FB\u9664\u5DE5\u4F5C\u533A\u8BB0\u5F55\uFF0C\u76EE\u5F55\u4E0E\u4F1A\u8BDD\u6570\u636E\u4FDD\u7559\u3002`)) return;
		    try {
		      await ctx.workspaces.delete(w.workspaceId);
		    } catch (err) {
		      alert(`\u5220\u9664\u5931\u8D25\uFF1A${err instanceof Error ? err.message : String(err)}`);
		    }
		  };
		  const renameWorkspace = async (w) => {
		    const title = prompt("\u91CD\u547D\u540D\u5DE5\u4F5C\u533A\uFF1A", w.title || w.path);
		    if (title === null) return;
		    if (!title.trim()) return;
		    try {
		      await ctx.workspaces.rename(w.workspaceId, title.trim());
		    } catch (err) {
		      alert(`\u91CD\u547D\u540D\u5931\u8D25\uFF1A${err instanceof Error ? err.message : String(err)}`);
		    }
		  };
		  return (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", padding: "0 4px" }, children: [
		    // header：左侧「工作区」文字，右侧 搜索/视图/添加 三按钮（对齐原生）
		    (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 4, height: 36, margin: "2px -4px 4px", padding: "0 4px" }, children: [
		      (0, import_jsx_runtime.jsx)("span", { style: { flex: "none", maxWidth: "45%", marginRight: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "var(--dsw-alias-label-tertiary)", lineHeight: "20px" }, children: groupBy === "flat" ? "\u4F1A\u8BDD" : "\u5DE5\u4F5C\u533A" }),
		      // 搜索：同一容器，放大镜始终在左，输入框 width 0→100% 过渡（照抄原生）
		      (0, import_jsx_runtime.jsxs)("div", {
		        onClick: () => {
		          setAddFlowOpen(false);
		          setSearchExpanded(true);
		          requestAnimationFrame(() => searchInputRef.current?.focus());
		        },
		        style: {
		          flex: searchExpanded ? 1 : "none",
		          minWidth: 0,
		          display: "flex",
		          alignItems: "center",
		          height: searchExpanded ? 30 : 28,
		          width: searchExpanded ? "100%" : 28,
		          border: searchExpanded ? "1px solid var(--dsw-alias-border-l2)" : "none",
		          borderRadius: searchExpanded ? 10 : "50%",
		          padding: searchExpanded ? "0 4px 0 4px" : 0,
		          overflow: "hidden",
		          transition: "width .18s ease, padding .18s ease, border-color .18s ease"
		        },
		        children: [
		          (0, import_jsx_runtime.jsx)("button", {
		            type: "button",
		            title: "\u641C\u7D22\u4F1A\u8BDD",
		            onClick: (e) => {
		              e.stopPropagation();
		              setAddFlowOpen(false);
		              setSearchExpanded(true);
		              requestAnimationFrame(() => searchInputRef.current?.focus());
		            },
		            style: iconBtnStyle,
		            children: (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconSearchOutline16, { size: searchExpanded ? 11 : 14 })
		          }),
		          (0, import_jsx_runtime.jsx)("input", {
		            ref: searchInputRef,
		            value: query,
		            onChange: (e) => setQuery(e.target.value),
		            onKeyDown: (e) => {
		              if (e.key === "Escape") {
		                setQuery("");
		                setSearchExpanded(false);
		              }
		            },
		            placeholder: "\u641C\u7D22\u4F1A\u8BDD\u2026",
		            style: {
		              flex: 1,
		              minWidth: 0,
		              width: searchExpanded ? "auto" : 0,
		              opacity: searchExpanded ? 1 : 0,
		              pointerEvents: searchExpanded ? "auto" : "none",
		              background: "transparent",
		              border: "none",
		              outline: "none",
		              color: "var(--dsw-alias-label-primary)",
		              fontSize: 13,
		              lineHeight: "18px",
		              transition: "opacity .12s ease"
		            }
		          }),
		          searchExpanded && (0, import_jsx_runtime.jsx)("button", { type: "button", title: "\u6E05\u9664\u641C\u7D22", onClick: (e) => {
		            e.stopPropagation();
		            setQuery("");
		            setSearchExpanded(false);
		          }, style: iconBtnStyle, children: (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconCloseFill14, {}) })
		        ]
		      }),
		      // 视图：分组/排序菜单（照抄 ViewOptionsMenu）
		      (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Menu, {
		        open: viewMenuOpen,
		        onClose: () => setViewMenuOpen(false),
		        align: "end",
		        dense: true,
		        portal: true,
		        selectedIds: [groupBy, orderBy],
		        items: [
		          { type: "label", id: "group-by", text: "\u5206\u7EC4" },
		          { id: "workspace", label: "\u6309\u5DE5\u4F5C\u533A" },
		          { id: "flat", label: "\u5E73\u94FA\u4F1A\u8BDD" },
		          { type: "separator", id: "order-by-sep" },
		          { type: "label", id: "order-by", text: "\u6392\u5E8F" },
		          { id: "manual", label: "\u624B\u52A8" },
		          { id: "updated", label: "\u6700\u8FD1\u66F4\u65B0" }
		        ],
		        onSelect: (id) => {
		          if (id === "workspace" || id === "flat") setGroupBy(id);
		          else if (id === "manual" || id === "updated") setOrderBy(id);
		          setViewMenuOpen(false);
		        },
		        anchor: (0, import_jsx_runtime.jsx)("button", { type: "button", title: "\u89C6\u56FE", onClick: () => setViewMenuOpen((v) => !v), style: iconBtnStyle, children: (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconPersonalizationOutline16, {}) })
		      }),
		      // 添加：打开目录选择器（browse）
		      (0, import_jsx_runtime.jsx)("button", { ref: addBtnRef, type: "button", title: "\u65B0\u5EFA\u5DE5\u4F5C\u533A", onClick: openAddFlow, style: iconBtnStyle, children: (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconProjectAddOutline16, { size: 16 }) })
		    ] }),
		    // 目录选择器（browse 能力，Modal 弹出）
		    (0, import_jsx_runtime.jsx)(DirectoryPicker, {
		      ctx,
		      open: addFlowOpen,
		      initialPath: identity.workspaceRoot ?? void 0,
		      onPick: async (path) => {
		        try {
		          await ctx.workspaces.create({ path });
		        } catch (err) {
		          alert(`\u6DFB\u52A0\u5DE5\u4F5C\u533A\u5931\u8D25\uFF1A${err instanceof Error ? err.message : String(err)}`);
		        }
		        closeAddFlow();
		      },
		      onCancel: closeAddFlow
		    }),
		    (0, import_jsx_runtime.jsx)("div", { style: { flex: 1, overflowY: "auto", minHeight: 0 }, children: [
		      shown.map((w) => (0, import_jsx_runtime.jsx)(WorkspaceItem, {
		        key: w.workspaceId,
		        workspace: w,
		        sessions,
		        onOpen: (id) => {
		          if (ctx.sessions?.open) ctx.sessions.open(id);
		        },
		        onDelete: () => deleteWorkspace(w),
		        onRename: () => renameWorkspace(w),
		        onStartSession: () => {
		          if (ctx.workspaces?.startSession) ctx.workspaces.startSession(w.workspaceId);
		        }
		      })),
		      shown.length === 0 && (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 13, padding: "12px 8px", textAlign: "center" }, children: identity.loading ? "\u52A0\u8F7D\u4E2D\u2026" : "\u6682\u65E0\u5DE5\u4F5C\u533A\uFF0C\u70B9\u51FB\u53F3\u4E0A\u89D2\u6DFB\u52A0\u76EE\u5F55" })
		    ] })
		  ] });
		}
		function DirectoryPicker({ ctx, open, initialPath, onPick, onCancel }) {
		  const [columnStack, setColumnStack] = React.useState([]);
		  const [error, setError] = React.useState(null);
		  const [showHidden, setShowHidden] = React.useState(false);
		  const [selectedPath, setSelectedPath] = React.useState(null);
		  const [folderDraft, setFolderDraft] = React.useState(null);
		  const [creating, setCreating] = React.useState(false);
		  const [createError, setCreateError] = React.useState(null);
		  const load = React.useCallback((path) => {
		    setError(null);
		    return ctx.workspaces.listDirectory(path).catch((e) => {
		      setError(e.message || "\u65E0\u6CD5\u5217\u51FA\u76EE\u5F55");
		      return null;
		    });
		  }, [ctx]);
		  React.useEffect(() => {
		    if (!open) return;
		    setColumnStack([]);
		    setSelectedPath(null);
		    setShowHidden(false);
		    setFolderDraft(null);
		    setCreateError(null);
		    load(initialPath).then((listing) => {
		      if (listing) {
		        setColumnStack([listing]);
		        setSelectedPath(listing.path);
		      }
		    });
		  }, [open, load, initialPath]);
		  const descend = async (path) => {
		    const listing = await load(path);
		    if (!listing) return;
		    setColumnStack((stack) => {
		      const idx = stack.findIndex((l) => l.path === path);
		      if (idx >= 0) return stack.slice(0, idx + 1);
		      return [...stack, listing];
		    });
		    setSelectedPath(path);
		  };
		  const navigateTo = async (path) => {
		    const idx = columnStack.findIndex((l) => l.path === path);
		    if (idx >= 0) {
		      setColumnStack((s) => s.slice(0, idx + 1));
		      setSelectedPath(path);
		    } else {
		      const listing = await load(path);
		      if (listing) {
		        setColumnStack([listing]);
		        setSelectedPath(path);
		      }
		    }
		  };
		  const confirmCreate = async () => {
		    const name = (folderDraft ?? "").trim();
		    if (!name) return;
		    const current = columnStack[columnStack.length - 1];
		    const target = selectedPath ?? current?.path;
		    if (!target) return;
		    setCreating(true);
		    try {
		      await ctx.workspaces.createDirectory(target, name);
		      setFolderDraft(null);
		      setCreateError(null);
		      const listing = await load(target);
		      if (listing) {
		        setColumnStack((s) => {
		          const copy = [...s];
		          copy[copy.length - 1] = listing;
		          return copy;
		        });
		      }
		    } catch (e) {
		      setCreateError(e.message || "\u65B0\u5EFA\u6587\u4EF6\u5939\u5931\u8D25");
		    } finally {
		      setCreating(false);
		    }
		  };
		  const crumbs = columnStack.length > 0 ? columnStack[columnStack.length - 1].crumbs : [];
		  const currentListing = columnStack[columnStack.length - 1];
		  const targetPath = selectedPath ?? currentListing?.path ?? null;
		  return (0, import_jsx_runtime.jsxs)(import_dsh_client_ui_primitives.Modal, {
		    open,
		    onClose: onCancel,
		    title: "\u9009\u62E9\u5DE5\u4F5C\u533A\u76EE\u5F55",
		    closeLabel: "\u53D6\u6D88",
		    className: dirPickerModalStyle,
		    headless: true,
		    children: [
		      (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", height: "min(500px, 100dvh - 32px)" }, children: [
		        // header：标题 + 面包屑
		        (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 8, padding: "16px 24px 8px", borderBottom: "1px solid var(--dsw-alias-border-l3)", flex: "none" }, children: [
		          (0, import_jsx_runtime.jsx)("h2", { style: { margin: 0, minHeight: 28, fontSize: 16, fontWeight: 510, lineHeight: "24px", color: "var(--dsw-alias-label-primary)" }, children: "\u9009\u62E9\u5DE5\u4F5C\u533A\u76EE\u5F55" }),
		          (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 4, minHeight: 24, overflowX: "auto" }, children: [
		            ...crumbs.map((c, i) => (0, import_jsx_runtime.jsxs)(React.Fragment, { key: c.path, children: [
		              i > 0 && (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronRightOutline14, { size: 12, style: { color: "var(--dsw-alias-label-tertiary)", flex: "none" } }),
		              (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => navigateTo(c.path), style: { background: "transparent", border: "none", cursor: "pointer", color: "var(--dsw-alias-label-tertiary)", fontSize: 13, fontWeight: 500, padding: 0, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: c.name })
		            ] }))
		          ] })
		        ] }),
		        // content：Miller 多列
		        (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flex: 1, gap: 12, padding: "16px 16px 16px 24px", minHeight: 0, overflowX: "auto" }, children: [
		          ...columnStack.map((listing, colIdx) => (0, import_jsx_runtime.jsxs)(React.Fragment, { key: listing.path, children: [
		            colIdx > 0 && (0, import_jsx_runtime.jsx)("span", { style: { width: 1, flex: "none", background: "var(--dsw-alias-border-l3)" } }),
		            (0, import_jsx_runtime.jsxs)("div", { role: "list", style: { flex: "1 1 0", minWidth: 256, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, paddingRight: 8 }, children: [
		              ...listing.entries.filter((e) => showHidden || !e.hidden).map((e) => {
		                const selected = e.path === selectedPath;
		                return (0, import_jsx_runtime.jsxs)("button", {
		                  type: "button",
		                  key: e.path,
		                  role: "listitem",
		                  onClick: () => descend(e.path),
		                  style: {
		                    display: "flex",
		                    alignItems: "center",
		                    gap: 4,
		                    width: "100%",
		                    height: 28,
		                    background: selected ? "var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover))" : "transparent",
		                    border: "none",
		                    borderRadius: 6,
		                    cursor: "pointer",
		                    padding: 4,
		                    textAlign: "left"
		                  },
		                  children: [
		                    selected ? (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconFolderOpen16, { size: 16, style: { color: "var(--dsw-alias-button-info-fill)", flex: "none" } }) : (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconFolderClose16, { size: 16, style: { color: "var(--dsw-alias-label-secondary)", flex: "none" } }),
		                    (0, import_jsx_runtime.jsx)("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--dsw-alias-label-primary)", fontSize: 13, fontWeight: 500 }, children: e.name }),
		                    (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronRightOutline14, { size: 12, style: { color: "var(--dsw-alias-label-tertiary)", flex: "none" } })
		                  ]
		                });
		              }),
		              listing.entries.filter((e) => showHidden || !e.hidden).length === 0 && (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 12, padding: "8px 4px" }, children: "\uFF08\u7A7A\u76EE\u5F55\uFF09" })
		            ] })
		          ] })),
		          columnStack.length === 0 && (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 13, padding: "24px" }, children: "\u52A0\u8F7D\u76EE\u5F55\u2026" })
		        ] }),
		        error && (0, import_jsx_runtime.jsx)("div", { role: "alert", style: { color: "var(--dsw-alias-state-error-primary)", fontSize: 12, padding: "4px 24px" }, children: error }),
		        // footer：新建文件夹 + 显示隐藏 + 取消 + 打开
		        (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "16px 24px", borderTop: "1px solid var(--dsw-alias-border-l3)", flex: "none" }, children: [
		          (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "sm", icon: (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }), disabled: columnStack.length === 0, onClick: () => {
		            setFolderDraft("");
		            setCreateError(null);
		          }, children: "\u65B0\u5EFA\u6587\u4EF6\u5939" }),
		          (0, import_jsx_runtime.jsxs)("button", { type: "button", "aria-pressed": showHidden, onClick: () => setShowHidden((v) => !v), style: { display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: "none", cursor: "pointer", color: showHidden ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-label-secondary)", fontSize: 13, fontWeight: 500, padding: 0, whiteSpace: "nowrap" }, children: [
		            "\u663E\u793A\u9690\u85CF\u6587\u4EF6",
		            showHidden && (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconCheckOutline16, { size: 14 })
		          ] }),
		          (0, import_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
		          (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "sm", onClick: onCancel, children: "\u53D6\u6D88" }),
		          (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "primary", size: "sm", disabled: targetPath === null, onClick: () => {
		            if (targetPath) onPick(targetPath);
		          }, children: "\u6253\u5F00" })
		        ] })
		      ] }),
		      // 新建文件夹子对话框
		      (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Modal, {
		        open: folderDraft !== null,
		        onClose: () => {
		          if (!creating) setFolderDraft(null);
		        },
		        title: "\u65B0\u5EFA\u6587\u4EF6\u5939",
		        closeLabel: "\u53D6\u6D88",
		        headless: true,
		        children: (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 12, padding: "22px 24px 20px" }, children: [
		          (0, import_jsx_runtime.jsx)("h3", { style: { margin: 0, fontSize: 16, fontWeight: 510, color: "var(--dsw-alias-label-primary)" }, children: "\u65B0\u5EFA\u6587\u4EF6\u5939" }),
		          (0, import_jsx_runtime.jsx)("p", { style: { margin: 0, fontSize: 14, color: "var(--dsw-alias-label-primary)" }, children: `\u5728\u300C${targetPath ?? ""}\u300D\u4E2D\u65B0\u5EFA\u6587\u4EF6\u5939` }),
		          (0, import_jsx_runtime.jsx)("input", {
		            value: folderDraft ?? "",
		            autoFocus: true,
		            disabled: creating,
		            onChange: (e) => setFolderDraft(e.target.value),
		            onKeyDown: (e) => {
		              if (e.key === "Enter") confirmCreate();
		              if (e.key === "Escape") {
		                if (!creating) setFolderDraft(null);
		              }
		            },
		            placeholder: "\u672A\u547D\u540D\u6587\u4EF6\u5939",
		            style: { boxSizing: "border-box", width: "100%", height: 44, padding: "7px 14px", borderRadius: 22, border: "1px solid var(--dsw-alias-border-l2)", background: "transparent", color: "var(--dsw-alias-label-primary)", fontSize: 14, outline: "none" }
		          }),
		          createError && (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-state-error-primary)", fontSize: 12 }, children: createError }),
		          (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }, children: [
		            (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "outline", size: "sm", onClick: () => {
		              if (!creating) setFolderDraft(null);
		            }, children: "\u53D6\u6D88" }),
		            (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, { variant: "primary", size: "sm", disabled: creating || !(folderDraft ?? "").trim(), onClick: confirmCreate, children: "\u521B\u5EFA" })
		          ] })
		        ] })
		      })
		    ]
		  });
		}
		var dirPickerModalStyle = {
		  width: "min(680px, 100%)",
		  padding: 0,
		  gap: 0
		};
		function apply(ctx) {
		  ctx.slots.inject("sidebar.workspaces", () => ctx.slots.register({
		    name: "sidebar.workspaces",
		    priority: -1,
		    // 低于官方 ui-workspace 的默认 0，shadow 原生浏览区（lowest renders）
		    inject: () => ({})
		  }, function FilteredBrowser() {
		    const identity = useIdentity();
		    const sessions = useSessionSnapshot(ctx);
		    return (0, import_jsx_runtime.jsx)(WorkspaceBrowser, {
		      ctx,
		      identity,
		      sessions
		    });
		  }));
		  ctx.slots.inject("settings.action", () => ctx.slots.register({
		    name: "settings.action",
		    id: "multi-user-logout",
		    order: 100
		  }, function LogoutAction() {
		    const identity = useIdentity();
		    if (!identity.userId) return null;
		    return (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Button, {
		      variant: "outline",
		      size: "sm",
		      onClick: async () => {
		        await api("POST", "/api/mu/auth/logout");
		        location.href = "/";
		      },
		      children: `\u9000\u51FA\u767B\u5F55\uFF08${identity.username ?? ""}\uFF09`
		    });
		  }));
		  ctx.slots.inject("settings.section", () => ctx.slots.register({
		    name: "settings.section",
		    id: "multi-user",
		    order: 20,
		    label: () => "\u7528\u6237\u7BA1\u7406"
		  }, function UserManagementSection() {
		    const identity = useIdentity();
		    return (0, import_jsx_runtime.jsx)(UserManagement, { identity });
		  }));
		}
		var inputStyle = {
		  boxSizing: "border-box",
		  width: "100%",
		  padding: "8px 10px",
		  borderRadius: 8,
		  border: "1px solid var(--dsw-alias-border-l2)",
		  background: "var(--dsw-alias-bg-layer-1)",
		  color: "var(--dsw-alias-label-primary)",
		  fontSize: 13,
		  outline: "none"
		};
		var btnStyle = {
		  cursor: "pointer",
		  padding: "6px 12px",
		  borderRadius: 8,
		  border: "1px solid var(--dsw-alias-border-l2)",
		  background: "transparent",
		  color: "var(--dsw-alias-label-primary)",
		  fontSize: 12
		};
		var primaryBtnStyle = {
		  ...btnStyle,
		  background: "var(--dsw-alias-brand-primary)",
		  borderColor: "var(--dsw-alias-brand-primary)",
		  color: "#fff"
		};
		var dangerBtnStyle = {
		  ...btnStyle,
		  color: "var(--dsw-alias-state-error-primary)",
		  borderColor: "var(--dsw-alias-state-error-primary)"
		};
		function UserManagement({ identity }) {
		  const isOwner = identity.role === "owner";
		  const [users, setUsers] = React.useState([]);
		  const [loading, setLoading] = React.useState(true);
		  const [error, setError] = React.useState(null);
		  const [notice, setNotice] = React.useState(null);
		  const [newUsername, setNewUsername] = React.useState("");
		  const [newPassword, setNewPassword] = React.useState("");
		  const [oldPw, setOldPw] = React.useState("");
		  const [newPw, setNewPw] = React.useState("");
		  const reload = React.useCallback(() => {
		    setLoading(true);
		    fetch("/api/mu/admin/users", { credentials: "same-origin" }).then((r) => r.ok ? r.json() : Promise.reject(new Error("load users failed"))).then((list) => {
		      setUsers(Array.isArray(list) ? list : []);
		      setLoading(false);
		    }).catch(() => {
		      setError("\u52A0\u8F7D\u7528\u6237\u5217\u8868\u5931\u8D25");
		      setLoading(false);
		    });
		  }, []);
		  React.useEffect(() => {
		    if (isOwner) reload();
		  }, [reload, isOwner]);
		  const flash = (msg) => {
		    setNotice(msg);
		    setTimeout(() => setNotice(null), 3e3);
		  };
		  const createUser = async () => {
		    const username = newUsername.trim();
		    if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) {
		      setError("\u7528\u6237\u540D\u9700\u4E3A 2-32 \u4F4D\u5B57\u6BCD/\u6570\u5B57/_.-");
		      return;
		    }
		    if (newPassword.length < 6) {
		      setError("\u521D\u59CB\u5BC6\u7801\u81F3\u5C11 6 \u4F4D");
		      return;
		    }
		    const r = await api("POST", "/api/mu/admin/users", { username, initialPassword: newPassword });
		    if (r.json.ok) {
		      setNewUsername("");
		      setNewPassword("");
		      setError(null);
		      flash(`\u5DF2\u521B\u5EFA\u7528\u6237 ${username}\uFF0C\u4E13\u5C5E\u76EE\u5F55\uFF1A${r.json.workspaceRoot ?? "(\u81EA\u52A8\u5206\u914D)"}`);
		      reload();
		    } else {
		      setError(r.json.error || "\u521B\u5EFA\u5931\u8D25");
		    }
		  };
		  const changeSelfPassword = async () => {
		    if (newPw.length < 6) {
		      setError("\u65B0\u5BC6\u7801\u81F3\u5C11 6 \u4F4D");
		      return;
		    }
		    const r = await api("POST", "/api/mu/me/password", { oldPassword: oldPw, newPassword: newPw });
		    if (r.json.ok) {
		      setOldPw("");
		      setNewPw("");
		      setError(null);
		      flash("\u5BC6\u7801\u5DF2\u4FEE\u6539");
		    } else setError(r.json.error || "\u4FEE\u6539\u5931\u8D25");
		  };
		  const toggleStatus = async (u) => {
		    const status = u.status === "active" ? "disabled" : "active";
		    await api("POST", "/api/mu/admin/users/update", { userId: u.id, status });
		    reload();
		  };
		  const resetPassword = async (u) => {
		    const pw = prompt(`\u4E3A ${u.username} \u8BBE\u7F6E\u65B0\u5BC6\u7801\uFF08\u81F3\u5C11 6 \u4F4D\uFF09\uFF1A`, "");
		    if (pw === null) return;
		    if (pw.length < 6) {
		      setError("\u5BC6\u7801\u81F3\u5C11 6 \u4F4D");
		      return;
		    }
		    const r = await api("POST", "/api/mu/admin/users/reset-password", { userId: u.id, password: pw });
		    if (r.json.ok) flash(`\u5DF2\u91CD\u7F6E ${u.username} \u7684\u5BC6\u7801`);
		    else setError(r.json.error || "\u91CD\u7F6E\u5931\u8D25");
		  };
		  const deleteUser = async (u) => {
		    if (!confirm(`\u786E\u5B9A\u5220\u9664\u7528\u6237 ${u.username}\uFF1F\u5176\u8D26\u53F7\u5C06\u505C\u7528\uFF0C\u4E13\u5C5E\u76EE\u5F55\u4FDD\u7559\u3002`)) return;
		    await api("POST", "/api/mu/admin/users/delete", { userId: u.id });
		    reload();
		  };
		  const statusTag = (u) => {
		    if (u.role === "owner") return (0, import_jsx_runtime.jsx)("span", { style: { marginLeft: 8, fontSize: 12, color: "var(--dsw-alias-label-secondary)" }, children: "\u4E3B\u7BA1\u7406\u5458" });
		    if (u.status === "disabled") return (0, import_jsx_runtime.jsx)("span", { style: { marginLeft: 8, fontSize: 12, color: "var(--dsw-alias-state-error-primary)" }, children: "\u5DF2\u505C\u7528" });
		    return (0, import_jsx_runtime.jsx)("span", { style: { marginLeft: 8, fontSize: 12, color: "var(--dsw-alias-label-tertiary)" }, children: "\u5B50\u7528\u6237" });
		  };
		  const userList = loading ? (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 13 }, children: "\u52A0\u8F7D\u4E2D\u2026" }) : (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: users.map((u) => (0, import_jsx_runtime.jsxs)("div", {
		    key: u.id,
		    style: { display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 10 },
		    children: [
		      (0, import_jsx_runtime.jsx)("div", { style: { flex: 1, minWidth: 0 }, children: (0, import_jsx_runtime.jsxs)("div", { children: [
		        (0, import_jsx_runtime.jsxs)("div", { children: [
		          (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 14, fontWeight: 500, color: "var(--dsw-alias-label-primary)" }, children: u.displayName || u.username }),
		          statusTag(u)
		        ] }),
		        u.workspaceRoot && (0, import_jsx_runtime.jsx)("div", { style: { marginTop: 2, fontSize: 11, color: "var(--dsw-alias-label-tertiary)", fontFamily: "var(--ds-font-family-code, monospace)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: u.workspaceRoot })
		      ] }) }),
		      u.role !== "owner" && (0, import_jsx_runtime.jsx)("button", { onClick: () => resetPassword(u), style: btnStyle, children: "\u91CD\u7F6E\u5BC6\u7801" }),
		      u.role !== "owner" && (0, import_jsx_runtime.jsx)("button", { onClick: () => toggleStatus(u), style: btnStyle, children: u.status === "active" ? "\u505C\u7528" : "\u542F\u7528" }),
		      u.role !== "owner" && (0, import_jsx_runtime.jsx)("button", { onClick: () => deleteUser(u), style: dangerBtnStyle, children: "\u5220\u9664" })
		    ]
		  })) });
		  return (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 16, maxWidth: 720, padding: "0 4px" }, children: [
		    (0, import_jsx_runtime.jsx)("h3", { style: { margin: 0, fontSize: 16, fontWeight: 500, color: "var(--dsw-alias-label-primary)" }, children: "\u7528\u6237\u7BA1\u7406" }),
		    (0, import_jsx_runtime.jsx)("p", { style: { margin: 0, fontSize: 13, color: "var(--dsw-alias-label-tertiary)" }, children: "\u6BCF\u4E2A\u7528\u6237\u62E5\u6709\u4E00\u4E2A\u4E13\u5C5E\u5DE5\u4F5C\u533A\u76EE\u5F55\uFF08\u6309\u7528\u6237\u81EA\u52A8\u751F\u6210\uFF0C\u4E92\u4E0D\u91CD\u590D\uFF09\u3002\u7528\u6237\u53EA\u80FD\u770B\u5230\u81EA\u5DF1\u4E13\u5C5E\u76EE\u5F55\u5185\u7684\u5DE5\u4F5C\u533A\u4E0E\u4F1A\u8BDD\u3002" }),
		    // 修改自己的密码（所有登录用户可用，问题 3）
		    (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 12 }, children: [
		      (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 14, fontWeight: 500, color: "var(--dsw-alias-label-primary)" }, children: "\u4FEE\u6539\u6211\u7684\u5BC6\u7801" }),
		      (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
		        (0, import_jsx_runtime.jsx)("input", { value: oldPw, onChange: (e) => setOldPw(e.target.value), placeholder: "\u5F53\u524D\u5BC6\u7801", type: "password", style: inputStyle }),
		        (0, import_jsx_runtime.jsx)("input", { value: newPw, onChange: (e) => setNewPw(e.target.value), placeholder: "\u65B0\u5BC6\u7801\uFF08\u22656\u4F4D\uFF09", type: "password", style: inputStyle })
		      ] }),
		      (0, import_jsx_runtime.jsx)("div", { children: (0, import_jsx_runtime.jsx)("button", { onClick: changeSelfPassword, style: primaryBtnStyle, children: "\u4FEE\u6539\u5BC6\u7801" }) })
		    ] }),
		    // 新建子用户（仅主管理员）
		    isOwner && (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 12 }, children: [
		      (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 14, fontWeight: 500, color: "var(--dsw-alias-label-primary)" }, children: "\u65B0\u5EFA\u5B50\u7528\u6237" }),
		      (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
		        (0, import_jsx_runtime.jsx)("input", { value: newUsername, onChange: (e) => setNewUsername(e.target.value), placeholder: "\u7528\u6237\u540D", style: inputStyle }),
		        (0, import_jsx_runtime.jsx)("input", { value: newPassword, onChange: (e) => setNewPassword(e.target.value), placeholder: "\u521D\u59CB\u5BC6\u7801\uFF08\u22656\u4F4D\uFF09", type: "password", style: inputStyle })
		      ] }),
		      (0, import_jsx_runtime.jsx)("div", { children: (0, import_jsx_runtime.jsx)("button", { onClick: createUser, style: primaryBtnStyle, children: "\u521B\u5EFA\u7528\u6237" }) })
		    ] }),
		    // 用户列表（仅主管理员）
		    isOwner && userList,
		    error && (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-state-error-primary)", fontSize: 13 }, children: error }),
		    notice && (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-state-success-primary)", fontSize: 13 }, children: notice })
		  ] });
		}

		return module.exports;
	}
});
