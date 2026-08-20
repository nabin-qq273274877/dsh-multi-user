# dsh-multi-user

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

中文 | [English](README.en.md)

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI 提供**单进程多用户工作区分档**：JWT 登录墙 + 按用户过滤工作区/会话 + 用户管理。

## 功能

- **JWT 登录墙**：挂载后访问 `/` 先过登录墙；未设主管理员显示「初始化页」，已设则显示「登录页」；登录成功插件自签 JWT 写 cookie（HttpOnly），跳转回 `/`；
- **每用户工作区路径清单**：每个用户（含主管理员）维护一份「已加入的工作区路径」清单。用户通过目录选择器加入任意路径（如 `D:\Project\foo`），只有加入过的路径（及其下会话）对本人可见，其他用户看不到；未加入的路径不显示。
- **用户管理**：主管理员经 setup 初始化，其他用户在设置页「用户管理」里添加；支持改密码、停用/启用、删除。

> **安全边界**：这是**视图分档 + 轻量登录**，不是强隔离。同一进程内所有用户共享同一份 `workspaceRegistry` / `sessionPersistence`，userId 只是展示过滤器；任何能直接操作宿主机文件系统的人都能看到全部数据。

## 架构

```
浏览器 ──► dsh web (127.0.0.1:3080)
             │
             ├─ Host 入口 src/host/index.ts：登录墙（webServer 路由）+ 用户管理 API + JWT 签发 + 工作区路径清单
             ├─ Client 入口 src/client/index.ts：经 /api/mu/me/grants 拿身份 + 按用户路径清单过滤工作区
             └─ 数据：$DSH_HOME/plugins-data/dsh-multi-user/（用户库 + 每用户路径清单）
```

身份链路：**认证调后端**（登录墙 + JWT 签发 + HttpOnly cookie），**分档不重复验签**（client 经 `/api/mu/me/grants` 一次性拿到 userId/role，经 `/api/mu/me/workspaces` 拿到本人已加入的路径清单，浏览器自动携带 HttpOnly cookie，Host 侧验签；client 按该清单过滤工作区）。

> **设计说明**：JWT 存 **HttpOnly cookie**（JS 读不到 `document.cookie`，避免 XSS 窃取令牌）。因此 client 端**不读 cookie**，而是通过 `fetch('/api/mu/me/grants')` 拿到身份，再经 `/api/mu/me/workspaces` 拿到本人路径清单。

> **安全边界**：每个用户的工作区路径清单是「视图分档 + 清单约定」，**不是强隔离**。agent 的工具（bash/文件读写）仍可操作宿主机任意路径；卸载插件后 `sidebar.workspaces` 回到官方全量视图。真正的物理隔离需多进程/每用户独立数据根。

## 为什么用插件形态（对比网关方案）

实现「多人共用一台 dsh」有两条路线：**外部网关**（在 dsh 之外另起一个反向代理进程做登录与分流）与**本插件的无侵入插件形态**。二者差异如下：

| 维度 | 网关方案（如 `dsh-server-deployment` 系） | 本插件（无侵入插件） |
|---|---|---|
| 部署形态 | 在 dsh 之外部署一层独立网关进程，dsh 仍跑在它后面 | 作为普通插件装进 dsh 组合，与官方插件同级，无额外进程 |
| 安装/还原 | 需额外维护网关的配置、证书、端口映射，卸载要拆一层 | `dsh plugin add/remove` 一条命令；卸载即还原官方全量视图 |
| 对 dsh 的侵入 | 网络拓扑层拦截，dsh 本身不感知多用户 | 只经插件扩展点（登录墙路由 + `sidebar.workspaces` 过滤），不 patch 内核 |
| 身份识别 | 网关读原始 HTTP 请求认人，注入身份 | Host 插件自签 JWT 写 HttpOnly cookie，client 经 `/api/mu/*` 自查 |
| 升级跟随 | 网关需自行跟随 dsh 版本与接口变化 | 随插件升级，dsh 升级即可用（peerDependencies 声明） |
| 适用场景 | 需要真·网络层隔离、多机访问、强鉴权的部署 | 单机/单进程的轻量多用户分档，开箱即用 |

**为什么本插件不采用网关那套重方案**：

1. **dsh 的核心主张是「一切皆插件」**——登录墙可以是一个 UI 层插件，工作区列表可以经 `sidebar.workspaces` 扩展点过滤，无需在 dsh 外面再套一层网络代理。网关把「多用户」放在网络拓扑层，插件把它放回 dsh 自己的扩展点，形态与官方组件一致。
2. **安装/还原零成本**：网关要额外维护一套反向代理（配置、证书、端口、进程守护），卸载时得拆掉整层；插件一条 `dsh plugin add/remove` 即可，移除后 `sidebar.workspaces` 回到官方占位者、行为与安装前逐位一致。
3. **不需要网络层隔离的部署**：本插件定位是「同一台机器上的多人**视图分档 + 轻量登录**」，不是多租户强隔离（见上方安全边界）。当真正需要网络层隔离、多机访问、强鉴权时，才应选择网关/多进程方案——那超出了本插件的范围。

> 简言之：**网关解决「谁能连上这台 dsh」，本插件解决「连上之后各自看到什么」**。对单机多用户分档这种轻场景，插件形态更轻、更可逆、更贴合 dsh 生态。

## 安装

```bash
# 通过 npm
npx @deepseek-ai/dsh plugin --profile web add dsh-multi-user

# 从 GitHub
npx @deepseek-ai/dsh plugin --profile web add github:nabin-qq273274877/dsh-multi-user

# 本地开发（link）
npx @deepseek-ai/dsh plugin --profile web add link:/path/to/dsh-multi-user
```

然后重启 `dsh web` 并刷新页面。

本包通过 `package.json` 的 `dsh.bundle.patch` 自动挂载 Host 行，Client 半由 `dsh.client` 字段被 `@deepseek-ai/dsh-client-modules` 扫进 `window.__DSH_BOOT__`，无需手动改 `cordis.patch.yml`。

或者直接复制以下提示词给 AI：

```
请帮我安装 dsh-multi-user 插件，仓库地址：https://github.com/nabin-qq273274877/dsh-multi-user
按照 README 中的说明进行安装和配置。
```

然后重启 `dsh web` 并刷新页面。

## 界面

<p align="center"><img src="docs/登录界面.png" alt="登录界面" width="640"></p>

<p align="center"><img src="docs/用户列表.png" alt="用户列表" width="640"></p>

## 卸载

```bash
npx @deepseek-ai/dsh plugin --profile web remove dsh-multi-user
```

插件卸载后 `sidebar.workspaces` 回到官方占位者，全量恢复；插件数据（`$DSH_HOME/plugins-data/dsh-multi-user/`）保留。

## 首次使用

1. 访问 `http://127.0.0.1:3080/` → 显示「初始化」页，设置主管理员（自动登录进入 DSH）；
2. 主管理员在设置页「用户管理」里添加子用户；
3. 每个用户在侧边栏点「新建工作区」选择目录（Windows/macOS 弹原生目录对话框，容器/Linux 无桌面弹应用内目录浏览器），选定目录即「加入」该用户的工作区列表，仅本人可见。

## HTTP API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/mu/auth/password` | 账号密码登录（成功写 JWT cookie） |
| POST | `/api/mu/auth/logout` | 登出（清 cookie） |
| GET | `/api/mu/auth/me` | 当前身份 |
| GET | `/api/mu/public/config` | 公开配置（生命周期状态） |
| POST | `/api/mu/admin/owner` | 初始化主管理员（fresh 态，成功后自动登录） |
| GET | `/api/mu/me/grants` | 当前用户身份（userId/role） |
| GET | `/api/mu/me/workspaces` | 当前用户已加入的工作区路径清单 |
| POST | `/api/mu/me/workspaces` | 加入一条路径到当前用户清单（body: `{path}`） |
| POST | `/api/mu/me/workspaces/delete` | 从当前用户清单移除一条路径（body: `{path}`） |
| POST | `/api/mu/me/password` | 修改自己的密码 |
| GET/POST | `/api/mu/admin/users` | 用户列表 / 新建子用户 |
| POST | `/api/mu/admin/users/update` | 更新用户（状态/显示名） |
| POST | `/api/mu/admin/users/reset-password` | 重置子用户密码 |
| POST | `/api/mu/admin/users/delete` | 删除用户（账号停用，路径清单保留） |

## 数据存储

```
$DSH_HOME/plugins-data/dsh-multi-user/
├─ .jwt-secret            # JWT HMAC 密钥（0600，自动生成）
├─ settings.json          # 插件设置（ownerUserId / auth）
├─ users.json             # 用户库（scrypt 加盐口令哈希）
└─ tenants/<uid>/grants.json  # 用户 → workspaceRoot + workspacePaths（已加入的路径清单）
```

`workspacePaths` 是每用户「已加入工作区路径」清单，作为侧边栏视图分档依据；工作区记录本身写入原生 `workspaceRegistry`（`ctx.workspaces.create`），插件卸载后还原为全量视图。

## 开发

```bash
git clone https://github.com/nabin-qq273274877/dsh-multi-user.git
cd dsh-multi-user
pnpm install
pnpm run build      # esbuild 打包到 lib/

# 链接到 DSH profile 进行实时测试
npx @deepseek-ai/dsh plugin --profile web add link:$(pwd)
```

## 项目结构

```
src/
├─ types.ts              # 共享类型定义
├─ jwt.ts                # JWT 签发/验签（HMAC-SHA256，零依赖）
├─ store.ts              # 数据存储门面（scrypt 口令 + JSON 原子写）
├─ lifecycle.ts          # fresh / admin-set 状态机
├─ host/
│  └─ index.ts           # 宿主插件：登录墙路由 + 用户管理 API + 工作区路径清单 API
└─ client/
   └─ index.ts           # 客户端插件：身份获取 + 路径清单过滤 + 目录选择器（原生/browse 双后端）
scripts/
└─ build.ts              # esbuild：宿主 ESM + 客户端工厂打包
```

## 许可证

[MIT](LICENSE)
