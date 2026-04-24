/**
 * Redis 配置和客户端
 */

import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

/**
 * 获取 Redis 客户端实例
 */
export async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      password: process.env.REDIS_PASSWORD,
    });

    redisClient.on('error', (err) => {
      console.error('[Redis] Connection error:', err);
    });

    redisClient.on('connect', () => {
      console.log('[Redis] Connected successfully');
    });

    await redisClient.connect();
  }

  return redisClient;
}

/**
 * 关闭 Redis 连接
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
