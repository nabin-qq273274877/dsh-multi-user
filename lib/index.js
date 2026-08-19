// src/host/index.ts
import { createRequire } from "node:module";
import * as fs3 from "node:fs";
import { dshHomePath, resolveDshHome } from "@deepseek-ai/dsh-home-paths";

// src/store.ts
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

// src/types.ts
var SCHEMA_VERSION = 1;
function defaultSettings() {
  return {
    schemaVersion: SCHEMA_VERSION,
    enabled: true,
    enabledAt: null,
    disabledAt: null,
    ownerUserId: null,
    auth: {
      methods: {
        password: { enabled: true }
      },
      sessionTtlDays: 7,
      lockoutThreshold: 5,
      lockoutMinutes: 10
    }
  };
}
function mergeSettings(saved) {
  const def = defaultSettings();
  if (!saved || typeof saved !== "object") return def;
  return {
    ...def,
    ...saved,
    schemaVersion: SCHEMA_VERSION,
    auth: {
      ...def.auth,
      ...saved.auth ?? {},
      methods: {
        password: { ...def.auth.methods.password, ...saved.auth?.methods?.password ?? {} }
      }
    }
  };
}
function toPublicView(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    status: u.status,
    hasPassword: !!u.bindings.password,
    createdAt: u.createdAt
  };
}

// src/store.ts
var SCRYPT_N = 16384;
var SCRYPT_r = 8;
var SCRYPT_p = 1;
var KEY_LEN = 64;
function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain.normalize("NFKC"), salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
  return {
    algo: "scrypt",
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
    saltB64: salt.toString("base64"),
    hashB64: hash.toString("base64")
  };
}
function verifyPassword(plain, record) {
  try {
    const salt = Buffer.from(record.saltB64, "base64");
    const expected = Buffer.from(record.hashB64, "base64");
    const actual = crypto.scryptSync(plain.normalize("NFKC"), salt, expected.length, {
      N: record.N,
      r: record.r,
      p: record.p
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw new Error(`[dsh-multi-user] JSON \u6587\u4EF6\u635F\u574F\u6216\u4E0D\u53EF\u8BFB: ${file} \u2014 ${err.message}`);
  }
}
function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 384 });
  fs.renameSync(tmp, file);
}
var DataStore = class {
  root;
  /** DSH 主目录（$DSH_HOME），专属目录父根 `$DSH_HOME/workspaces/` 据此计算。 */
  dshHome;
  constructor(root, dshHome2) {
    this.root = root;
    this.dshHome = dshHome2;
    fs.mkdirSync(path.join(root, "tenants"), { recursive: true });
  }
  get settingsPath() {
    return path.join(this.root, "settings.json");
  }
  get usersPath() {
    return path.join(this.root, "users.json");
  }
  grantsPath(userId) {
    return path.join(this.root, "tenants", userId, "grants.json");
  }
  getSettings() {
    return mergeSettings(readJson(this.settingsPath));
  }
  saveSettings(s) {
    writeJsonAtomic(this.settingsPath, s);
  }
  listUsers() {
    return readJson(this.usersPath) ?? [];
  }
  saveUsers(users) {
    writeJsonAtomic(this.usersPath, users);
  }
  getUserById(id) {
    return this.listUsers().find((u) => u.id === id) ?? null;
  }
  getUserByUsername(username) {
    const lower = username.toLowerCase();
    return this.listUsers().find((u) => u.username.toLowerCase() === lower) ?? null;
  }
  async createUser(input) {
    const users = this.listUsers();
    const account = {
      id: "u_" + crypto.randomBytes(8).toString("hex"),
      username: input.username,
      displayName: input.displayName ?? input.username,
      role: input.role,
      status: "active",
      bindings: input.passwordHash ? { password: input.passwordHash } : {},
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    users.push(account);
    this.saveUsers(users);
    this.setWorkspaceRoot(account.id, this.workspaceRootPath(account.id));
    return account;
  }
  async updateUser(id, patch) {
    const users = this.listUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx < 0) return null;
    users[idx] = patch(users[idx]);
    this.saveUsers(users);
    return users[idx];
  }
  async anonymizeUser(id) {
    const users = this.listUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx < 0) return false;
    const prev = users[idx];
    users[idx] = {
      id: prev.id,
      username: `deleted_${id}`,
      displayName: "(\u5DF2\u5220\u9664)",
      role: prev.role,
      status: "disabled",
      bindings: {},
      createdAt: prev.createdAt,
      disabledAt: (/* @__PURE__ */ new Date()).toISOString(),
      anonymized: true
    };
    this.saveUsers(users);
    return true;
  }
  /* ---------- 专属工作区目录（每用户一个，按 userId 自动生成） ---------- */
  /** 由 userId 生成专属目录绝对路径：$DSH_HOME/workspaces/<userId>（保证不重名）。 */
  workspaceRootPath(userId) {
    return path.join(this.dshHome, "workspaces", userId);
  }
  /** 读取某用户的专属目录；无记录时回退到按 userId 生成的默认路径。 */
  getWorkspaceRoot(userId) {
    const record = readJson(this.grantsPath(userId));
    if (record?.workspaceRoot) return record.workspaceRoot;
    if (record && Array.isArray(record.workspaceDirs) && record.workspaceDirs.length > 0) return record.workspaceDirs[0];
    return this.workspaceRootPath(userId);
  }
  /** 写入某用户的专属目录，并确保目录真实存在。 */
  setWorkspaceRoot(userId, workspaceRoot) {
    writeJsonAtomic(this.grantsPath(userId), { workspaceRoot, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    fs.mkdirSync(workspaceRoot, { recursive: true });
  }
};

// src/lifecycle.ts
var LifecycleManager = class {
  store;
  constructor(store) {
    this.store = store;
  }
  /** fresh：尚未设置主管理员；admin-set：已有主管理员。 */
  state() {
    const s = this.store.getSettings();
    if (s.ownerUserId && this.store.getUserById(s.ownerUserId)) return "admin-set";
    return "fresh";
  }
  /** 设置 / 重设主管理员（仅 fresh 态）。 */
  async setOwner(input) {
    if (this.state() === "admin-set") {
      return { ok: false, error: "\u4E3B\u7BA1\u7406\u5458\u5DF2\u8BBE\u7F6E\uFF0C\u4E0D\u53EF\u91CD\u590D\u521D\u59CB\u5316" };
    }
    const username = (input.username ?? "").trim();
    if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) {
      return { ok: false, error: "\u7528\u6237\u540D\u9700\u4E3A 2-32 \u4F4D\u5B57\u6BCD/\u6570\u5B57/_.-" };
    }
    if ((input.password ?? "").length < 6) {
      return { ok: false, error: "\u521D\u59CB\u5BC6\u7801\u81F3\u5C11 6 \u4F4D" };
    }
    const owner = await this.store.createUser({
      username,
      displayName: username,
      role: "owner",
      passwordHash: hashPassword(input.password)
    });
    const settings = this.store.getSettings();
    settings.ownerUserId = owner.id;
    settings.enabledAt = (/* @__PURE__ */ new Date()).toISOString();
    this.store.saveSettings(settings);
    return { ok: true, userId: owner.id };
  }
};

// src/jwt.ts
import * as crypto2 from "node:crypto";
import * as fs2 from "node:fs";
import * as path2 from "node:path";
var DEFAULT_TTL_DAYS = 7;
function b64url(buf) {
  return buf.toString("base64url");
}
function sign(data, secret) {
  return crypto2.createHmac("sha256", secret).update(data).digest("base64url");
}
function loadOrCreateSecret(dataRoot2) {
  const secretPath = path2.join(dataRoot2, ".jwt-secret");
  try {
    const existing = fs2.readFileSync(secretPath, "utf8").trim();
    if (existing.length >= 32) return existing;
  } catch {
  }
  const secret = crypto2.randomBytes(48).toString("base64url");
  fs2.mkdirSync(dataRoot2, { recursive: true });
  fs2.writeFileSync(secretPath, secret, { mode: 384 });
  try {
    fs2.chmodSync(secretPath, 384);
  } catch {
  }
  return secret;
}
function signJwt(claims, secret, ttlDays = DEFAULT_TTL_DAYS) {
  const now = Math.floor(Date.now() / 1e3);
  const payload = {
    ...claims,
    iat: now,
    exp: now + ttlDays * 86400
  };
  const header = { alg: "HS256", typ: "JWT" };
  const h = b64url(Buffer.from(JSON.stringify(header)));
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const s = sign(`${h}.${p}`, secret);
  return `${h}.${p}.${s}`;
}
function verifyJwt(token, secret) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = sign(`${h}.${p}`, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(s);
  if (a.length !== b.length || !crypto2.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp * 1e3 <= Date.now()) return null;
    if (typeof payload.userId !== "string" || payload.userId.length === 0) return null;
    return payload;
  } catch {
    return null;
  }
}

// src/host/index.ts
var name = "dsh-multi-user";
var inject = ["webServer"];
var JWT_COOKIE = "dsh_mu_jwt";
function dshHome() {
  return resolveDshHome();
}
function dataRoot() {
  return dshHomePath("plugins-data", "dsh-multi-user");
}
function parseCookie(header, key) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === key) return part.slice(idx + 1).trim();
  }
  return null;
}
function currentUserId(store, req) {
  const token = parseCookie(req.headers.cookie, JWT_COOKIE);
  if (!token) return null;
  const payload = verifyJwt(token, loadOrCreateSecret(dataRoot()));
  if (!payload) return null;
  const user = store.getUserById(payload.userId);
  if (!user || user.status !== "active" || user.anonymized) return null;
  return payload.userId;
}
function json(res, status, body, extraHeaders) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...extraHeaders ?? {} });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(typeof parsed === "object" && parsed !== null ? parsed : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}
function resolveDistIndex() {
  const require2 = createRequire(import.meta.url);
  try {
    return require2.resolve("@deepseek-ai/dsh-web-frontend/dist/index.html");
  } catch {
    return null;
  }
}
var cachedDistIndex;
function distIndexPath() {
  if (cachedDistIndex === void 0) cachedDistIndex = resolveDistIndex();
  return cachedDistIndex;
}
function shell(title, bodyHtml, script) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
:root{--ink:#191D2E;--muted:#5C637A;--rule:#E4E7F1;--accent:#4F46E5;--ok:#0F9D6E;--danger:#D64550;--bg:#F6F7FB}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'PingFang SC','Microsoft YaHei',sans-serif;background:var(--bg);color:var(--ink);display:flex;align-items:center;justify-content:center;min-height:100vh;font-size:16px;line-height:1.6}
.box{width:min(420px,92vw);background:#fff;border:1px solid var(--rule);border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(25,29,46,.08)}
.head{padding:26px 24px 16px;text-align:center;border-bottom:1px solid var(--rule)}
.head .logo{font-weight:700;font-size:1.15rem;color:var(--accent)}
.head .sub{font-size:.8rem;color:var(--muted);margin-top:4px}
.body{padding:22px 24px 26px}
.field{margin-bottom:14px}
.field label{display:block;font-size:.8rem;font-weight:600;color:var(--muted);margin-bottom:5px}
.input{width:100%;padding:9px 12px;border:1px solid var(--rule);border-radius:8px;font-size:.9rem;font-family:inherit;outline:none}
.input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(79,70,229,.12)}
.btn{display:inline-flex;align-items:center;justify-content:center;width:100%;padding:10px 18px;border-radius:8px;border:1px solid var(--accent);background:var(--accent);color:#fff;font-size:.9rem;font-weight:600;cursor:pointer;font-family:inherit}
.btn:disabled{opacity:.5;cursor:not-allowed}
.toast{margin-top:12px;padding:9px 14px;border-radius:8px;font-size:.84rem;display:none}
.toast.ok{display:block;background:rgba(15,157,110,.1);color:var(--ok);border:1px solid rgba(15,157,110,.25)}
.toast.err{display:block;background:rgba(214,69,80,.08);color:var(--danger);border:1px solid rgba(214,69,80,.25)}
</style>
</head>
<body>
<div class="box">
  <div class="head"><div class="logo">dsh-multi-user</div><div class="sub">${title}</div></div>
  <div class="body">${bodyHtml}</div>
</div>
<script>${script}</script>
</body>
</html>`;
}
function renderLoginPage() {
  return shell("\u767B\u5F55", `
    <div class="field"><label>\u7528\u6237\u540D</label><input class="input" id="u" autocomplete="username"></div>
    <div class="field"><label>\u5BC6\u7801</label><input class="input" id="p" type="password" autocomplete="current-password"></div>
    <button class="btn" id="go">\u767B \u5F55</button>
    <div class="toast" id="t"></div>
  `, `
    (function(){
      function toast(m,ty){var t=document.getElementById('t');t.textContent=m;t.className='toast '+(ty||'err');}
      function post(url,body){return fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})}).then(function(r){return r.json().then(function(j){return {status:r.status,json:j}})});}
      document.getElementById('go').onclick=function(){
        var u=document.getElementById('u').value.trim();
        var p=document.getElementById('p').value;
        if(!u||!p)return toast('\u8BF7\u8F93\u5165\u7528\u6237\u540D\u4E0E\u5BC6\u7801','err');
        var btn=this;btn.disabled=true;btn.textContent='\u767B\u5F55\u4E2D\u2026';
        post('/api/mu/auth/password',{username:u,password:p}).then(function(r){
          if(r.json.ok){location.href='/';}
          else{btn.disabled=false;btn.textContent='\u767B \u5F55';toast(r.json.message||'\u7528\u6237\u540D\u6216\u5BC6\u7801\u9519\u8BEF','err');}
        });
      };
    })();
  `);
}
function renderSetupPage() {
  return shell("\u521D\u59CB\u5316", `
    <p style="font-size:.88rem;color:var(--muted);margin-bottom:18px">\u7CFB\u7EDF\u8FD8\u6CA1\u6709\u4EFB\u4F55\u7528\u6237\u3002\u8BF7\u5148\u8BBE\u7F6E\u4E3B\u7BA1\u7406\u5458\u3002</p>
    <div class="field"><label>\u7BA1\u7406\u5458\u7528\u6237\u540D</label><input class="input" id="u" autocomplete="username"></div>
    <div class="field"><label>\u521D\u59CB\u5BC6\u7801</label><input class="input" id="p" type="password" autocomplete="new-password"></div>
    <div class="field"><label>\u786E\u8BA4\u5BC6\u7801</label><input class="input" id="p2" type="password" autocomplete="new-password"></div>
    <button class="btn" id="go">\u8BBE\u7F6E\u4E3B\u7BA1\u7406\u5458</button>
    <div class="toast" id="t"></div>
  `, `
    (function(){
      function toast(m,ty){var t=document.getElementById('t');t.textContent=m;t.className='toast '+(ty||'err');}
      function post(url,body){return fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})}).then(function(r){return r.json().then(function(j){return {status:r.status,json:j}})});}
      document.getElementById('go').onclick=function(){
        var u=document.getElementById('u').value.trim();
        var p=document.getElementById('p').value, p2=document.getElementById('p2').value;
        if(!u)return toast('\u8BF7\u8F93\u5165\u7BA1\u7406\u5458\u7528\u6237\u540D','err');
        if(p.length<6)return toast('\u521D\u59CB\u5BC6\u7801\u81F3\u5C11 6 \u4F4D','err');
        if(p!==p2)return toast('\u4E24\u6B21\u8F93\u5165\u7684\u5BC6\u7801\u4E0D\u4E00\u81F4','err');
        var btn=this;btn.disabled=true;btn.textContent='\u8BBE\u7F6E\u4E2D\u2026';
        post('/api/mu/admin/owner',{username:u,password:p}).then(function(r){
          if(r.json.ok){toast('\u4E3B\u7BA1\u7406\u5458\u5DF2\u8BBE\u7F6E\uFF0C\u6B63\u5728\u81EA\u52A8\u767B\u5F55\u2026','ok');setTimeout(function(){location.href='/';},500);}
          else{btn.disabled=false;btn.textContent='\u8BBE\u7F6E\u4E3B\u7BA1\u7406\u5458';toast(r.json.error||'\u8BBE\u7F6E\u5931\u8D25','err');}
        });
      };
    })();
  `);
}
function sessionTtlDays(store) {
  return store.getSettings().auth.sessionTtlDays || 7;
}
function finishLogin(store, res, user) {
  const secret = loadOrCreateSecret(dataRoot());
  const token = signJwt(
    { userId: user.id, username: user.username, role: user.role },
    secret,
    sessionTtlDays(store)
  );
  const maxAge = sessionTtlDays(store) * 86400;
  json(
    res,
    200,
    { ok: true, user: toPublicView(user) },
    { "set-cookie": `${JWT_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` }
  );
}
async function handleAuth(store, lifecycle, req, res, pathname) {
  const method = (req.method ?? "GET").toUpperCase();
  const key = `${method} ${pathname}`;
  if (key === "POST /api/mu/auth/password") {
    const body = await readBody(req);
    const username = String(body.username ?? "").trim();
    const plain = String(body.password ?? "");
    const user = store.getUserByUsername(username);
    if (!user || user.anonymized || user.status !== "active" || !user.bindings.password || !verifyPassword(plain, user.bindings.password)) {
      return json(res, 401, { ok: false, reason: "bad-credentials", message: "\u7528\u6237\u540D\u6216\u5BC6\u7801\u9519\u8BEF" });
    }
    return finishLogin(store, res, user);
  }
  if (key === "POST /api/mu/auth/logout") {
    return json(res, 200, { ok: true }, { "set-cookie": `${JWT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
  }
  if (key === "GET /api/mu/public/config") {
    return json(res, 200, { state: lifecycle.state() });
  }
  if (key === "GET /api/mu/auth/me") {
    const userId = currentUserId(store, req);
    if (!userId) return json(res, 401, { error: "unauthorized" });
    const user = store.getUserById(userId);
    return json(res, 200, { user: user ? toPublicView(user) : null });
  }
  return json(res, 404, { error: "not-found" });
}
async function handleAdmin(store, lifecycle, req, res, pathname) {
  const method = (req.method ?? "GET").toUpperCase();
  const key = `${method} ${pathname}`;
  if (key === "POST /api/mu/admin/owner") {
    if (lifecycle.state() !== "fresh") return json(res, 400, { ok: false, error: "\u4E3B\u7BA1\u7406\u5458\u5DF2\u8BBE\u7F6E" });
    const body = await readBody(req);
    const r = await lifecycle.setOwner({ username: String(body.username ?? ""), password: String(body.password ?? "") });
    if (!r.ok || !r.userId) return json(res, 400, r);
    const owner = store.getUserById(r.userId);
    if (!owner) return json(res, 500, { ok: false, error: "\u4E3B\u7BA1\u7406\u5458\u521B\u5EFA\u5931\u8D25" });
    finishLogin(store, res, owner);
    return;
  }
  const userId = currentUserId(store, req);
  if (!userId) return json(res, 401, { error: "unauthorized" });
  const actor = store.getUserById(userId);
  if (!actor) return json(res, 401, { error: "unauthorized" });
  if (key === "GET /api/mu/me/grants") {
    return json(res, 200, {
      userId,
      username: actor.username,
      role: actor.role,
      workspaceRoot: store.getWorkspaceRoot(userId)
    });
  }
  if (key === "POST /api/mu/me/password") {
    const body = await readBody(req);
    const oldPw = String(body.oldPassword ?? "");
    const newPw = String(body.newPassword ?? "");
    if (!actor.bindings.password || !verifyPassword(oldPw, actor.bindings.password)) {
      return json(res, 400, { ok: false, error: "\u5F53\u524D\u5BC6\u7801\u9519\u8BEF" });
    }
    if (newPw.length < 6) return json(res, 400, { ok: false, error: "\u65B0\u5BC6\u7801\u81F3\u5C11 6 \u4F4D" });
    await store.updateUser(userId, (u) => ({ ...u, bindings: { ...u.bindings, password: hashPassword(newPw) } }));
    return json(res, 200, { ok: true });
  }
  const isOwner = actor.role === "owner" && !actor.anonymized;
  if (!isOwner) return json(res, 403, { error: "forbidden" });
  if (key === "GET /api/mu/admin/users") {
    const list = store.listUsers().filter((u) => !u.anonymized).map((u) => ({ ...toPublicView(u), workspaceRoot: store.getWorkspaceRoot(u.id) }));
    return json(res, 200, list);
  }
  if (key === "POST /api/mu/admin/users") {
    const body = await readBody(req);
    const username = String(body.username ?? "").trim();
    if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) return json(res, 400, { ok: false, error: "\u7528\u6237\u540D\u9700\u4E3A 2-32 \u4F4D\u5B57\u6BCD/\u6570\u5B57/_.-" });
    if (store.getUserByUsername(username)) return json(res, 400, { ok: false, error: "\u7528\u6237\u540D\u5DF2\u5B58\u5728" });
    const initialPassword = String(body.initialPassword ?? "");
    if (!initialPassword || initialPassword.length < 6) return json(res, 400, { ok: false, error: "\u521D\u59CB\u5BC6\u7801\u81F3\u5C11 6 \u4F4D" });
    const user = await store.createUser({
      username,
      displayName: String(body.displayName ?? username),
      role: "member",
      passwordHash: hashPassword(initialPassword)
    });
    return json(res, 200, { ok: true, user: toPublicView(user), workspaceRoot: store.getWorkspaceRoot(user.id) });
  }
  if (key === "POST /api/mu/admin/users/update") {
    const body = await readBody(req);
    const targetId = String(body.userId ?? "");
    const target = store.getUserById(targetId);
    if (!target || target.anonymized) return json(res, 404, { ok: false, error: "user-not-found" });
    if (target.role === "owner" && body.status === "disabled") return json(res, 400, { ok: false, error: "\u4E0D\u80FD\u505C\u7528\u4E3B\u7BA1\u7406\u5458" });
    const patch = {};
    if (body.status === "active" || body.status === "disabled") patch.status = body.status;
    if (typeof body.displayName === "string") patch.displayName = body.displayName;
    await store.updateUser(targetId, (u) => ({ ...u, ...patch }));
    return json(res, 200, { ok: true });
  }
  if (key === "POST /api/mu/admin/users/reset-password") {
    const body = await readBody(req);
    const target = store.getUserById(String(body.userId ?? ""));
    if (!target) return json(res, 404, { ok: false, error: "user-not-found" });
    const pw = String(body.password ?? "");
    if (pw.length < 6) return json(res, 400, { ok: false, error: "\u5BC6\u7801\u81F3\u5C11 6 \u4F4D" });
    await store.updateUser(target.id, (u) => ({ ...u, bindings: { ...u.bindings, password: hashPassword(pw) } }));
    return json(res, 200, { ok: true });
  }
  if (key === "POST /api/mu/admin/users/delete") {
    const body = await readBody(req);
    const target = store.getUserById(String(body.userId ?? ""));
    if (!target) return json(res, 404, { ok: false, error: "user-not-found" });
    if (target.role === "owner") return json(res, 400, { ok: false, error: "\u4E0D\u80FD\u5220\u9664\u4E3B\u7BA1\u7406\u5458" });
    await store.anonymizeUser(target.id);
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: "not-found" });
}
function apply(ctx) {
  const webServer = ctx.webServer;
  const store = new DataStore(dataRoot(), dshHome());
  const lifecycle = new LifecycleManager(store);
  ctx.effect(() => webServer.register({
    kind: "exact",
    path: "/",
    handler: async (req, res) => {
      const userId = currentUserId(store, req);
      if (userId) {
        const dist = distIndexPath();
        if (dist) {
          try {
            const html = webServer.applyIndexTaps(fs3.readFileSync(dist, "utf8"));
            res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            res.end(html);
            return;
          } catch {
          }
        }
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end("dsh-multi-user: \u65E0\u6CD5\u89E3\u6790 frontend dist");
        return;
      }
      const page = lifecycle.state() === "fresh" ? renderSetupPage() : renderLoginPage();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page);
    }
  }), "dsh-multi-user: login wall");
  ctx.effect(() => webServer.register({
    kind: "prefix",
    path: "/api/mu",
    handler: async (req, res) => {
      const pathname = new URL(req.url ?? "/", "http://x").pathname;
      if (pathname.startsWith("/api/mu/auth/") || pathname === "/api/mu/public/config") {
        return handleAuth(store, lifecycle, req, res, pathname);
      }
      if (pathname.startsWith("/api/mu/admin/") || pathname.startsWith("/api/mu/me/")) {
        return handleAdmin(store, lifecycle, req, res, pathname);
      }
      return json(res, 404, { error: "not-found" });
    }
  }), "dsh-multi-user: api routes");
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
