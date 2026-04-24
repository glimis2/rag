/**
 * 记忆服务
 *
 * 管理用户的记忆（纯内存存储，基于 Redis）
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
 * 记忆服务（纯内存实现）
 */
export class MemoryService {
  private readonly memoryTTL: number; // 记忆 TTL（秒）

  constructor(memoryTTL: number = 86400) {
    // 默认 24 小时
    this.memoryTTL = memoryTTL;
  }

  /**
   * 存储记忆（仅 Redis）
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

      await redis.setEx(key, this.memoryTTL, JSON.stringify(entry));

      console.log(`[Memory] Stored memory for user ${userId}, topic: ${topic}`);
    } catch (error) {
      console.error('[Memory] Failed to store memory:', error);
    }
  }

  /**
   * 召回记忆（仅从 Redis）
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
      return await this.recallFromRedis(userId, topic, limit);
    } catch (error) {
      console.error('[Memory] Failed to recall memory:', error);
      return [];
    }
  }

  /**
   * 从 Redis 召回记忆
   */
  private async recallFromRedis(
    userId: number,
    topic?: string,
    limit: number = 5
  ): Promise<MemoryEntry[]> {
    const redis = await getRedisClient();

    const pattern = topic
      ? `memory:${userId}:${topic}`
      : `memory:${userId}:*`;

    const keys = await redis.keys(pattern);

    if (keys.length === 0) {
      return [];
    }

    const memories: MemoryEntry[] = [];
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        memories.push(JSON.parse(data));
      }
    }

    return this.sortAndLimitMemories(memories, limit);
  }


  /**
   * 排序和限制记忆数量
   */
  private sortAndLimitMemories(
    memories: MemoryEntry[],
    limit: number
  ): MemoryEntry[] {
    const importanceOrder = { high: 3, medium: 2, low: 1 };

    memories.sort((a, b) => {
      const importanceDiff =
        importanceOrder[b.importance] - importanceOrder[a.importance];
      if (importanceDiff !== 0) return importanceDiff;
      return b.timestamp - a.timestamp;
    });

    return memories.slice(0, limit);
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

      console.log(`[Memory] Cleared all memories for user ${userId}`);
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
          const memory = JSON.parse(data) as MemoryEntry;
          byImportance[memory.importance]++;
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
