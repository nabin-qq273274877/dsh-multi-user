/**
 * dsh-multi-user 正式插件 — Host 入口（Node 环境，函数式 Cordis 插件）。
 *
 * 职责：
 *  1. 登录墙：注册 `exact` 路由 `/`，未登录渲染初始化页/登录页；已登录
 *     读 distIndex + applyIndexTaps 返回与 fallback 等价的 index.html；
 *  2. 认证 + 用户管理 API：`/api/mu/*`（prefix 路由）；
 *  3. JWT：登录成功 HMAC-SHA256 自签 JWT 写 cookie（HttpOnly），分档阶段
 *     由 client 入口经 `/api/mu/me/grants` 拿身份（浏览器自动携带 HttpOnly
 *     cookie，Host 侧验签）；
 *  4. 用户 → 工作区目录映射持久化（$DSH_HOME/plugins-data/dsh-multi-user/）。
 *
 * 形态对齐官方 `dsh-web-app` / `dsh-lan-access`：函数式 `apply(ctx)` +
 * `inject` + `name`，经 `cordis.patch.yml` 的 `insert` 挂载。
 */

import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import { DataStore, hashPassword, verifyPassword } from '../store.js';
import { LifecycleManager } from '../lifecycle.js';
import { loadOrCreateSecret, signJwt, verifyJwt } from '../jwt.js';
import { toPublicView, type UserAccount } from '../types.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const name = 'dsh-multi-user';
export const inject = ['webServer'];

/** JWT 存 cookie 的键名。 */
const JWT_COOKIE = 'dsh_mu_jwt';

/** 插件数据目录：$DSH_HOME/plugins-data/dsh-multi-user */
function dataRoot(): string {
  return dshHomePath('plugins-data', 'dsh-multi-user');
}

/** 由 cookie 头解析 JWT cookie 值。 */
function parseCookie(header: string | undefined, key: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === key) return part.slice(idx + 1).trim();
  }
  return null;
}

/** 解析 JWT 载荷里的 userId；无效返回 null。 */
function currentUserId(store: DataStore, req: IncomingMessage): string | null {
  const token = parseCookie(req.headers.cookie, JWT_COOKIE);
  if (!token) return null;
  const payload = verifyJwt(token, loadOrCreateSecret(dataRoot()));
  if (!payload) return null;
  const user = store.getUserById(payload.userId);
  if (!user || user.status !== 'active' || user.anonymized) return null;
  return payload.userId;
}

/* ---------------- JSON 响应工具 ---------------- */

function json(res: ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, string>): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...(extraHeaders ?? {}) });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(typeof parsed === 'object' && parsed !== null ? parsed : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

/* ---------------- index.html（已登录放行） ----------------

 * 读取 web-frontend dist 的 index.html 并跑 index taps（boot 清单注入），
 * 与 frontend-static 的 fallback 行为等价。
 */

function resolveDistIndex(): string | null {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('@deepseek-ai/dsh-web-frontend/dist/index.html');
  } catch {
    return null;
  }
}

let cachedDistIndex: string | null | undefined;
function distIndexPath(): string | null {
  if (cachedDistIndex === undefined) cachedDistIndex = resolveDistIndex();
  return cachedDistIndex;
}

/* ---------------- 页面渲染（自包含 HTML） ---------------- */

function shell(title: string, bodyHtml: string, script: string): string {
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

function renderLoginPage(): string {
  return shell('登录', `
    <div class="field"><label>用户名</label><input class="input" id="u" autocomplete="username"></div>
    <div class="field"><label>密码</label><input class="input" id="p" type="password" autocomplete="current-password"></div>
    <button class="btn" id="go">登 录</button>
    <div class="toast" id="t"></div>
  `, `
    (function(){
      function toast(m,ty){var t=document.getElementById('t');t.textContent=m;t.className='toast '+(ty||'err');}
      function post(url,body){return fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})}).then(function(r){return r.json().then(function(j){return {status:r.status,json:j}})});}
      document.getElementById('go').onclick=function(){
        var u=document.getElementById('u').value.trim();
        var p=document.getElementById('p').value;
        if(!u||!p)return toast('请输入用户名与密码','err');
        var btn=this;btn.disabled=true;btn.textContent='登录中…';
        post('/api/mu/auth/password',{username:u,password:p}).then(function(r){
          if(r.json.ok){location.href='/';}
          else{btn.disabled=false;btn.textContent='登 录';toast(r.json.message||'用户名或密码错误','err');}
        });
      };
    })();
  `);
}

function renderSetupPage(): string {
  return shell('初始化', `
    <p style="font-size:.88rem;color:var(--muted);margin-bottom:18px">系统还没有任何用户。请先设置主管理员。</p>
    <div class="field"><label>管理员用户名</label><input class="input" id="u" autocomplete="username"></div>
    <div class="field"><label>初始密码</label><input class="input" id="p" type="password" autocomplete="new-password"></div>
    <div class="field"><label>确认密码</label><input class="input" id="p2" type="password" autocomplete="new-password"></div>
    <button class="btn" id="go">设置主管理员</button>
    <div class="toast" id="t"></div>
  `, `
    (function(){
      function toast(m,ty){var t=document.getElementById('t');t.textContent=m;t.className='toast '+(ty||'err');}
      function post(url,body){return fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})}).then(function(r){return r.json().then(function(j){return {status:r.status,json:j}})});}
      document.getElementById('go').onclick=function(){
        var u=document.getElementById('u').value.trim();
        var p=document.getElementById('p').value, p2=document.getElementById('p2').value;
        if(!u)return toast('请输入管理员用户名','err');
        if(p.length<6)return toast('初始密码至少 6 位','err');
        if(p!==p2)return toast('两次输入的密码不一致','err');
        var btn=this;btn.disabled=true;btn.textContent='设置中…';
        post('/api/mu/admin/owner',{username:u,password:p}).then(function(r){
          if(r.json.ok){toast('主管理员已设置，正在自动登录…','ok');setTimeout(function(){location.href='/';},500);}
          else{btn.disabled=false;btn.textContent='设置主管理员';toast(r.json.error||'设置失败','err');}
        });
      };
    })();
  `);
}

/* ---------------- 认证 / 用户管理 API ---------------- */

function sessionTtlDays(store: DataStore): number {
  return store.getSettings().auth.sessionTtlDays || 7;
}

function finishLogin(store: DataStore, res: ServerResponse, user: UserAccount): void {
  const secret = loadOrCreateSecret(dataRoot());
  const token = signJwt(
    { userId: user.id, username: user.username, role: user.role },
    secret,
    sessionTtlDays(store),
  );
  const maxAge = sessionTtlDays(store) * 86400;
  json(
    res,
    200,
    { ok: true, user: toPublicView(user) },
    { 'set-cookie': `${JWT_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` },
  );
}

async function handleAuth(store: DataStore, lifecycle: LifecycleManager, req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  const method = (req.method ?? 'GET').toUpperCase();
  const key = `${method} ${pathname}`;

  if (key === 'POST /api/mu/auth/password') {
    const body = await readBody(req);
    const username = String(body.username ?? '').trim();
    const plain = String(body.password ?? '');
    const user = store.getUserByUsername(username);
    if (!user || user.anonymized || user.status !== 'active' || !user.bindings.password || !verifyPassword(plain, user.bindings.password)) {
      return json(res, 401, { ok: false, reason: 'bad-credentials', message: '用户名或密码错误' });
    }
    return finishLogin(store, res, user);
  }

  if (key === 'POST /api/mu/auth/logout') {
    return json(res, 200, { ok: true }, { 'set-cookie': `${JWT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
  }

  if (key === 'GET /api/mu/public/config') {
    return json(res, 200, { state: lifecycle.state() });
  }

  if (key === 'GET /api/mu/auth/me') {
    const userId = currentUserId(store, req);
    if (!userId) return json(res, 401, { error: 'unauthorized' });
    const user = store.getUserById(userId);
    return json(res, 200, { user: user ? toPublicView(user) : null });
  }

  return json(res, 404, { error: 'not-found' });
}

async function handleAdmin(store: DataStore, lifecycle: LifecycleManager, req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  const method = (req.method ?? 'GET').toUpperCase();
  const key = `${method} ${pathname}`;

  // bootstrap：初始化主管理员（fresh 态免登录，成功后直接签 JWT 自动登录）
  if (key === 'POST /api/mu/admin/owner') {
    if (lifecycle.state() !== 'fresh') return json(res, 400, { ok: false, error: '主管理员已设置' });
    const body = await readBody(req);
    const r = await lifecycle.setOwner({ username: String(body.username ?? ''), password: String(body.password ?? '') });
    if (!r.ok || !r.userId) return json(res, 400, r);
    const owner = store.getUserById(r.userId);
    if (!owner) return json(res, 500, { ok: false, error: '主管理员创建失败' });
    // setup 完成即自动登录：签发 JWT 写 cookie，前端跳转 / 直接进入 DSH
    finishLogin(store, res, owner);
    return;
  }

  // 其余管理接口需登录
  const userId = currentUserId(store, req);
  if (!userId) return json(res, 401, { error: 'unauthorized' });
  const actor = store.getUserById(userId);
  if (!actor) return json(res, 401, { error: 'unauthorized' });

  // 当前用户自己的授权（所有登录用户可用，不是 admin 专属）
  if (key === 'GET /api/mu/me/grants') {
    return json(res, 200, {
      userId,
      username: actor.username,
      role: actor.role,
      workspaceDirs: store.getGrants(userId),
    });
  }

  const isOwner = actor.role === 'owner' && !actor.anonymized;
  if (!isOwner) return json(res, 403, { error: 'forbidden' });

  // 用户列表
  if (key === 'GET /api/mu/admin/users') {
    return json(res, 200, store.listUsers().filter((u) => !u.anonymized).map(toPublicView));
  }

  // 新建子用户
  if (key === 'POST /api/mu/admin/users') {
    const body = await readBody(req);
    const username = String(body.username ?? '').trim();
    if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) return json(res, 400, { ok: false, error: '用户名需为 2-32 位字母/数字/_.-' });
    if (store.getUserByUsername(username)) return json(res, 400, { ok: false, error: '用户名已存在' });
    const initialPassword = String(body.initialPassword ?? '');
    if (!initialPassword || initialPassword.length < 6) return json(res, 400, { ok: false, error: '初始密码至少 6 位' });
    const user = await store.createUser({
      username,
      displayName: String(body.displayName ?? username),
      role: 'member',
      passwordHash: hashPassword(initialPassword),
    });
    const dirs = Array.isArray(body.workspaceDirs) ? (body.workspaceDirs as unknown[]).filter((d): d is string => typeof d === 'string') : [];
    store.saveGrants(user.id, dirs);
    return json(res, 200, { ok: true, user: toPublicView(user) });
  }

  // 更新用户（状态 / 显示名）
  if (key === 'POST /api/mu/admin/users/update') {
    const body = await readBody(req);
    const targetId = String(body.userId ?? '');
    const target = store.getUserById(targetId);
    if (!target || target.anonymized) return json(res, 404, { ok: false, error: 'user-not-found' });
    if (target.role === 'owner' && body.status === 'disabled') return json(res, 400, { ok: false, error: '不能停用主管理员' });
    const patch: Partial<{ status: 'active' | 'disabled'; displayName: string }> = {};
    if (body.status === 'active' || body.status === 'disabled') patch.status = body.status;
    if (typeof body.displayName === 'string') patch.displayName = body.displayName;
    await store.updateUser(targetId, (u) => ({ ...u, ...patch }));
    return json(res, 200, { ok: true });
  }

  // 授权工作区（用户 → 目录列表）
  if (key === 'POST /api/mu/admin/users/grants') {
    const body = await readBody(req);
    const targetId = String(body.userId ?? '');
    const target = store.getUserById(targetId);
    if (!target) return json(res, 404, { ok: false, error: 'user-not-found' });
    const dirs = Array.isArray(body.workspaceDirs) ? (body.workspaceDirs as unknown[]).filter((d): d is string => typeof d === 'string') : [];
    store.saveGrants(targetId, dirs);
    return json(res, 200, { ok: true });
  }

  // 重置密码
  if (key === 'POST /api/mu/admin/users/reset-password') {
    const body = await readBody(req);
    const target = store.getUserById(String(body.userId ?? ''));
    if (!target) return json(res, 404, { ok: false, error: 'user-not-found' });
    const pw = String(body.password ?? '');
    if (pw.length < 6) return json(res, 400, { ok: false, error: '密码至少 6 位' });
    await store.updateUser(target.id, (u) => ({ ...u, bindings: { ...u.bindings, password: hashPassword(pw) } }));
    return json(res, 200, { ok: true });
  }

  // 删除用户（匿名化保留）
  if (key === 'POST /api/mu/admin/users/delete') {
    const body = await readBody(req);
    const target = store.getUserById(String(body.userId ?? ''));
    if (!target) return json(res, 404, { ok: false, error: 'user-not-found' });
    if (target.role === 'owner') return json(res, 400, { ok: false, error: '不能删除主管理员' });
    await store.anonymizeUser(target.id);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: 'not-found' });
}

/* ---------------- 插件 apply ---------------- */

export function apply(ctx: any): void {
  const webServer = ctx.webServer as any;
  const store = new DataStore(dataRoot());
  const lifecycle = new LifecycleManager(store);

  // 1) 登录墙：拦截 `/`（exact）
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const userId = currentUserId(store, req);
      if (userId) {
        // 已登录：返回与 fallback 等价的 index.html
        const dist = distIndexPath();
        if (dist) {
          try {
            const html = webServer.applyIndexTaps(fs.readFileSync(dist, 'utf8'));
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
          } catch {
            /* 读取失败则落到 500 */
          }
        }
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('dsh-multi-user: 无法解析 frontend dist');
        return;
      }
      // 未登录：按生命周期渲染初始化页 / 登录页
      const page = lifecycle.state() === 'fresh' ? renderSetupPage() : renderLoginPage();
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(page);
    },
  }), 'dsh-multi-user: login wall');

  // 2) 认证 / 用户管理 API（prefix）
  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: '/api/mu',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const pathname = new URL(req.url ?? '/', 'http://x').pathname;
      if (pathname.startsWith('/api/mu/auth/') || pathname === '/api/mu/public/config') {
        return handleAuth(store, lifecycle, req, res, pathname);
      }
      if (pathname.startsWith('/api/mu/admin/') || pathname.startsWith('/api/mu/me/')) {
        return handleAdmin(store, lifecycle, req, res, pathname);
      }
      return json(res, 404, { error: 'not-found' });
    },
  }), 'dsh-multi-user: api routes');
}
