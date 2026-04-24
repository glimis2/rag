/**
 * RRF (Reciprocal Rank Fusion) 融合服务
 *
 * 将多个检索器的结果融合为统一的排序列表
 * 使用 RRF 算法平衡不同来源的相关性
 */

import { FusionService, RetrievedChunk } from './types';

/**
 * RRF 融合服务实现
 */
export class RRFFusionService implements FusionService {
  private readonly k: number;

  /**
   * @param k RRF 常数，默认 60（论文推荐值）
   */
  constructor(k: number = 60) {
    this.k = k;
  }

  /**
   * 融合多个检索结果
   * @param results 多个检索器的结果列表
   * @param topK 返回前 K 个结果（可选，默认使用 k 参数）
   * @returns 融合后的结果列表
   */
  fuse(results: RetrievedChunk[][], topK?: number): RetrievedChunk[] {
    const finalTopK = topK || 50;
    // 1. 为每个结果计算 RRF 分数
    const scoreMap = new Map<string, { chunk: RetrievedChunk; rrfScore: number }>();

    results.forEach((resultList, sourceIndex) => {
      resultList.forEach((chunk, rank) => {
        // 生成唯一 key：优先使用 chunk.id，否则使用内容哈希
        const key = this.getChunkKey(chunk);

        // RRF 公式：score = 1 / (k + rank)
        const rrfScore = 1 / (this.k + rank + 1);

        if (scoreMap.has(key)) {
          // 如果已存在，累加 RRF 分数
          const existing = scoreMap.get(key)!;
          existing.rrfScore += rrfScore;
        } else {
          // 新结果，初始化
          scoreMap.set(key, {
            chunk: {
              ...chunk,
              metadata: {
                ...chunk.metadata,
                originalScore: chunk.score,
                sources: [chunk.source],
              },
            },
            rrfScore,
          });
        }
      });
    });

    // 2. 按 RRF 分数排序
    const fusedResults = Array.from(scoreMap.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, finalTopK)
      .map(item => ({
        ...item.chunk,
        score: item.rrfScore, // 使用 RRF 分数作为最终分数
      }));

    return fusedResults;
  }

  /**
   * 生成 chunk 的唯一标识
   * 优先使用 id，否则使用内容的简单哈希
   */
  private getChunkKey(chunk: RetrievedChunk): string {
    if (chunk.id) {
      return chunk.id;
    }

    // 简单哈希：取内容前 100 字符 + 来源
    const contentHash = chunk.content.slice(0, 100).replace(/\s+/g, '');
    return `${chunk.source}_${contentHash}`;
  }
}
