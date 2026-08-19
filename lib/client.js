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
		var inject = ["slots", "workspaces", "sessions", "locale"];
		function normalizePath(p) {
		  return String(p || "").replace(/[/\\]+$/, "").replace(/\\/g, "/");
		}
		function useIdentity() {
		  const [identity, setIdentity] = React.useState(() => ({
		    userId: null,
		    username: null,
		    role: null,
		    workspaceDirs: null,
		    loading: true
		  }));
		  React.useEffect(() => {
		    let cancelled = false;
		    fetch("/api/mu/me/grants", { credentials: "same-origin" }).then((r) => {
		      if (r.status === 401) return { userId: null, role: null, workspaceDirs: [] };
		      if (!r.ok) throw new Error("grants failed");
		      return r.json();
		    }).then((data) => {
		      if (cancelled) return;
		      setIdentity({
		        userId: data.userId ?? null,
		        username: data.username ?? null,
		        role: data.role ?? null,
		        workspaceDirs: Array.isArray(data.workspaceDirs) ? data.workspaceDirs : [],
		        loading: false
		      });
		    }).catch(() => {
		      if (cancelled) return;
		      setIdentity({ userId: null, username: null, role: null, workspaceDirs: [], loading: false });
		    });
		    return () => {
		      cancelled = true;
		    };
		  }, []);
		  return identity;
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
		function filterWorkspaces(items, identity) {
		  if (!identity.userId) return [];
		  if (identity.workspaceDirs == null) return items;
		  if (identity.role === "owner") return items;
		  const allowed = new Set(identity.workspaceDirs.map(normalizePath));
		  return items.filter((w) => allowed.has(normalizePath(w.path)));
		}
		var workspaceRowStyle = {
		  display: "flex",
		  alignItems: "center",
		  width: "100%",
		  background: "transparent",
		  border: "none",
		  cursor: "pointer",
		  color: "var(--dsw-alias-label-primary)",
		  font: "inherit",
		  fontSize: 14,
		  padding: "7px 8px",
		  borderRadius: 8,
		  textAlign: "left"
		};
		var sessionRowStyle = {
		  display: "block",
		  width: "100%",
		  background: "transparent",
		  border: "none",
		  cursor: "pointer",
		  color: "var(--dsw-alias-label-secondary)",
		  font: "inherit",
		  fontSize: 13,
		  padding: "5px 8px 5px 30px",
		  borderRadius: 8,
		  textAlign: "left",
		  overflow: "hidden",
		  textOverflow: "ellipsis",
		  whiteSpace: "nowrap"
		};
		function WorkspaceItem({ workspace, sessions, onOpen }) {
		  const [expanded, setExpanded] = React.useState(false);
		  const members = (workspace.sessionIds || []).map((id) => sessions.find((s) => s.id === id)).filter((s) => !!s);
		  return (0, import_jsx_runtime.jsxs)("div", { style: { marginBottom: 2 }, children: [
		    (0, import_jsx_runtime.jsxs)("button", {
		      type: "button",
		      onClick: () => setExpanded((v) => !v),
		      style: workspaceRowStyle,
		      children: [
		        (0, import_jsx_runtime.jsx)("span", { style: { marginRight: 6 }, children: expanded ? "\u25BE" : "\u25B8" }),
		        (0, import_jsx_runtime.jsx)("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: workspace.title || workspace.path })
		      ]
		    }),
		    expanded && members.map((s) => (0, import_jsx_runtime.jsx)("button", {
		      type: "button",
		      key: s.id,
		      onClick: () => onOpen(s.id),
		      style: sessionRowStyle,
		      children: s.title || s.displayTitle || s.id
		    }))
		  ] });
		}
		function WorkspaceBrowser({ ctx, identity, workspaces, sessions }) {
		  const [query, setQuery] = React.useState("");
		  const filtered = filterWorkspaces(workspaces, identity);
		  const q = query.trim().toLowerCase();
		  const shown = q ? filtered.filter((w) => (w.title || "").toLowerCase().includes(q) || (w.path || "").toLowerCase().includes(q)) : filtered;
		  return (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", padding: "0 4px" }, children: [
		    (0, import_jsx_runtime.jsx)("input", {
		      value: query,
		      onChange: (e) => setQuery(e.target.value),
		      placeholder: "\u641C\u7D22\u5DE5\u4F5C\u533A",
		      style: {
		        width: "100%",
		        boxSizing: "border-box",
		        margin: "4px 0 8px",
		        padding: "6px 10px",
		        borderRadius: 8,
		        border: "1px solid var(--dsw-alias-border-l2)",
		        background: "var(--dsw-alias-bg-layer-1)",
		        color: "var(--dsw-alias-label-primary)",
		        fontSize: 13,
		        outline: "none"
		      }
		    }),
		    (0, import_jsx_runtime.jsx)("div", { style: { flex: 1, overflowY: "auto", minHeight: 0 }, children: [
		      shown.map((w) => (0, import_jsx_runtime.jsx)(WorkspaceItem, {
		        key: w.workspaceId,
		        workspace: w,
		        sessions,
		        onOpen: (id) => {
		          if (ctx.sessions?.open) ctx.sessions.open(id);
		        }
		      })),
		      shown.length === 0 && (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 13, padding: "12px 8px", textAlign: "center" }, children: identity.loading ? "\u52A0\u8F7D\u4E2D\u2026" : "\u6682\u65E0\u5DE5\u4F5C\u533A" })
		    ] })
		  ] });
		}
		function apply(ctx) {
		  ctx.slots.inject("sidebar.workspaces", () => ctx.slots.register({
		    name: "sidebar.workspaces",
		    priority: -1,
		    // 低于官方 ui-workspace 的默认 0，shadow 原生浏览区（lowest renders）
		    inject: () => ({})
		  }, function FilteredBrowser() {
		    const identity = useIdentity();
		    const workspaceSnap = useWorkspaceSnapshot(ctx);
		    const sessions = useSessionSnapshot(ctx);
		    return (0, import_jsx_runtime.jsx)(WorkspaceBrowser, {
		      ctx,
		      identity,
		      workspaces: workspaceSnap.items || [],
		      sessions
		    });
		  }));
		}

		return module.exports;
	}
});
