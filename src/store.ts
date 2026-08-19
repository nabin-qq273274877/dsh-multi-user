/**
 * dsh-multi-user 数据存储门面（纯逻辑层，形态无关）。
 *
 * 数据目录：$DSH_HOME/plugins-data/dsh-multi-user/
 *   settings.json   插件级设置（enabled / ownerUserId / auth）
 *   users.json      用户库（scrypt 加盐口令哈希）
 *   tenants/<uid>/grants.json   用户 → 工作区目录列表映射
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

  constructor(root: string) {
    this.root = root;
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
    this.saveGrants(account.id, []);
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

  getGrants(userId: string): string[] {
    const record = readJson<string[] | { workspaceDirs?: string[] }>(this.grantsPath(userId));
    if (Array.isArray(record)) return record;
    if (record && Array.isArray(record.workspaceDirs)) return record.workspaceDirs;
    return [];
  }

  saveGrants(userId: string, workspaceDirs: string[]): void {
    writeJsonAtomic(this.grantsPath(userId), { workspaceDirs, updatedAt: new Date().toISOString() });
  }
}
