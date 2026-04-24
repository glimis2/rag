/**
 * 记忆服务
 *
 * 管理用户的短期记忆（Redis）和长期记忆（数据库）
 * 第二阶段：实现基于 Redis 的短期记忆
 * 第三阶段：扩展为完整的记忆系统（Redis + 数据库）
 */

import { getRedisClient } from '../../config/redis';
import { AppDataSource } from '../../config/database';
import { UserMemory } from '../../entities/UserMemory';

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
  private readonly memoryRepository;

  constructor(memoryTTL: number = 86400) {
    // 默认 24 小时
    this.memoryTTL = memoryTTL;
    this.memoryRepository = AppDataSource.getRepository(UserMemory);
  }

  /**
   * 存储记忆（Redis + 数据库双写）
   */
  async storeMemory(
    userId: number,
    topic: string,
    content: string,
    importance: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<void> {
    try {
      // 1. 写入 Redis（短期记忆）
      const redis = await getRedisClient();
      const key = `memory:${userId}:${topic}`;

      const entry: MemoryEntry = {
        topic,
        content,
        importance,
        timestamp: Date.now(),
      };

      await redis.setEx(key, this.memoryTTL, JSON.stringify(entry));

      // 2. 写入数据库（长期记忆）
      const memory = this.memoryRepository.create({
        user_id: userId,
        topic,
        content,
        importance,
      });

      await this.memoryRepository.save(memory);

      console.log(`[Memory] Stored memory for user ${userId}, topic: ${topic}`);
    } catch (error) {
      console.error('[Memory] Failed to store memory:', error);
    }
  }

  /**
   * 召回记忆（优先 Redis，降级到数据库）
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
      // 1. 先从 Redis 读取
      const redisMemories = await this.recallFromRedis(userId, topic, limit);

      // 2. 如果 Redis 结果不足，从数据库补充
      if (redisMemories.length < limit) {
        const dbMemories = await this.recallFromDatabase(
          userId,
          topic,
          limit - redisMemories.length
        );

        return [...redisMemories, ...dbMemories];
      }

      return redisMemories;
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
   * 从数据库召回记忆
   */
  private async recallFromDatabase(
    userId: number,
    topic?: string,
    limit: number = 5
  ): Promise<MemoryEntry[]> {
    const queryBuilder = this.memoryRepository
      .createQueryBuilder('memory')
      .where('memory.user_id = :userId', { userId })
      .orderBy('memory.importance', 'DESC')
      .addOrderBy('memory.created_at', 'DESC')
      .limit(limit);

    if (topic) {
      queryBuilder.andWhere('memory.topic = :topic', { topic });
    }

    const dbMemories = await queryBuilder.getMany();

    return dbMemories.map((m) => ({
      topic: m.topic,
      content: m.content,
      importance: m.importance,
      timestamp: m.created_at.getTime(),
    }));
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

      // 同时删除数据库记录
      await this.memoryRepository.delete({ user_id: userId, topic });

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

      // 同时清除数据库记录
      await this.memoryRepository.delete({ user_id: userId });

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
      const memories = await this.memoryRepository.find({
        where: { user_id: userId },
      });

      const byImportance: Record<string, number> = {
        low: 0,
        medium: 0,
        high: 0,
      };

      memories.forEach((m) => {
        byImportance[m.importance]++;
      });

      return {
        totalCount: memories.length,
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
