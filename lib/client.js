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
		  ctx.slots.inject("settings.section", () => ctx.slots.register({
		    name: "settings.section",
		    id: "multi-user",
		    order: 20,
		    label: () => "\u7528\u6237\u7BA1\u7406"
		  }, function UserManagementSection() {
		    const identity = useIdentity();
		    if (identity.role !== "owner") {
		      return (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-label-tertiary)", padding: "24px", fontSize: 14 }, children: "\u4EC5\u4E3B\u7BA1\u7406\u5458\u53EF\u7BA1\u7406\u7528\u6237\u3002" });
		    }
		    return (0, import_jsx_runtime.jsx)(UserManagement, { identity });
		  }));
		}
		function apiPost(path, body) {
		  return fetch(path, {
		    method: "POST",
		    headers: { "content-type": "application/json" },
		    credentials: "same-origin",
		    body: JSON.stringify(body)
		  }).then((r) => r.json().then((j) => ({ status: r.status, json: j })));
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
		  const [users, setUsers] = React.useState([]);
		  const [loading, setLoading] = React.useState(true);
		  const [error, setError] = React.useState(null);
		  const [notice, setNotice] = React.useState(null);
		  const [newUsername, setNewUsername] = React.useState("");
		  const [newPassword, setNewPassword] = React.useState("");
		  const [newDirs, setNewDirs] = React.useState("");
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
		    reload();
		  }, [reload]);
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
		    const dirs = newDirs.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean);
		    const r = await apiPost("/api/mu/admin/users", { username, initialPassword: newPassword, workspaceDirs: dirs });
		    if (r.json.ok) {
		      setNewUsername("");
		      setNewPassword("");
		      setNewDirs("");
		      setError(null);
		      flash(`\u5DF2\u521B\u5EFA\u7528\u6237 ${username}`);
		      reload();
		    } else {
		      setError(r.json.error || "\u521B\u5EFA\u5931\u8D25");
		    }
		  };
		  const toggleStatus = async (u) => {
		    const status = u.status === "active" ? "disabled" : "active";
		    await apiPost("/api/mu/admin/users/update", { userId: u.id, status });
		    reload();
		  };
		  const grantDirs = async (u) => {
		    const dirs = prompt(`\u4E3A\u7528\u6237 ${u.username} \u6388\u6743\u5DE5\u4F5C\u533A\u76EE\u5F55\uFF08\u6BCF\u884C\u4E00\u4E2A\u7EDD\u5BF9\u8DEF\u5F84\uFF09\uFF1A`, "");
		    if (dirs === null) return;
		    const list = dirs.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean);
		    await apiPost("/api/mu/admin/users/grants", { userId: u.id, workspaceDirs: list });
		    flash(`\u5DF2\u66F4\u65B0 ${u.username} \u7684\u5DE5\u4F5C\u533A\u6388\u6743`);
		  };
		  const resetPassword = async (u) => {
		    const pw = prompt(`\u4E3A ${u.username} \u8BBE\u7F6E\u65B0\u5BC6\u7801\uFF08\u81F3\u5C11 6 \u4F4D\uFF09\uFF1A`, "");
		    if (pw === null) return;
		    if (pw.length < 6) {
		      setError("\u5BC6\u7801\u81F3\u5C11 6 \u4F4D");
		      return;
		    }
		    const r = await apiPost("/api/mu/admin/users/reset-password", { userId: u.id, password: pw });
		    if (r.json.ok) flash(`\u5DF2\u91CD\u7F6E ${u.username} \u7684\u5BC6\u7801`);
		    else setError(r.json.error || "\u91CD\u7F6E\u5931\u8D25");
		  };
		  const deleteUser = async (u) => {
		    if (!confirm(`\u786E\u5B9A\u5220\u9664\u7528\u6237 ${u.username}\uFF1F\u5176\u6570\u636E\u5C06\u533F\u540D\u5316\u4FDD\u7559\u3002`)) return;
		    await apiPost("/api/mu/admin/users/delete", { userId: u.id });
		    reload();
		  };
		  const userList = loading ? (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 13 }, children: "\u52A0\u8F7D\u4E2D\u2026" }) : (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: users.map((u) => (0, import_jsx_runtime.jsxs)("div", {
		    key: u.id,
		    style: { display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 10 },
		    children: [
		      (0, import_jsx_runtime.jsx)("div", { style: { flex: 1, minWidth: 0 }, children: (0, import_jsx_runtime.jsxs)("div", { children: [
		        (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 14, fontWeight: 500, color: "var(--dsw-alias-label-primary)" }, children: u.displayName || u.username }),
		        (0, import_jsx_runtime.jsx)("span", { style: { marginLeft: 8, fontSize: 12, color: "var(--dsw-alias-label-tertiary)" }, children: u.role === "owner" ? "\u4E3B\u7BA1\u7406\u5458" : u.status === "disabled" ? "\u5DF2\u505C\u7528" : "\u5B50\u7528\u6237" })
		      ] }) }),
		      u.role !== "owner" && (0, import_jsx_runtime.jsx)("button", { onClick: () => grantDirs(u), style: btnStyle, children: "\u6388\u6743" }),
		      u.role !== "owner" && (0, import_jsx_runtime.jsx)("button", { onClick: () => resetPassword(u), style: btnStyle, children: "\u91CD\u7F6E\u5BC6\u7801" }),
		      u.role !== "owner" && (0, import_jsx_runtime.jsx)("button", { onClick: () => toggleStatus(u), style: btnStyle, children: u.status === "active" ? "\u505C\u7528" : "\u542F\u7528" }),
		      u.role !== "owner" && (0, import_jsx_runtime.jsx)("button", { onClick: () => deleteUser(u), style: dangerBtnStyle, children: "\u5220\u9664" })
		    ]
		  })) });
		  return (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 16, maxWidth: 720, padding: "0 4px" }, children: [
		    (0, import_jsx_runtime.jsx)("h3", { style: { margin: 0, fontSize: 16, fontWeight: 500, color: "var(--dsw-alias-label-primary)" }, children: "\u7528\u6237\u7BA1\u7406" }),
		    (0, import_jsx_runtime.jsx)("p", { style: { margin: 0, fontSize: 13, color: "var(--dsw-alias-label-tertiary)" }, children: "\u6DFB\u52A0\u5B50\u7528\u6237\u5E76\u6388\u6743\u5176\u53EF\u89C1\u7684\u5DE5\u4F5C\u533A\u76EE\u5F55\u3002\u5B50\u7528\u6237\u53EA\u80FD\u770B\u5230\u88AB\u6388\u6743\u76EE\u5F55\u4E0B\u7684\u5DE5\u4F5C\u533A\u4E0E\u4F1A\u8BDD\u3002" }),
		    // 新建用户
		    (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 12 }, children: [
		      (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 14, fontWeight: 500, color: "var(--dsw-alias-label-primary)" }, children: "\u65B0\u5EFA\u5B50\u7528\u6237" }),
		      (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
		        (0, import_jsx_runtime.jsx)("input", { value: newUsername, onChange: (e) => setNewUsername(e.target.value), placeholder: "\u7528\u6237\u540D", style: inputStyle }),
		        (0, import_jsx_runtime.jsx)("input", { value: newPassword, onChange: (e) => setNewPassword(e.target.value), placeholder: "\u521D\u59CB\u5BC6\u7801\uFF08\u22656\u4F4D\uFF09", type: "password", style: inputStyle })
		      ] }),
		      (0, import_jsx_runtime.jsx)("input", { value: newDirs, onChange: (e) => setNewDirs(e.target.value), placeholder: "\u6388\u6743\u5DE5\u4F5C\u533A\u76EE\u5F55\uFF08\u9017\u53F7/\u6362\u884C\u5206\u9694\uFF0C\u7559\u7A7A=\u65E0\u5DE5\u4F5C\u533A\uFF09", style: inputStyle }),
		      (0, import_jsx_runtime.jsx)("div", { children: (0, import_jsx_runtime.jsx)("button", { onClick: createUser, style: primaryBtnStyle, children: "\u521B\u5EFA\u7528\u6237" }) })
		    ] }),
		    // 用户列表
		    userList,
		    error && (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-state-error-primary)", fontSize: 13 }, children: error }),
		    notice && (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-state-success-primary)", fontSize: 13 }, children: notice })
		  ] });
		}

		return module.exports;
	}
});
