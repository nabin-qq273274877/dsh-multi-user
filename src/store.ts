/**
 * dsh-multi-user 数据存储门面（纯逻辑层，形态无关）。
 *
 * 数据目录：$DSH_HOME/plugins-data/dsh-multi-user/
 *   settings.json   插件级设置（enabled / ownerUserId / auth）
 *   users.json      用户库（scrypt 加盐口令哈希）
 *   tenants/<uid>/grants.json   用户 → 专属工作区目录（单一目录）
 *
 * 权限模型：每个用户（含主管理员）一个专属目录 workspaceRoot，按 userId
 * 自动生成 `$DSH_HOME/workspaces/<userId>/`，保证不重名。用户只在其专属
 * 目录内建子目录作为工作区。
 *
 * 不写原生 workspaceRegistry / sessionPersistence，插件移除即还原。
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mergeSettings, type PluginSettings, type UserAccount, type Role } from './types.js';

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 64;

/* ---------------- 口令 ---------------- */

export function hashPassword(plain: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain.normalize('NFKC'), salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
  return {
    algo: 'scrypt' as const,
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
    saltB64: salt.toString('base64'),
    hashB64: hash.toString('base64'),
  };
}

export function verifyPassword(plain: string, record: { saltB64: string; hashB64: string; N: number; r: number; p: number }): boolean {
  try {
    const salt = Buffer.from(record.saltB64, 'base64');
    const expected = Buffer.from(record.hashB64, 'base64');
    const actual = crypto.scryptSync(plain.normalize('NFKC'), salt, expected.length, {
      N: record.N,
      r: record.r,
      p: record.p,
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/* ---------------- JSON 原子读写 ---------------- */

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (err) {
    if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`[dsh-multi-user] JSON 文件损坏或不可读: ${file} — ${(err as Error).message}`);
  }
}

function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/* ---------------- DataStore ---------------- */

export interface CreateUserInput {
  username: string;
  displayName?: string;
  role: Role;
  passwordHash?: ReturnType<typeof hashPassword>;
}

export class DataStore {
  readonly root: string;
  /** DSH 主目录（$DSH_HOME），专属目录父根 `$DSH_HOME/workspaces/` 据此计算。 */
  readonly dshHome: string;

  constructor(root: string, dshHome: string) {
    this.root = root;
    this.dshHome = dshHome;
    fs.mkdirSync(path.join(root, 'tenants'), { recursive: true });
  }

  get settingsPath(): string {
    return path.join(this.root, 'settings.json');
  }
  get usersPath(): string {
    return path.join(this.root, 'users.json');
  }
  grantsPath(userId: string): string {
    return path.join(this.root, 'tenants', userId, 'grants.json');
  }

  getSettings(): PluginSettings {
    return mergeSettings(readJson<Partial<PluginSettings>>(this.settingsPath));
  }

  saveSettings(s: PluginSettings): void {
    writeJsonAtomic(this.settingsPath, s);
  }

  listUsers(): UserAccount[] {
    return readJson<UserAccount[]>(this.usersPath) ?? [];
  }

  saveUsers(users: UserAccount[]): void {
    writeJsonAtomic(this.usersPath, users);
  }

  getUserById(id: string): UserAccount | null {
    return this.listUsers().find((u) => u.id === id) ?? null;
  }

  getUserByUsername(username: string): UserAccount | null {
    const lower = username.toLowerCase();
    return this.listUsers().find((u) => u.username.toLowerCase() === lower) ?? null;
  }

  async createUser(input: CreateUserInput): Promise<UserAccount> {
    const users = this.listUsers();
    const account: UserAccount = {
      id: 'u_' + crypto.randomBytes(8).toString('hex'),
      username: input.username,
      displayName: input.displayName ?? input.username,
      role: input.role,
      status: 'active',
      bindings: input.passwordHash ? { password: input.passwordHash } : {},
      createdAt: new Date().toISOString(),
    };
    users.push(account);
    this.saveUsers(users);
    // 每个用户自动分配专属目录（按 userId，保证不重名）
    this.setWorkspaceRoot(account.id, this.workspaceRootPath(account.id));
    return account;
  }

  async updateUser(id: string, patch: (u: UserAccount) => UserAccount): Promise<UserAccount | null> {
    const users = this.listUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx < 0) return null;
    users[idx] = patch(users[idx]);
    this.saveUsers(users);
    return users[idx];
  }

  async anonymizeUser(id: string): Promise<boolean> {
    const users = this.listUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx < 0) return false;
    const prev = users[idx];
    users[idx] = {
      id: prev.id,
      username: `deleted_${id}`,
      displayName: '(已删除)',
      role: prev.role,
      status: 'disabled',
      bindings: {},
      createdAt: prev.createdAt,
      disabledAt: new Date().toISOString(),
      anonymized: true,
    };
    this.saveUsers(users);
    return true;
  }

  /* ---------- 专属工作区目录（每用户一个，按 userId 自动生成） ---------- */

  /** 由 userId 生成专属目录绝对路径：$DSH_HOME/workspaces/<userId>（保证不重名）。 */
  workspaceRootPath(userId: string): string {
    return path.join(this.dshHome, 'workspaces', userId);
  }

  /** 读取某用户的专属目录；无记录时回退到按 userId 生成的默认路径。 */
  getWorkspaceRoot(userId: string): string {
    const record = readJson<{ workspaceRoot?: string; workspaceDirs?: string[] }>(this.grantsPath(userId));
    // 兼容旧数据：workspaceDirs 列表里的第一个作为 root
    if (record?.workspaceRoot) return record.workspaceRoot;
    if (record && Array.isArray(record.workspaceDirs) && record.workspaceDirs.length > 0) return record.workspaceDirs[0];
    return this.workspaceRootPath(userId);
  }

  /** 写入某用户的专属目录，并确保目录真实存在。 */
  setWorkspaceRoot(userId: string, workspaceRoot: string): void {
    writeJsonAtomic(this.grantsPath(userId), { workspaceRoot, updatedAt: new Date().toISOString() });
    fs.mkdirSync(workspaceRoot, { recursive: true });
  }

  /* ---------- 用户加入的工作区路径清单（视图分档依据） ----------
   *
   * 每个用户维护一份「已加入的工作区路径」清单，存于 grants.json 的
   * `workspacePaths` 字段。用户通过目录选择器选任意路径（如 D:\Project\foo）
   * 都会加入该清单，仅该用户可见；这不是「专属目录的物理子目录」约束。
   */

  /** 读取某用户已加入的工作区路径清单。 */
  getWorkspacePaths(userId: string): string[] {
    const record = readJson<{ workspacePaths?: string[] }>(this.grantsPath(userId));
    return Array.isArray(record?.workspacePaths) ? record.workspacePaths : [];
  }

  /** 把一条路径加入用户清单（去重，返回更新后的清单）。 */
  addWorkspacePath(userId: string, p: string): string[] {
    const record = readJson<{ workspaceRoot?: string; workspacePaths?: string[] }>(this.grantsPath(userId)) ?? {};
    const list = Array.isArray(record.workspacePaths) ? record.workspacePaths.slice() : [];
    const norm = normalizeForCompare(p);
    if (!list.some((x) => normalizeForCompare(x) === norm)) list.push(p);
    writeJsonAtomic(this.grantsPath(userId), { ...record, workspacePaths: list, updatedAt: new Date().toISOString() });
    return list;
  }

  /** 从用户清单移除一条路径（按规范化比较），返回更新后的清单。 */
  removeWorkspacePath(userId: string, p: string): string[] {
    const record = readJson<{ workspaceRoot?: string; workspacePaths?: string[] }>(this.grantsPath(userId)) ?? {};
    const list = Array.isArray(record.workspacePaths) ? record.workspacePaths.slice() : [];
    const norm = normalizeForCompare(p);
    const next = list.filter((x) => normalizeForCompare(x) !== norm);
    writeJsonAtomic(this.grantsPath(userId), { ...record, workspacePaths: next, updatedAt: new Date().toISOString() });
    return next;
  }
}

/** 路径比较规范化：反斜杠→正斜杠，去尾分隔符，Windows 下统一小写。 */
function normalizeForCompare(p: string): string {
  let s = String(p).replace(/\\/g, '/').replace(/\/+$/, '');
  if (process.platform === 'win32') s = s.toLowerCase();
  return s;
}
