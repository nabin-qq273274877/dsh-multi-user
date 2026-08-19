/**
 * dsh-multi-user 核心领域类型（纯逻辑层，形态无关）。
 * 对应 FEATURE 文档 §4/§5：角色、用户库、工作区授权、插件设置。
 */

export type Role = 'owner' | 'member';
export type UserStatus = 'active' | 'disabled';

/** 内置模式口令哈希记录（scrypt 加盐）。 */
export interface PasswordRecord {
  algo: 'scrypt';
  N: number;
  r: number;
  p: number;
  saltB64: string;
  hashB64: string;
}

/** 用户账号（users.json 条目）。 */
export interface UserAccount {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  bindings: {
    password?: PasswordRecord;
  };
  createdAt: string;
  disabledAt?: string;
  anonymized?: boolean;
}

/** 插件级配置（settings.json）。 */
export interface PluginSettings {
  schemaVersion: number;
  enabled: boolean;
  enabledAt?: string | null;
  disabledAt?: string | null;
  ownerUserId?: string | null;
  auth: {
    methods: {
      password: { enabled: boolean };
    };
    sessionTtlDays: number;
    lockoutThreshold: number;
    lockoutMinutes: number;
  };
}

export const SCHEMA_VERSION = 1;

/** 默认插件设置（账号密码登录为唯一启用的方式）。 */
export function defaultSettings(): PluginSettings {
  return {
    schemaVersion: SCHEMA_VERSION,
    enabled: true,
    enabledAt: null,
    disabledAt: null,
    ownerUserId: null,
    auth: {
      methods: {
        password: { enabled: true },
      },
      sessionTtlDays: 7,
      lockoutThreshold: 5,
      lockoutMinutes: 10,
    },
  };
}

/** 深合并用户设置到默认值（容忍旧版本缺字段）。 */
export function mergeSettings(saved: Partial<PluginSettings> | null | undefined): PluginSettings {
  const def = defaultSettings();
  if (!saved || typeof saved !== 'object') return def;
  return {
    ...def,
    ...saved,
    schemaVersion: SCHEMA_VERSION,
    auth: {
      ...def.auth,
      ...(saved.auth ?? {}),
      methods: {
        password: { ...def.auth.methods.password, ...(saved.auth?.methods?.password ?? {}) },
      },
    },
  };
}

/** HTTP 侧统一用户视图（不下发口令哈希等敏感字段）。 */
export interface PublicUserView {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  hasPassword: boolean;
  createdAt: string;
}

export function toPublicView(u: UserAccount): PublicUserView {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    status: u.status,
    hasPassword: !!u.bindings.password,
    createdAt: u.createdAt,
  };
}
