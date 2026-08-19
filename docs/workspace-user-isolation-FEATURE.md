# 功能文档：单进程按「用户 ID」分档工作区记录（JWT 版）

> 状态：**草案（待评审）** — 本文档只做需求澄清与技术可行性确认，不包含代码。
> 范围：单进程、不做网关、不搞多进程、不考虑插件/模型凭据/会话历史以外的任何分档。
> 目标：
> 1. 通过 JWT（存 cookie；认证调后端、分档浏览器端自查）识别用户（不走 URL 路由）；
> 2. 每个用户看到的工作区记录彼此分档（互不串）。
>
> **注**：本特性定位是「**视图分档**」（view partitioning），不是「隔离」（安全/权限隔离）。详见 §7 安全边界。
>
> **⚠️ 重要前提声明（2026-08-18 补充）**：本文档 §2.1～§2.9 的「读不到 URL / cookie / localStorage、RPC 不认人」等所有结论，**均基于「dynamic Cordis 插件」形态**（`cordis_define`/`cordis_run` 临时挂载、受沙箱白名单限制）。**此结论对「正式插件」（打进 shell bundle 的独立 npm 包，如 `dsh-client-ui-*`）不成立**——正式 client 插件的代码是普通浏览器代码，可直接读 `window.location`/`document.cookie`/`localStorage`、可发 `fetch`。见 §2.10。

---

## 0. 架构认知（实现前必须建立的正确心智模型）

### 0.1 「Web GUI」不是「一个插件」，而是「一个 shell + 几十个官方插件」

DSH 的 Web GUI 由三部分组成：

1. **前端 shell（`dsh-web-frontend` 打包出的 bundle，`index-*.js`）**：Vite 构建产物，负责激活 client 插件树；
2. **一批 client 插件（`dsh-client-ui-*`）**：侧边栏、设置、主题、工作区浏览、会话视图、布局等，全都由它们贡献；
3. **一批 host 插件（`dsh-host-*`）**：HTTP 服务器（`dsh-host-webserver`）、API 代理、工作区注册表（`dsh-workspace`）、设置系统（`dsh-settings`/`dsh-settings-file`）等。

这些通过一个 **Cordis 组合（composition）** 拼成完整应用。所以：

- **「原生 UI」= 「官方插件挂出来的 UI」**。所谓「接管 `sidebar.workspaces` 遮蔽原生 UI」，准确含义是：官方 `dsh-client-ui-sidebar` 注册了那个 Slot，你的插件要么与它共存、要么替换它的 occupant——它们是**插件贡献**的，不是写死在 shell 里的。
- **`dsh-multi-user` 本质 = 再往这个组合里加一个插件**，与 `dsh-client-ui-sidebar` 平级。本特性采用**正式插件形态**（独立 npm 包、打进 shell bundle），与官方插件同级（见 §2.10）。

**结论**：实现「按用户过滤工作区」不需要改 shell，只需**新增一个正式插件**，用对官方插件已暴露的扩展点（`sidebar.workspaces` 等）。身份识别走「JWT 存 cookie」（认证调后端、分档浏览器端自查，见 §4 D1）。

### 0.2 皮肤插件的持久化范式（仅作参考，本方案不采用 settings 存身份）

皮肤插件（`dsh-client-ui-theme`）如何保存「选择的皮肤」，是「客户端偏好如何持久化」的标准范式（查证自其源码）：

1. Host 入口 `settings.register("ui-theme", schema)`，字段 `preference`，底层写进 `$DSH_HOME/settings.yaml`；
2. Client 点选 → `setTheme(id)` → 经 Host settings API 写回；
3. Host 入口用 `webServer.tapIndex` 把偏好内联成 `<script>` 塞进 index HTML（首屏防闪白）。

> **注意**：本方案的「用户身份」**不走 settings、不走 tapIndex**（见 §2.4 与 §5）。这里引用皮肤插件，仅是为了说明「Host settings / tapIndex / store」各自的角色与边界，避免误用。

---

## 1. 需求来源与一句话定义

用户希望在**同一台机器、同一个 DSH 进程**内，区分不同用户，让每个用户只看到**自己的工作区列表**：

- 不做网关（放弃 `dsh-multi-user` 既有的 reverse-proxy 形态）；
- 不做多进程；
- **采用正式插件形态**（非 dynamic 插件，见 §2.10）；
- **用户身份 = JWT 存 cookie（认证调后端、分档浏览器端自查），不走 URL 路由**（见 D1，§4）；
- **自带登录墙**：挂载后访问 `/` 先过登录墙；未设主管理员显示初始化页，已设则显示登录页；登录成功插件签 JWT 写 cookie，跳转回 `/`（见 D6，§4）；
- **用户管理**：主管理员 setup 设置，其他用户在设置 →「用户管理」里添加（见 D6）；
- 插件启用时**隐藏原生工作区列表**，替换为「只显示当前用户的工作区」；
- 插件移除后**还原**为原生全量视图。

---

## 2. 技术可行性结论（基于运行时与源码查证，非推测）

### 2.1 关键运行时事实

| 事实 | 依据 | 对方案的影响 |
| --- | --- | --- |
| 原生工作区注册表是 Host 服务 `workspaceRegistry` | `Service.listService` | 全用户共享一张表，`list()` 无「用户」维度 |
| 侧边栏工作区浏览区是 Slot `sidebar.workspaces` | `Slots.listSubTree` | `single` 型，`replaceRisk: shadows-shipped-ui`（替换即遮蔽原生 UI） |
| 该 Slot 标准 props 提供 `useWorkspaces` / `useSessions` | 同上 | 接管后可拿工作区/会话 hook，但**不含用户维度** |
| 该 Slot owner props 提供 `wide` / `expandSidebar` | 同上 | 需自己处理宽/窄（rail）两态 |
| Host 有 HTTP 路由服务 `webServer.register` | `Service.listService` | 可注册 `exact`/`prefix` 路由，handler 拿到 `(req, res)` |
| Host 有 `harness.handle` / Client 有 `host.call` | `Builtin` | package-private JSON RPC，Client 读 Host 数据的官方通道 |
| Client 半 Builtin 白名单：`ctx / React / host / styles / console` | `Builtin.listBuiltins` | 无 `window`/`document`/`location`/`localStorage` |

### 2.2 `webServer.register` 的精确契约（查证自 `dsh-host-webserver`）

- **只支持 `exact` 与 `prefix` 两种路由，不支持 `:id` / 通配 / 正则参数化**；
- `prefix` 路由 `p` 命中 `p` 本身与 `p/<anything>`，**最长前缀优先**；匹配顺序：exact → 最长 prefix → fallback；
- handler 签名 `(req: IncomingMessage, res: ServerResponse)`，**拿不到「路由参数」**，但可自己在 handler 里解析 `req.url`：

```js
// 访问 /u/alice → req.url = '/u/alice'
const userId = new URL(req.url, 'http://x').pathname.split('/')[2]  // 'alice'
```

- `registerFallback`（SPA dist 服务，官方 `dsh-host-frontend-static` 持有）与 `tapIndex`（index HTML 改写器，`transform` 只有 `html` 参数、**无 req、无上下文**）。

### 2.3 「读 URL」不可行，但「注册路由 + 解析 req.url」可行（关键区分）

- **读 `window.location` / `location.pathname` / `location.hash` 不可行**：DSH Web 壳是纯单页应用，bundle 里无任何 URL 路由用法（无 `location.pathname`/`pushState`/`createHashHistory` 等），且 dynamic Client 的 Builtin 无 `window`/`location`；
- **但「注册路由」可行**：`webServer.register` 的 handler 在 **Host 侧、Node 环境**，能直接拿到 `req.url` 并解析出 userId——**这绕开了「Client 读 URL」的坑**，因为解析发生在 Host，不依赖浏览器暴露 URL。

**结论：用 `prefix` 路由 `/u/*` + Host 侧解析 `req.url`，能实现「URL → userId」的可靠传递。**

### 2.4 「把 userId 送进插件树」的生死点（查证自 `dsh-cordis-client-runner`）

dynamic Client 代码的实际执行方式是：

```js
const parameters = ["React","console","styles","host","harness",
  ...traps /* setTimeout/fetch/require/... */, "process","Buffer"];
closure = new Function(...parameters, `return (async () => { ${clientCode} })()`);
```

- `clientCode` 是**闭包函数体**，能直接用的标识符**只有参数白名单**；`window`/`document` 不在其中；
- `window` **既不在白名单、也没被显式 trap**——理论上 JS 作用域链可能摸到浏览器全局 `window`，但官方定性为 **「API discipline, not a security boundary」**（纪律约束，非安全边界），依赖「摸到 window」是**灰色地带、不可靠、随时可能被收紧**；
- **唯一受支持的 Client→Host 数据通道是 `host.call`**（Host 用 `harness.handle` 注册）。

**结论：不把 userId 内联进 HTML 让 Client 读 `window`，而是 Host handler 解析出 userId 后存进程内，Client 插件树用 `host.call('get-current-user')` 读取。全程走官方通道，稳定可靠。**

### 2.5 浏览器存储（cookie / localStorage）不可读

- Client 半无 `window`/`document`/`localStorage`，Host 半（Node）无浏览器存储——两头都断；
- 因此「用 localStorage/cookie 存用户身份」在纯 dynamic 插件形态下走不通；
- 本方案的用户身份**不依赖浏览器存储**：由 Host 路由 handler 解析 `req.url` 得到，存进程内（见 §5）。

### 2.6 「`/u/alice` 是否影响页面各项操作」—— 已确证：几乎为零

查证 `dsh-host-frontend-static` 与 `dsh-web-frontend/dist/index.html`，两个关键事实：

1. **SPA fallback 对任意 pathname 都回退 index.html**（`serveStatic` 实现：`readFile` 失败 → `catch` → `serveIndex()`；README 原文 *"any miss falls back to index.html with HTTP 200 (SPA routing)"*）。因此访问 `/u/alice` 时，`distRoot + '/u/alice'` 文件不存在 → 自动返回完整 index.html，**深链天然被支持**。
2. **index.html 的资源引用全是绝对路径**（`/manifest.webmanifest`、`/assets/index-*.js`、`/assets/vendor-*.css` 等）。因此 `/u/alice` 页面加载资源时请求的是 `/assets/...`，**不会**被拼成 `/u/alice/assets/...`，全部正常命中。

**影响面结论**：

| 页面操作 | 是否受 `/u/alice` 影响 | 说明 |
| --- | --- | --- |
| 会话/模型/工具/文件 RPC | ❌ 不受影响 | 走 `/api` RPC，绝对路径 |
| 静态资源（JS/CSS/manifest） | ❌ 不受影响 | index.html 全用 `/assets/...` 绝对路径 |
| 深链访问 `/u/alice` | ❌ 不受影响 | fallback miss → index.html（SPA routing） |
| WebSocket 连接 | ❌ 不受影响 | 固定地址，绝对 |
| `window.__DSH_BOOT__` 引导 | ❌ 不受影响 | 由 tapIndex/boot manifest 注入，与 pathname 无关 |

**关键实现约束（`webServer` 无中间件 `next()`）**：`webServer` 匹配顺序是 `exact → prefix → fallback`，`handle` 实现为「命中即 `await route.handler(req,res)` 并 return，不命中才走 fallback」。**prefix 路由命中后必须自己响应，无法「解析完放行给 fallback」**。因此采用「方案 X」：prefix handler 解析 userId 后，返回一份**与 fallback 等价的 index.html**（读 `distIndex` + `webServer.applyIndexTaps`），几行代码即可，不需要接管 `dsh-host-frontend-static`。

### 2.7 生死点查证结论（已确证，非推测）

以下三点**已全部查证**，直接决定「路由版」路线能否成立：

#### 2.7.1（生死点 A）多标签页并发下身份会串号 —— ❌ 已确证：致命缺陷

查证 `dsh-cordis-host-runner` 的 `invoke` 实现与 README：

- `harness.handle` / `host.call` 的 RPC 调用签名是 `invoke(pluginId, pluginRunId, method, args)`，**参数里没有任何「调用来源」标识**（无连接 id / 无标签页 / 无请求头 / 无会话）；
- README 决定性原文：*"`invoke` 与 `resolveRequestRun` 完全不携带会话：组件的一次调用和页面的一次作答都是页面全局的事实，不属于某一个会话。"*
- `handler(args)` 只收到你传的 JSON args，**无法知道「这次 host.call 来自 /u/alice 的标签页还是 /u/bob 的标签页」**。

**结论**：Host 侧若只存一个 `currentUserId` 全局变量，`/u/alice` 与 `/u/bob` 两个标签页会互相覆盖该值，`host.call('get-current-user')` 返回的是「最后一次被覆盖的值」→ **多标签页并发下必然串号**。

**影响**：§5 的「路由定身份 + host.call 读身份」链路，**仅在单标签页下成立**；一旦两个用户同时各开一个标签页，身份即串。这是「路由版」路线的**根本性缺陷**，无法在纯动态插件形态内绕过（因为 RPC 通道本身不携带调用来源）。

#### 2.7.2（生死点 B）动态 Host 半能否拿 `webServer` —— ✅ 已确证：能

`webServer` 是普通 Host 服务（`ctx.webServer`），动态 Host 半经 `ctx.get('webServer')`（或 `inject: ['webServer']`）即可拿到并调用 `register(route)`。地基成立。

#### 2.7.3（生死点 C）`distIndex` 路径 —— ✅ 已确证：路径确定，但沙箱 `require` 受限

查证 `dsh-web-app/lib/index.js`：

```js
function resolveDistIndex() {
  return require.resolve("@deepseek-ai/dsh-web-frontend/dist/index.html");
}
```

- `distIndex` = `@deepseek-ai/dsh-web-frontend/dist/index.html` 的 `require.resolve` 结果，路径**确定、部署无关**；
- **但**：动态 Host 半沙箱禁用了 `require`（`NODE_API_REDIRECTS` / 闭包 trap），因此「插件代码里 `require.resolve` 拿 distIndex」**在沙箱内不可行**；
- **可行替代**：方案 X 需读 index.html 时，改用 `ctx.get('fs')`（Host 文件服务）按已知的包导出路径读取，或让 Host 半用注入方式拿到该路径（`require` 只能在沙箱外由宿主侧解析后传入）。

#### 2.7.4（生死点 D）WebSocket 通道能否「根据路由认人」—— ❌ 已确证：走不通

查证 `dsh-client-connection` 源码与 README，DSH 传输架构的关键事实：

1. **上行 RPC（含 `host.call`）走 HTTP POST `/api/<method>`**，每次是独立无状态请求，`AbstractApiClient.callUnary` → `postJson('/api/<method>')`；
2. **下行事件流走 WebSocket**，但 `events.mux` / `events.host` 两条是**只下行**的：README 原文 *"the client sends no application data over these sockets"*（客户端不在这些 socket 上发送业务数据）；
3. **WebSocket 握手路径是写死的 `/api/events.mux` / `/api/events.host`**，与「用户身份路由 `/u/alice`」是两套无关路径。

**结论**：WebSocket 既**不承载上行 RPC**（上行全走 HTTP POST），又**是纯下行**（客户端不发数据），且**握手路径固定**（拿不到用户路由）。因此「在 WebSocket 握手时根据路由绑定身份」的思路**不成立**。

**综合（A+B+C+D）**：DSH 传输层从设计上**没有「请求/连接 → 用户身份」的映射 seam**——上行是无状态 HTTP POST、下行是只读 WebSocket、RPC 不携带调用者、Client 读不到 window/cookie。在「单进程 + 无网关 + 无多进程」约束下，**通过现有通道「认人」是死路**。

### 2.8 候选方向：cookie / Authorization 凭证方案 —— ❌ 已确证：不可行

> 思路：cookie 或 `Authorization` 头——本质是同一问题的两种载体（给请求附凭证，Host 读到才认人）。

**完整查证结论（证据链闭合）**：

| 环节 | 结果 |
| --- | --- |
| `client-connection` 的 `/api` bridge | ✅ header 完整进了 `Request`（`lib/index.js` line 65-70） |
| 官方 `toFetchHandler` | ❌ 只读 body（`req.json()`）与 `content-type`，**不读 cookie/authorization 头** |
| `connection.rpc.intercept` handler | ❌ 只收 `(endpoint, payload, signal)`——**header 已被剥掉**（`rpc.d.ts` line 11，注释明确 *"Handler invoked after Connection has decoded the transport envelope"*） |
| `harness.handle` handler | ❌ 只收 `args`（body） |

**结论**：cookie/authorization 头**确实到达了 Host 的 `Request` 对象**，但那个 `Request` 没有被任何「可被插件插手的 handler」暴露出来——`intercept` 是唯一扩展点，但它拿到的是**已经解码的业务层 `(endpoint, payload)`**，传输信封（header/cookie）在到达前就被剥掉了。因此**「Host 读 cookie/header 认人」在 RPC 链路上走不通**。

### 2.9 （已被 §2.10 推翻）dynamic 插件形态下，多用户身份识别不可行

> **⚠️ 本节结论已被 §2.10 推翻**：以下「做不到」仅在 **dynamic 插件** 前提下成立；采用正式插件后不成立（见 §2.10）。保留本节以记录推导过程。

穷尽所有通道后的综合结论（仅限 dynamic 插件）：

| 通道 | 结果 |
| --- | --- |
| URL 路由路径 | ❌ 身份贯穿不到 RPC（§2.7.1） |
| `host.call` RPC | ❌ `invoke` 不携带调用者（§2.7.1） |
| WebSocket | ❌ 上行 HTTP、下行只读、握手路径固定（§2.7.4） |
| cookie / Authorization 头 | ❌ 到达 `Request` 但被传输链路剥掉，无扩展点可读（§2.8） |
| localStorage / sessionStorage | ❌ Client 半读不到（§2.5） |
| settings 全局字段 | ❌ 不认人（全局一份） |

**根因（结构性死结）**：

1. **能带身份的地方**（URL / cookie / header）→ 全部在传输链路中被剥掉或读不到；
2. **唯一能被业务层读到的 `payload`**（body 里的 args）→ 由 Client 半提供，而 Client 半读不到 `window`/`location`/`cookie`，**它自己也不知道「我是谁」**；
3. **DSH 单进程模型没有「请求/连接 → 用户身份」的映射 seam**——它本质是一台单用户机器上的单用户 GUI。

**能破局的只有两条，都在本特性被否掉的约束里**：
1. **网关**（网络拓扑层读原始请求 → 认人 → 注入身份）；
2. **多进程 / 多端口**（每个端口 = 一个用户 = 天然边界）。

> **文档定位**：本特性在「单进程 + 无网关 + 无多进程 + 纯 dynamic 插件」约束下，**无法实现真正的多用户身份识别**。若要继续，必须放宽「无网关」或「无多进程」之一，否则需求不可满足（见 §8 待决策）。

### 2.10 关键转折：正式插件不受 dynamic 沙箱限制（已确证，方向重开）

> **结论反转**：§2.9「做不到」的结论，只在 **dynamic 插件** 前提下成立。用户已明确**要做正式插件**，而正式插件能读 URL / cookie，多用户身份识别**重新打开**。

**查证事实**：官方 client 插件（`dsh-client-ui-theme` / `dsh-client-ui-sidebar` 的 `lib/client.js`）**直接、自由地使用**了 `window` / `document`：

- `window.__ModuleLoader__`、`window.setTimeout`、`window.clearTimeout`；
- `document.createElement`、`document.head.appendChild`、`document.querySelector`、`document.addEventListener`、`document.body.toggleAttribute`、`document.documentElement.style`。

**两种插件形态的能力对比（核心差异）**：

| 能力 | dynamic 插件 | 正式插件 |
| --- | --- | --- |
| 读 `window.location`（URL） | ❌ 白名单外 | ✅ 可以 |
| 读 `document.cookie` | ❌ | ✅ 可以 |
| 读 `localStorage` / `sessionStorage` | ❌ | ✅ 可以 |
| 发 `fetch`（带自定义 header） | ❌ trap | ✅ 可以 |
| 直接碰 `window` / `document` | ❌ | ✅ 可以 |

**这意味着**：§2.3「读 URL 不可行」、§2.5「读 cookie 不可行」、§2.9「认不了人」——这些**针对 dynamic 插件的死结，对正式插件全部不成立**。正式 client 插件可以：

1. 在浏览器端直接 `window.location.pathname` 读当前路由 `/u/alice`，**无需走 `host.call` 回传身份**，也**不存在多标签页串号**（每个标签页自己读自己的 URL）；
2. 或直接读 `document.cookie` / `localStorage` 做身份凭证；
3. 或直接发带自定义 header 的 `fetch`。

**因此，正式插件形态下，「路由定身份」或「cookie/jwt 凭证」路线重新可行，且避开了 dynamic 插件的一切死结。**

#### 2.10.1 正式插件形态查证结论（已确证）

> **⚠️ 重要澄清：正式插件没有「Host 半 / Client 半」，而是「一个 npm 包的两个独立入口文件」**。
> 「半」是 dynamic 插件的术语（一个 Plugin 的 host/client 两段代码，Client 半受白名单限制）；正式插件是普通 npm 包，有两个入口：`lib/index.js`（Node 环境）和 `lib/client.js`（浏览器环境），**二者都是普通 JS，无白名单限制**——`lib/client.js` 能直接读 `document.cookie`。

查证官方插件 `dsh-client-ui-sidebar` / `dsh-client-ui-theme` / `dsh-host-webserver`，正式插件形态如下：

**① Client 入口（`package.json` 的 `dsh` 字段声明 client 入口）**：

```json
"dsh": {
  "client": {
    "inject": ["@deepseek-ai/dsh-client-runtime", "...其他依赖 client 插件"],
    "platform": "web",
    "immediately": true   // 可选：立即激活
  }
}
```

Client 入口是 `lib/client.js`，导出形式：

```js
window.__ModuleLoader__.load({
  id: "@deepseek-ai/dsh-client-ui-sidebar",
  factory: (require) => {
    // ...普通浏览器 JS，可直接 document/window...
    exports.apply = apply;    // apply(ctx) 注册 slot/service
    exports.inject = inject;  // 依赖的服务
    return module.exports;
  }
});
```

**② Host 入口**：`lib/index.js` 导出 `class Xxx extends Service`（Cordis Service 类插件），`package.json` 无 `dsh.client` 字段，只有 `main`。

**③ 构建**：`scripts.bundle = "tsdown"`、`scripts.watch = "tsdown --watch"`。

**关键结论（对多用户的意义）**：正式 client 插件的 `apply(ctx)` 里是**普通浏览器 JS**，可**直接读 `window.location.pathname`、`document.cookie`、`localStorage`、发 `fetch`**。因此：

- 身份识别**在浏览器端自查即可**（读 cookie 里的 JWT），**无需 `host.call` 回传、无多标签页串号、无 RPC 认人问题**——dynamic 插件的一切死结在正式插件下全部消失；
- 「JWT 存 cookie + 浏览器端自查」路线在正式插件下**真正可行**。

#### 2.10.2 工程落地查证结论（已确证，全部闭环）

查证 `dsh-web-app/cordis.patch.yml`、`package.json`、`dsh-app-boot/lib/index.js`（`initProfile`/`healProfilesModuleFallback`）与 README，五项工程落地细节全部明确：

**① 挂载进 Cordis 组合**：在组合（`cordis.patch.yml`）的 `insert` 列表里加一行：

```yaml
- id: multi-user              # 唯一 id
  name: '<你的包名>'           # npm 包名
  inject: [<依赖的 service>]   # 可选
  config: { ... }              # 可选
```

（官方插件即如此挂载，如 `- id: ui-sidebar  name: '@deepseek-ai/dsh-client-ui-sidebar'`。）

**② bundle 扫描机制**：`@deepseek-ai/dsh-client-modules`（`modules` row）的 node 入口会**扫描组合里所有带 `dsh.client` 字段的插件，编进 `window.__DSH_BOOT__`，并经 `/plugins/<id>/client.js` 提供 client 入口 bundle**（cordis.patch.yml line 45-46、151-152 注释）。因此插件只需在 `package.json` 声明 `dsh.client`（含 `inject` + `platform: web`）即可被扫进 roster。

**③ 构建/热更新**：每个正式插件用 `tsdown` 构建（`scripts.bundle`/`watch`）；`pnpm run dev:web` 重建 client bundle（`dsh-client-hmr` 接收）；非 dev 场景需重建 Web 产物后刷新页面验证。

**④ 安装机制（`dsh plugin` 命令）**：正式插件作为 npm 包，通过 `dsh plugin` 装进 profile：

| 命令 | 作用 |
| --- | --- |
| `dsh plugin --profile web add <package>` | 把插件包**加进 profile 依赖**（写进 `$DSH_HOME/profiles/web/package.json` 的 `dependencies`）；profile 不存在时自动创建 |
| `dsh plugin --profile web install` | **安装** profile 里声明但未装的依赖（跑 pnpm，profile 自带 `pnpm-workspace.yaml` + `nodeLinker: hoisted`） |

（证据：`dsh-app-boot/lib/index.js` line 523 *"run 'dsh plugin --profile … install'"*、line 543 *"create it with 'dsh plugin --profile … add <package>'"*。）

profile 结构（`initProfile`，line 353-369）：

```
$DSH_HOME/profiles/web/
├─ package.json          # { name, private, dependencies:{}, dsh:{ profile:{ bundles:[...] } } }
├─ cordis.patch.yml      # 用户 patch 层（在这里 insert 引用插件）
└─ pnpm-workspace.yaml   # 让 out-of-tree 插件能被 pnpm 管理
```

完整安装流程：`add <package>`（声明依赖）→ `install`（pnpm 装进 node_modules）→ 在 `cordis.patch.yml` 里 `insert` 一行引用包名 → 重启 dsh，Loader 解析加载。

> **注意**：`add` 的 `<package>` 需是 pnpm 能解析到的包名——已发布包名 / `file:`/`link:` 指向本地目录 / `npm link` 过的包。你的 `dsh-multi-user` 尚未发布，需用 `file:`/`link:` 或先 `npm link`。

**⑤ JWT 落地（关键设计结论）**：结合 §2.8（`host.call` RPC 链路读不到 header）与 §2.10（正式 client 插件能读 `document.cookie`），**JWT 最佳落地是「存 cookie + 浏览器端自查」**：

- JWT 存在 cookie（或 localStorage）里；
- 正式 client 插件直接 `document.cookie` 读出 JWT、解析出 userId；
- **无需走 `host.call`、无需 Host 认人、无需读 header**——浏览器端自查身份，彻底避开了 §2.8 的所有死结。

**结论：正式插件 + JWT 方案从「开发 → 打包 → 安装 → 挂载 → 加载」全链路闭环，无未知障碍。**

---

## 3. 「会话历史」与「工作区」的关系（澄清）

- **工作区（Workspace）**：一个本地目录（cwd），有 `path` 与 `title`；
- **会话（Session）**：一段对话日志，挂在工作区 cwd 下，按 cwd 归类到工作区；
- 侧边栏「工作区列表」每项 = 一个工作区，展开 = 该工作区名下会话。

「按用户隔离工作区记录」在 UI 上**自然连带隔离会话展示**（会话按工作区分组）。但存储层是两张表（`workspaceRegistry` + `sessionPersistence`），本特性只做**展示层过滤**，不迁移、不复制、不改写原生表。

---

## 4. 决策点（已全部拍板）

### D1：用户身份识别方式 ✅ 已定：JWT 存 cookie，分档阶段浏览器端自查（不走 URL 路由）

- **否决 URL 路由方式**（`/u/alice`）：dynamic 插件下「路由身份贯穿不到 RPC」是死结（§2.7.1），且用户明确要求**不走路由方式**；
- **两阶段澄清（关键，避免歧义）**：
  - **认证阶段（登录）**：调 Host 入口（`lib/index.js`）后端——用户提交账号密码 → Host 入口 `webServer` 路由校验 → 签发 JWT → 写 cookie（见 D6）；
  - **分档阶段（工作区过滤）**：**不调后端**——正式 client 插件直接 `document.cookie` 读 JWT、解析 userId，本地过滤工作区；
- **最终方案**：
  - JWT 存在 cookie 里，载荷含 userId；
  - 认证阶段由 Host 入口（`lib/index.js`）签发 JWT 写 cookie（D6）；
  - 分档阶段由 client 插件读 cookie 自查，**不经过 `host.call`、不经过 Authorization 头、不需要再次 Host 验签**；
  - 实现前提：正式插件形态（§2.10）——正式 client 插件能读 `document.cookie`。

> **定性澄清（2026-08-18 最终）**：早期「本插件不调后端」的表述**只适用于「分档阶段」**，不适用于「认证阶段」——登录必然调 Host 入口后端（否则账号密码无处置、JWT 无人签发）。准确说法是：**「认证调后端（登录墙 + JWT 签发），分档不调后端（client 入口读 cookie 自查）」**。「Authorization 头」在本方案中不适用（无「发请求带凭证给后端验签」的传输层场景），已彻底移除。

### D2：「隐藏原生工作区」✅ 替换 `sidebar.workspaces` + 复刻原生交互

接管后自渲染并复刻：section header、搜索、工作区分组/平铺、工作区对话框（新建/重命名/删除）、会话列表（打开/归档/增删）。处理 owner props：`wide`、`expandSidebar`。

### D3：工作区数据源 ✅ 不写原生表，另建「用户 ID → 工作区目录列表」映射

原生 `workspaceRegistry`（查证自 `dsh-workspace`）用 `ctx.storage.domain`（domain `workspace` v2，`workspaces` 表 + global 单例），底层 `dsh-storage-json`。

本特性**不写原生表**，在插件自有持久化（Host 侧，见 §5.4）维护「用户 ID → 目录列表」映射；侧边栏用 `useWorkspaces` 读原生工作区，但**只渲染当前用户登记的目录**。原生零改动 → 移除即还原。

### D4：用户身份语义 ✅ 由 JWT（cookie）决定，识别后过滤即时生效

- 用户身份 = cookie 里 JWT 载荷的 userId（浏览器端自查）；
- 侧边栏按该 userId 过滤，无需刷新页面。

### D5：会话历史是否也按用户分档 ✅ 已定：是，随工作区分档自然连带

- 会话历史挂在工作区 cwd 下、按工作区分组（§3）；**工作区已按用户分档，会话历史随之只显示当前用户工作区名下的会话**，不单独另建会话级过滤；
- 实现要点（§5.3）：侧边栏接管后，用 `useSessions` 读会话，但**只渲染当前用户已登记工作区下的会话**，与工作区过滤同源，不产生「alice 工作区下看到 bob 会话」的串号。

### D6：登录墙 + 用户管理 + JWT 签发 ✅ 已定（正式插件自带认证闭环）

> 挂载插件后，访问 `http://127.0.0.1:3080/` 不再直接进 DSH，先经过插件的登录墙。JWT 由插件自己签发，不再是「外部签发」。

**决策点（四项已定）：**

1. **账号体系**：插件自己维护一份用户库（复用现有 `store.ts` 的 `users.json`，scrypt 加盐口令）；
2. **用户角色与来源**：每个用户都能登录；主管理员经 **setup（初始化页）** 设置，其他用户由主管理员在**设置 →「用户管理」**里添加（设置页左侧菜单新增「用户管理」入口）；
3. **JWT 签发**：插件自己实现 JWT 签发（登录成功后签发，写入 cookie）；
4. **页面渲染**：插件自己渲染 HTML 页面（登录页 / 初始化页），不走原生页面。

**生命周期状态机**（复用现有 `lifecycle.ts`）：

```
fresh（无主管理员） → 访问 / 显示「初始化页」（引导设置主管理员）
  → 设置主管理员后 → admin-set
  → 访问 / 显示「登录页」
  → 登录成功 → 插件签发 JWT → 写入 cookie → 跳转回 http://127.0.0.1:3080/
  → 此时带 JWT cookie，正常进 DSH，Client 按 userId 过滤工作区
```

**实现形态（正式插件，非网关）**：

- **Host 入口（`lib/index.js`）**：注册 `webServer` 路由，拦截 `/`（未登录态）渲染登录/初始化页；提供登录/用户管理 API；登录成功签 JWT 写 cookie；
- **Client 入口（`lib/client.js`）**：设置页新增「用户管理」section（复用 `settings.section`）；侧边栏按 cookie 里的 JWT 过滤工作区。

> **复用现有代码**：`dsh-multi-user` 的 `src/auth/*`、`src/lifecycle.ts`、`src/store/*` 是**形态无关的纯逻辑层**，可直接复用到正式插件的 Host 入口；改动点主要在「网关进程 → 正式插件 Host 入口」的接线（`webServer.register` 路由、JWT 签发替换原会话令牌、页面渲染）。

---

## 5. 最终方案（JWT 版 · 正式插件形态）

> 形态：**单进程、正式插件（独立 npm 包，打进 shell bundle）**，不搞网关、不多进程。
> 身份：**JWT 存 cookie**（认证调后端、分档浏览器端自查），不走 URL 路由。
> 认证：**插件自带登录墙 + 用户管理 + 自签 JWT**（见 D6）。

### 5.1 核心链路

```
访问 http://127.0.0.1:3080/
  → Host 入口登录墙拦截（webServer 路由，读 cookie 判断登录态）
  → 未登录：
      · fresh（无主管理员）→ 渲染「初始化页」（引导 setup 主管理员）
      · admin-set → 渲染「登录页」（账号密码登录）
  → 登录成功 → 插件签发 JWT → Set-Cookie 写入 → 跳转回 http://127.0.0.1:3080/
  → 此时带 JWT cookie，Host 入口放行进入 DSH
  → Client 入口读 document.cookie 得到 JWT → 解析 userId → 过滤工作区，接管 sidebar.workspaces
```

> 身份链路（§2.10.2 ⑤）：JWT 存 cookie；**认证阶段**调 Host 入口后端（登录墙 + 签发 JWT 写 cookie），**分档阶段** client 入口 `document.cookie` 自查，不经过 host.call、不需要再次 Host 认人。

### 5.2 Host 入口（`lib/index.js`，Node 环境）

- `lib/index.js` 导出 `class Xxx extends Service`（Cordis Service 类插件）；
- **登录墙**：注册 `webServer` 路由，拦截 `/`（未登录态）→ 渲染初始化页/登录页（自己渲染 HTML）；登录成功后签发 JWT、写 cookie、302 跳回 `/`；
- **用户管理**：提供「主管理员 setup / 添加用户 / 授权工作区」API；复用现有 `store.ts`（`users.json` + scrypt 口令）+ `lifecycle.ts`（fresh/admin-set 状态机）+ `authService.ts`（账号密码校验）；
- **JWT 签发**：插件自签 JWT（替换原网关的「会话令牌」机制）；
- **用户映射持久化**：维护「用户 ID → 工作区目录列表」映射（见 §5.4）。

### 5.3 Client 入口（`lib/client.js`，浏览器环境，打进 bundle）

- `lib/client.js` 以 `window.__ModuleLoader__.load({...})` 形式注册（普通浏览器 JS，能读 `document.cookie`/发 `fetch`）；
- **读取身份**：`document.cookie` 读出 JWT，解析出 userId；
- **接管 `sidebar.workspaces`**：替换原生浏览区，复刻交互（header/搜索/分组/对话框/会话列表）；
- 用 `useWorkspaces` / `useSessions` 只渲染当前用户名下登记的目录；
- **会话随工作区同源过滤（D5）**：只显示落在当前用户已登记工作区 cwd 下的会话；
- **设置页「用户管理」**：注册 `settings.section` 新增「用户管理」入口，主管理员在此添加/管理用户（D6）；
- 处理 owner props `wide` / `expandSidebar`。

### 5.4 用户映射存储（D3 落地）

- 「用户 ID → 工作区目录列表」映射可存：Host settings 命名空间（结构化多用户对象）或插件自有 JSON 文件；
- 不写原生 `workspaceRegistry`，插件移除即还原。

### 5.5 还原

- 插件卸载后，`sidebar.workspaces` 回到原生占位者，全量恢复。

### 已否决方案

- **URL 路由方式**（`/u/alice` + prefix 路由 + host.call 回传身份）：dynamic 插件下「身份贯穿不到 RPC」是死结，且用户明确不走路由（见 §4 D1）；
- **设置页 currentUserId 字段**（不灵活，用户明确不采用）；
- **每用户 `exact` 路由**（需预注册，不灵活）；
- **`tapIndex` 注入身份**（transform 无 req、无上下文）；
- **dynamic 插件形态**（沙箱白名单读不到 URL/cookie/header，见 §2.9）。

---

## 6. 明确不做（范围外）

- 不搞网关 / 反向代理；
- 不搞多进程 / 每用户数据根；
- 不做完整的账号/认证开放体系（邮箱/短信/微信扫码等外部通道暂不接入；只做**账号密码登录 + 插件自签 JWT**）；
- 不隔离插件、agent 预设、模型凭据；
- 不迁移、不复制、不改写原生 `workspaceRegistry` 与 `sessionPersistence` 数据；
- 不做真正的安全隔离（见 §7）。

---

## 7. 安全边界（诚实声明）

本特性是**视图层过滤 + JWT 身份分档**，不是强安全隔离：

- 同一进程内，所有用户共享同一份 `workspaceRegistry` / `sessionPersistence`，userId 只是**展示过滤器**；
- **有账号体系**（D6：用户库 + scrypt 口令 + 插件自签 JWT + 登录墙），但**工作区授权无强制权限校验**——「谁能访问哪个工作区」由「用户 ID → 目录列表」映射决定，仅用于**展示过滤**，没有服务端权限强制（任何能绕过前端的人仍能看到全部）；
- JWT 用于「认证（登录）+ 识别（分档）」，但分档仅是前端展示，不构成安全边界；
- 任何能直接操作宿主机文件系统的人，都能看到全部工作区与会话；
- 因此本特性定位为「同一机器上的**多用户视图分档 + 轻量登录**」，而非「多租户权限隔离」。

---

## 8. 待办

**已定（决策/查证完成）：**

- [x] **D1**：用户身份识别 → JWT 存 cookie（认证调后端、分档浏览器端自查），不走 URL 路由（§4 D1）；
- [x] **D2**：侧边栏接管 → 替换 `sidebar.workspaces` + 复刻原生交互；
- [x] **D3**：工作区数据源 → 不写原生表，另建「用户 ID → 目录列表」映射（§4 D3 / §5.4）；
- [x] **D4**：身份由 JWT 决定，识别后过滤即时生效；
- [x] **D5**：会话历史随工作区分档自然连带（§4 D5）；
- [x] **D6**：登录墙 + 用户管理 + 插件自签 JWT（setup 初始化页 / 登录页 / 用户管理，§4 D6）；
- [x] **插件形态**：采用正式插件（非 dynamic），Client 入口（`lib/client.js`）能读 window/cookie/fetch（§2.10）；
- [x] **影响面**：正式插件下不存在 dynamic 插件的「读不到/认不了人」死结（§2.10）。

**已确证（生死点查证完成）：**

- [x] **生死点 B**：动态 Host 半能 `ctx.get('webServer')` 并注册路由（§2.7.2）；
- [x] **生死点 C**：`distIndex` 路径确定（`@deepseek-ai/dsh-web-frontend/dist/index.html`），但沙箱 `require` 受限（§2.7.3）；
- [x] **生死点 A**：❌ 多标签页并发下身份会串号（`invoke` 不携带调用者，RPC 是页面全局事实）——**致命缺陷，见 §2.7.1**；
- [x] **生死点 D**：❌ WebSocket 通道走不通（上行 HTTP、下行只读、握手路径固定）——见 §2.7.4；
- [x] **综合结论**：DSH 传输层无「请求/连接 → 用户身份」映射 seam，单进程无网关无多进程下「认人」是死路（§2.7.4）。

**待查证（当前讨论方向，未定论）：**

- （无——所有方向已定、所有查证已闭环。）

**方向已定（2026-08-18 转折）：**

- [x] **采用正式插件形态**（非 dynamic 插件）：正式 client 插件可读 `window.location`/`document.cookie`，多用户身份识别重新打开（§2.10）；
- [x] §2.1~§2.9 的「读不到 URL/cookie、认不了人」结论，**仅适用于 dynamic 插件**，对正式插件不成立（文档头部前提声明 + §2.10）；
- [x] **D1 身份方式：JWT 存 cookie（认证调后端、分档浏览器端自查），不走 URL 路由**（§4 D1）。

**已确证（工程落地查证完成，§2.10.2）：**

- [x] 挂载进组合：`cordis.patch.yml` 的 `insert` 列表加一行（`id` + `name`）；
- [x] bundle 扫描：`dsh.client` 字段 + `client-modules` node 入口扫进 `window.__DSH_BOOT__` + `/plugins/<id>/client.js`；
- [x] 构建/热更新：`tsdown` bundle + `pnpm run dev:web` 重建 shell；
- [x] 安装：`dsh plugin --profile web add <package>` + `install`，装进 profile 的 `node_modules`；
- [x] JWT 落地：存 cookie + 正式 client 插件浏览器端自查（绕开 `host.call` header 死结）。

**实现（方向与工程落地全部闭环，待开始实现）：**

- [ ] 把 `dsh-multi-user` 改造为正式插件（`lib/client.js` + `lib/index.js` + `package.json` 的 `dsh.client` 字段）；
- [ ] Host 入口：登录墙（`webServer` 路由渲染初始化/登录页）+ 用户管理 + JWT 签发（复用现有 `authService`/`lifecycle`/`store`）+ 用户映射持久化；
- [ ] Client 入口：读 cookie JWT 自查身份 + 接管 `sidebar.workspaces` 过滤 + 设置页「用户管理」section；
- [ ] 通过 `dsh plugin --profile web add/install` 安装，`cordis.patch.yml` insert 挂载。

---

*文档日期：2026-08-18 · 依据：运行时 `cordis_inspect_list`/`cordis_inspect_query` + 源码查证（`dsh-workspace` 存储 spec、`dsh-web-frontend` 壳 bundle 路由、`dsh-host-webserver` 路由契约、`dsh-host-frontend-static` SPA fallback、`dsh-cordis-client-runner` 闭包求值、`dsh-cordis-host-runner` invoke 机制、`dsh-client-connection` 传输架构、`dsh-client-ui-theme`/`dsh-client-ui-sidebar` 正式插件形态、`dsh-web-app/cordis.patch.yml` 组合挂载）+ 现有 `dsh-multi-user` 项目背景。本文档不含代码。*
