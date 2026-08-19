/**
 * dsh-multi-user JWT 签发/验签（零依赖，HMAC-SHA256，Node 内置 crypto）。
 *
 * 形态：`header.payload.signature` 三段 base64url。载荷含 userId / role /
 * username / iat / exp。密钥存于插件数据目录 `.jwt-secret`（0600），首次
 * 启动自动生成并持久化，重启后 JWT 仍有效。
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DEFAULT_TTL_DAYS = 7;

export interface JwtClaims {
  userId: string;
  username?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function sign(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

/** 读取或生成密钥；密钥文件缺失时生成并收紧权限到 0600。 */
export function loadOrCreateSecret(dataRoot: string): string {
  const secretPath = path.join(dataRoot, '.jwt-secret');
  try {
    const existing = fs.readFileSync(secretPath, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    /* 不存在则生成 */
  }
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  try {
    fs.chmodSync(secretPath, 0o600);
  } catch {
    /* Windows 上近似 no-op，忽略 */
  }
  return secret;
}

/**
 * 签发 JWT。
 * @param claims - { userId, username, role }
 * @param secret - 签名密钥
 * @param ttlDays - 有效期（天）
 * @returns JWT 字符串
 */
export function signJwt(claims: JwtClaims, secret: string, ttlDays = DEFAULT_TTL_DAYS): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    ...claims,
    iat: now,
    exp: now + ttlDays * 86400,
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64url(Buffer.from(JSON.stringify(header)));
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const s = sign(`${h}.${p}`, secret);
  return `${h}.${p}.${s}`;
}

/**
 * 验签并解析 JWT。
 * @returns 载荷对象；无效/过期/篡改返回 null。
 */
export function verifyJwt(token: string | undefined | null, secret: string): JwtClaims | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = sign(`${h}.${p}`, secret);
  // 恒定时间比较防时序侧信道
  const a = Buffer.from(expected);
  const b = Buffer.from(s);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as JwtClaims;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
    if (typeof payload.userId !== 'string' || payload.userId.length === 0) return null;
    return payload;
  } catch {
    return null;
  }
}
