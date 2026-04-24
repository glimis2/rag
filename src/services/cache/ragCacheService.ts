/**
 * RAG 缓存服务
 *
 * 基于查询频次的智能缓存策略
 * - 频次统计：只有查询频次 >= 3 次才写入缓存
 * - TTL 管理：缓存 1 小时，频次统计 24 小时
 * - 查询归一化：相似问题命中同一缓存
 */

import { getRedisClient } from '../../config/redis';
import { RetrievedChunk } from '../rag/types';

/**
 * 缓存的结果结构
 */
export interface CachedResult {
  answer: string;
  sources: Array<{
    name: string;
    chapter: string;
    pageNumber: number;
    category: string;
    content?: string;
  }>;
  retrievalLog: {
    originalQuery: string;
    rewrittenQuery?: string;
    vectorCount: number;
    bm25Count?: number;
    webCount?: number;
    fusedCount?: number;
    rerankedCount: number;
    compressedCount?: number;
    toolsUsed: string[];
  };
  timestamp: number;
  isFallback: boolean;
}

/**
 * RAG 缓存服务
 */
export class RagCacheService {
  private readonly freqThreshold: number;
  private readonly cacheTTL: number; // 缓存 TTL（秒）
  private readonly freqTTL: number; // 频次统计 TTL（秒）

  constructor(
    freqThreshold: number = 3,
    cacheTTL: number = 3600, // 1 小时
    freqTTL: number = 86400 // 24 小时
  ) {
    this.freqThreshold = freqThreshold;
    this.cacheTTL = cacheTTL;
    this.freqTTL = freqTTL;
  }

  /**
   * 归一化查询
   * - 转小写
   * - 去除多余空格
   * - 去除标点符号
   */
  normalize(query: string): string {
    return query
      .toLowerCase()
      .replace(/[^\w\s一-龥]/g, '') // 保留字母、数字、空格、中文
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 增加查询频次
   * @returns 当前频次
   */
  async incrementFrequency(normalizedQuery: string): Promise<number> {
    try {
      const redis = await getRedisClient();
      const key = `freq:${normalizedQuery}`;

      // 增加计数
      const count = await redis.incr(key);

      // 设置 TTL（仅在第一次创建时）
      if (count === 1) {
        await redis.expire(key, this.freqTTL);
      }

      return count;
    } catch (error) {
      console.error('[RagCache] Failed to increment frequency:', error);
      return 0;
    }
  }

  /**
   * 获取查询频次
   */
  async getFrequency(normalizedQuery: string): Promise<number> {
    try {
      const redis = await getRedisClient();
      const key = `freq:${normalizedQuery}`;
      const count = await redis.get(key);
      return count ? parseInt(count) : 0;
    } catch (error) {
      console.error('[RagCache] Failed to get frequency:', error);
      return 0;
    }
  }

  /**
   * 获取缓存
   */
  async getCache(normalizedQuery: string): Promise<CachedResult | null> {
    try {
      const redis = await getRedisClient();
      const key = `cache:${normalizedQuery}`;
      const cached = await redis.get(key);

      if (!cached) {
        return null;
      }

      return JSON.parse(cached) as CachedResult;
    } catch (error) {
      console.error('[RagCache] Failed to get cache:', error);
      return null;
    }
  }

  /**
   * 写入缓存（仅当频次 >= 阈值）
   */
  async putCache(
    normalizedQuery: string,
    result: CachedResult,
    frequency: number
  ): Promise<void> {
    // 只有频次达到阈值才写入缓存
    if (frequency < this.freqThreshold) {
      console.log(
        `[RagCache] Frequency ${frequency} < ${this.freqThreshold}, skip caching`
      );
      return;
    }

    try {
      const redis = await getRedisClient();
      const key = `cache:${normalizedQuery}`;

      // 写入缓存
      await redis.setEx(key, this.cacheTTL, JSON.stringify(result));

      console.log(
        `[RagCache] Cached result for query (freq: ${frequency}): ${normalizedQuery.slice(0, 50)}...`
      );
    } catch (error) {
      console.error('[RagCache] Failed to put cache:', error);
    }
  }

  /**
   * 清除特定查询的缓存
   */
  async clearCache(normalizedQuery: string): Promise<void> {
    try {
      const redis = await getRedisClient();
      await redis.del(`cache:${normalizedQuery}`);
      await redis.del(`freq:${normalizedQuery}`);
    } catch (error) {
      console.error('[RagCache] Failed to clear cache:', error);
    }
  }

  /**
   * 清除所有缓存
   */
  async clearAllCache(): Promise<void> {
    try {
      const redis = await getRedisClient();
      const cacheKeys = await redis.keys('cache:*');
      const freqKeys = await redis.keys('freq:*');

      if (cacheKeys.length > 0) {
        await redis.del(cacheKeys);
      }
      if (freqKeys.length > 0) {
        await redis.del(freqKeys);
      }

      console.log(`[RagCache] Cleared ${cacheKeys.length} cache entries and ${freqKeys.length} frequency entries`);
    } catch (error) {
      console.error('[RagCache] Failed to clear all cache:', error);
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<{
    cacheCount: number;
    freqCount: number;
  }> {
    try {
      const redis = await getRedisClient();
      const cacheKeys = await redis.keys('cache:*');
      const freqKeys = await redis.keys('freq:*');

      return {
        cacheCount: cacheKeys.length,
        freqCount: freqKeys.length,
      };
    } catch (error) {
      console.error('[RagCache] Failed to get stats:', error);
      return { cacheCount: 0, freqCount: 0 };
    }
  }
}
