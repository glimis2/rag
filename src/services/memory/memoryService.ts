/**
 * 记忆服务
 *
 * 管理用户的短期记忆（Redis）和长期记忆（数据库）
 * 第二阶段：实现基于 Redis 的短期记忆
 * 第三阶段：扩展为完整的记忆系统
 */

import { getRedisClient } from '../../config/redis';

/**
 * 记忆条目
 */
export interface MemoryEntry {
  topic: string;
  content: string;
  importance: 'low' | 'medium' | 'high';
  timestamp: number;
}

/**
 * 记忆服务
 */
export class MemoryService {
  private readonly memoryTTL: number; // 短期记忆 TTL（秒）

  constructor(memoryTTL: number = 86400) {
    // 默认 24 小时
    this.memoryTTL = memoryTTL;
  }

  /**
   * 存储记忆
   */
  async storeMemory(
    userId: number,
    topic: string,
    content: string,
    importance: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<void> {
    try {
      const redis = await getRedisClient();
      const key = `memory:${userId}:${topic}`;

      const entry: MemoryEntry = {
        topic,
        content,
        importance,
        timestamp: Date.now(),
      };

      // 存储为 JSON
      await redis.setEx(key, this.memoryTTL, JSON.stringify(entry));

      console.log(`[Memory] Stored memory for user ${userId}, topic: ${topic}`);
    } catch (error) {
      console.error('[Memory] Failed to store memory:', error);
    }
  }

  /**
   * 召回记忆
   * @param userId 用户 ID
   * @param topic 主题（可选，用于过滤）
   * @param limit 返回数量限制
   */
  async recallMemory(
    userId: number,
    topic?: string,
    limit: number = 5
  ): Promise<MemoryEntry[]> {
    try {
      const redis = await getRedisClient();

      // 构建搜索模式
      const pattern = topic
        ? `memory:${userId}:${topic}`
        : `memory:${userId}:*`;

      // 查找所有匹配的 key
      const keys = await redis.keys(pattern);

      if (keys.length === 0) {
        return [];
      }

      // 获取所有记忆
      const memories: MemoryEntry[] = [];
      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          memories.push(JSON.parse(data));
        }
      }

      // 按时间戳降序排序
      memories.sort((a, b) => b.timestamp - a.timestamp);

      // 按重要性排序（高 > 中 > 低）
      const importanceOrder = { high: 3, medium: 2, low: 1 };
      memories.sort((a, b) => {
        const importanceDiff =
          importanceOrder[b.importance] - importanceOrder[a.importance];
        if (importanceDiff !== 0) return importanceDiff;
        return b.timestamp - a.timestamp;
      });

      // 限制数量
      return memories.slice(0, limit);
    } catch (error) {
      console.error('[Memory] Failed to recall memory:', error);
      return [];
    }
  }

  /**
   * 删除记忆
   */
  async deleteMemory(userId: number, topic: string): Promise<void> {
    try {
      const redis = await getRedisClient();
      const key = `memory:${userId}:${topic}`;
      await redis.del(key);
      console.log(`[Memory] Deleted memory for user ${userId}, topic: ${topic}`);
    } catch (error) {
      console.error('[Memory] Failed to delete memory:', error);
    }
  }

  /**
   * 清除用户的所有记忆
   */
  async clearUserMemory(userId: number): Promise<void> {
    try {
      const redis = await getRedisClient();
      const keys = await redis.keys(`memory:${userId}:*`);

      if (keys.length > 0) {
        await redis.del(keys);
      }

      console.log(`[Memory] Cleared ${keys.length} memories for user ${userId}`);
    } catch (error) {
      console.error('[Memory] Failed to clear user memory:', error);
    }
  }

  /**
   * 获取用户记忆统计
   */
  async getStats(userId: number): Promise<{
    totalCount: number;
    byImportance: Record<string, number>;
  }> {
    try {
      const redis = await getRedisClient();
      const keys = await redis.keys(`memory:${userId}:*`);

      const byImportance: Record<string, number> = {
        low: 0,
        medium: 0,
        high: 0,
      };

      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          const entry: MemoryEntry = JSON.parse(data);
          byImportance[entry.importance]++;
        }
      }

      return {
        totalCount: keys.length,
        byImportance,
      };
    } catch (error) {
      console.error('[Memory] Failed to get stats:', error);
      return {
        totalCount: 0,
        byImportance: { low: 0, medium: 0, high: 0 },
      };
    }
  }
}
