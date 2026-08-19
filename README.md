# dsh-multi-user

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

中文 | [English](README.en.md)

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI 提供**单进程多用户工作区分档**：JWT 登录墙 + 按用户过滤工作区/会话 + 用户管理。

## 功能

- **JWT 登录墙**：挂载后访问 `/` 先过登录墙；未设主管理员显示「初始化页」，已设则显示「登录页」；登录成功插件自签 JWT 写 cookie（HttpOnly），跳转回 `/`；
- **按用户分档工作区**：每个用户只看到自己被授权的工作区目录列表，会话随工作区同源过滤；
- **用户管理**：主管理员经 setup 初始化，其他用户在管理 API 里添加并授权工作区目录。

> **安全边界**：这是**视图分档 + 轻量登录**，不是强隔离。同一进程内所有用户共享同一份 `workspaceRegistry` / `sessionPersistence`，userId 只是展示过滤器；任何能直接操作宿主机文件系统的人都能看到全部数据。

## 架构

```
浏览器 ──► dsh web (127.0.0.1:3080)
             │
             ├─ Host 入口 src/host/index.ts：登录墙（webServer 路由）+ 用户管理 API + JWT 签发
             ├─ Client 入口 src/client/index.ts：经 /api/mu/me/grants 拿身份 + 接管 sidebar.workspaces 过滤
             └─ 数据：$DSH_HOME/plugins-data/dsh-multi-user/（settings/users/tenants）
```

身份链路：**认证调后端**（登录墙 + JWT 签发 + HttpOnly cookie），**分档不重复验签**（client 经 `/api/mu/me/grants` 一次性拿到 userId/role/授权目录列表，浏览器自动携带 HttpOnly cookie，Host 侧验签；client 本地按目录过滤）。

> **设计说明**：JWT 存 **HttpOnly cookie**（JS 读不到 `document.cookie`，避免 XSS 窃取令牌）。因此 client 端**不读 cookie**，而是通过 `fetch('/api/mu/me/grants')` 拿到身份与授权目录——这是唯一一次「拿身份」的调用，与读工作区数据（`useWorkspaces`）同性质，不构成重复验签。

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

## 卸载

```bash
npx @deepseek-ai/dsh plugin --profile web remove dsh-multi-user
```

插件卸载后 `sidebar.workspaces` 回到官方占位者，全量恢复；插件数据（`$DSH_HOME/plugins-data/dsh-multi-user/`）保留。

## 首次使用

1. 访问 `http://127.0.0.1:3080/` → 显示「初始化」页，设置主管理员；
2. 自动跳转登录页 → 用主管理员账号登录 → 进入 DSH；
3. 主管理员通过 `/api/mu/admin/*` 添加子用户并授权工作区目录。

## HTTP API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/mu/auth/password` | 账号密码登录（成功写 JWT cookie） |
| POST | `/api/mu/auth/logout` | 登出（清 cookie） |
| GET | `/api/mu/auth/me` | 当前身份 |
| GET | `/api/mu/public/config` | 公开配置（生命周期状态） |
| POST | `/api/mu/admin/owner` | 初始化主管理员（fresh 态） |
| GET | `/api/mu/me/grants` | 当前用户身份 + 授权目录列表 |
| GET/POST | `/api/mu/admin/users` | 用户列表 / 新建子用户 |
| POST | `/api/mu/admin/users/update` | 更新用户（状态/显示名） |
| POST | `/api/mu/admin/users/grants` | 授权工作区目录 |
| POST | `/api/mu/admin/users/reset-password` | 重置密码 |
| POST | `/api/mu/admin/users/delete` | 删除用户（匿名化保留） |

## 数据存储

```
$DSH_HOME/plugins-data/dsh-multi-user/
├─ .jwt-secret            # JWT HMAC 密钥（0600，自动生成）
├─ settings.json          # 插件设置（ownerUserId / auth）
├─ users.json             # 用户库（scrypt 加盐口令哈希）
└─ tenants/<uid>/grants.json  # 用户 → 工作区目录列表映射
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
