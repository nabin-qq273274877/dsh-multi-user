/**
 * dsh-multi-user 生命周期状态机（JWT 版）。
 *
 * fresh（无主管理员）→ 访问 / 显示初始化页
 *   → 设置主管理员 → admin-set
 *   → 访问 / 显示登录页
 *   → 登录成功 → 签发 JWT 写 cookie → 跳转回 /
 *
 * 插件挂载即启用登录墙（无「启用/停用」开关，区别于旧网关形态）。
 */

import { hashPassword, type DataStore } from './store.js';
import type { UserAccount } from './types.js';

export type LifecycleState = 'fresh' | 'admin-set';

export class LifecycleManager {
  private store: DataStore;

  constructor(store: DataStore) {
    this.store = store;
  }

  /** fresh：尚未设置主管理员；admin-set：已有主管理员。 */
  state(): LifecycleState {
    const s = this.store.getSettings();
    if (s.ownerUserId && this.store.getUserById(s.ownerUserId)) return 'admin-set';
    return 'fresh';
  }

  /** 设置 / 重设主管理员（仅 fresh 态）。 */
  async setOwner(input: { username: string; password: string }): Promise<{ ok: boolean; userId?: string; error?: string }> {
    if (this.state() === 'admin-set') {
      return { ok: false, error: '主管理员已设置，不可重复初始化' };
    }
    const username = (input.username ?? '').trim();
    if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) {
      return { ok: false, error: '用户名需为 2-32 位字母/数字/_.-' };
    }
    if ((input.password ?? '').length < 6) {
      return { ok: false, error: '初始密码至少 6 位' };
    }
    const owner: UserAccount = await this.store.createUser({
      username,
      displayName: username,
      role: 'owner',
      passwordHash: hashPassword(input.password),
    });
    const settings = this.store.getSettings();
    settings.ownerUserId = owner.id;
    settings.enabledAt = new Date().toISOString();
    this.store.saveSettings(settings);
    return { ok: true, userId: owner.id };
  }
}
