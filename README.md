# dsh-multi-user

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

中文 | [English](README.en.md)

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI 提供**单进程多用户工作区分档**：JWT 登录墙 + 按用户过滤工作区/会话 + 用户管理。

## 功能

- **JWT 登录墙**：挂载后访问 `/` 先过登录墙；未设主管理员显示「初始化页」，已设则显示「登录页」；登录成功插件自签 JWT 写 cookie（HttpOnly），跳转回 `/`；
- **每用户专属工作区目录**：每个用户（含主管理员）一个专属目录，按 userId 自动生成（`$DSH_HOME/workspaces/<userId>/`，互不重复）。用户只能看到自己专属目录内的子目录（作为工作区）与会话；
- **用户管理**：主管理员经 setup 初始化，其他用户在设置页「用户管理」里添加；支持改密码、停用/启用、删除。

> **安全边界**：这是**视图分档 + 轻量登录**，不是强隔离。同一进程内所有用户共享同一份 `workspaceRegistry` / `sessionPersistence`，userId 只是展示过滤器；任何能直接操作宿主机文件系统的人都能看到全部数据。

## 架构

```
浏览器 ──► dsh web (127.0.0.1:3080)
             │
             ├─ Host 入口 src/host/index.ts：登录墙（webServer 路由）+ 用户管理 API + JWT 签发 + 专属目录
             ├─ Client 入口 src/client/index.ts：经 /api/mu/me/grants 拿身份 + 扫描专属目录渲染工作区
             └─ 数据：$DSH_HOME/plugins-data/dsh-multi-user/ + $DSH_HOME/workspaces/<userId>/
```

身份链路：**认证调后端**（登录墙 + JWT 签发 + HttpOnly cookie），**分档不重复验签**（client 经 `/api/mu/me/grants` 一次性拿到 userId/role/专属目录，浏览器自动携带 HttpOnly cookie，Host 侧验签；client 扫描专属目录子目录作为工作区）。

> **设计说明**：JWT 存 **HttpOnly cookie**（JS 读不到 `document.cookie`，避免 XSS 窃取令牌）。因此 client 端**不读 cookie**，而是通过 `fetch('/api/mu/me/grants')` 拿到身份与专属目录。

> **安全边界**：每个用户的专属目录是「视图分档 + 目录约定」，**不是强隔离**。agent 的工具（bash/文件读写）仍可越过专属目录操作宿主机任意路径；卸载插件后 `sidebar.workspaces` 回到官方全量视图。真正的物理隔离需多进程/每用户独立数据根。

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

### 让 AI 帮你安装

不想手动敲命令？把下面这段整段复制给你的 AI 助手即可：

````markdown
请帮我把 `dsh-multi-user` 插件安装到本机的 DeepSeek Harness Web profile（profile 名 `web`），并完成验证。请严格按以下顺序执行：

1. 先定位本地 dsh-multi-user 仓库路径（若我尚未 clone，请执行：
   `git clone https://github.com/nabin-qq273274877/dsh-multi-user.git`）。
2. 进入该目录，执行 `pnpm install`，再执行 `pnpm run build`，确保 `lib/index.js` 与 `lib/client.js` 已生成。
3. 用 `dsh plugin` 命令把本地路径链接进 profile（本地开发方式）：
   `npx @deepseek-ai/dsh plugin --profile web add link:/path/to/dsh-multi-user`
   （若希望从 npm 或 GitHub 安装，改用 `add dsh-multi-user` 或 `add github:nabin-qq273274877/dsh-multi-user`。）
4. 确认 profile 的 `cordis.patch.yml` 里已包含 `dsh-multi-user` 的 insert 行（本包通过 `dsh.bundle.patch` 自动挂载，通常无需手动编辑，但请检查确认）。
5. 重启 `dsh web`，然后访问 `http://127.0.0.1:3080/` 验证：应出现「初始化」页或「登录」页，而非直接进入 DSH。

注意事项：
- 不要执行 `git push`，只做本地安装。
- 遇到权限/沙箱限制时，先停下来向我说明需要哪一步，不要擅自扩大访问范围。
- 完成后请报告：安装方式、profile 是否成功加载插件、以及首次访问 `/` 看到的是初始化页还是登录页。
````

## 卸载

```bash
npx @deepseek-ai/dsh plugin --profile web remove dsh-multi-user
```

插件卸载后 `sidebar.workspaces` 回到官方占位者，全量恢复；插件数据（`$DSH_HOME/plugins-data/dsh-multi-user/`）保留。

## 首次使用

1. 访问 `http://127.0.0.1:3080/` → 显示「初始化」页，设置主管理员（自动登录进入 DSH）；
2. 主管理员在设置页「用户管理」里添加子用户（每个用户自动分配专属目录）；
3. 每个用户在侧边栏「新建工作区」在自己的专属目录内建子目录作为工作区。

## HTTP API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/mu/auth/password` | 账号密码登录（成功写 JWT cookie） |
| POST | `/api/mu/auth/logout` | 登出（清 cookie） |
| GET | `/api/mu/auth/me` | 当前身份 |
| GET | `/api/mu/public/config` | 公开配置（生命周期状态） |
| POST | `/api/mu/admin/owner` | 初始化主管理员（fresh 态，成功后自动登录） |
| GET | `/api/mu/me/grants` | 当前用户身份 + 专属目录 |
| GET | `/api/mu/me/workspaces` | 列出专属目录下子目录（工作区） |
| POST | `/api/mu/me/workspaces` | 在专属目录下新建工作区 |
| POST | `/api/mu/me/workspaces/delete` | 删除工作区 |
| POST | `/api/mu/me/password` | 修改自己的密码 |
| GET/POST | `/api/mu/admin/users` | 用户列表 / 新建子用户 |
| POST | `/api/mu/admin/users/update` | 更新用户（状态/显示名） |
| POST | `/api/mu/admin/users/reset-password` | 重置子用户密码 |
| POST | `/api/mu/admin/users/delete` | 删除用户（账号停用，专属目录保留） |

## 数据存储

```
$DSH_HOME/plugins-data/dsh-multi-user/
├─ .jwt-secret            # JWT HMAC 密钥（0600，自动生成）
├─ settings.json          # 插件设置（ownerUserId / auth）
├─ users.json             # 用户库（scrypt 加盐口令哈希）
└─ tenants/<uid>/grants.json  # 用户 → 专属工作区目录（单一目录）

$DSH_HOME/workspaces/<userId>/   # 每个用户的专属工作区目录（子目录即工作区）
```

不写原生 `workspaceRegistry` / `sessionPersistence`，插件卸载即还原。

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
│  └─ index.ts           # 宿主插件：登录墙路由 + 用户管理 API
└─ client/
   └─ index.ts           # 客户端插件：身份获取 + sidebar.workspaces 过滤
scripts/
└─ build.ts              # esbuild：宿主 ESM + 客户端工厂打包
```

## 许可证

[MIT](LICENSE)
