/**
 * 向量检索器
 *
 * 基于 Milvus 向量数据库的语义检索
 */

import { Retriever, RetrievedChunk, RetrievalOptions } from './types';
import { searchVectors } from '../vectorStoreService';
import { VChunkSearchResult } from '../../models/VChunk';

export class VectorRetriever implements Retriever {
  readonly name = 'vector';

  /**
   * 执行向量检索
   * @param query 查询文本
   * @param options 检索选项
   * @returns 检索结果列表
   */
  async retrieve(query: string, options: RetrievalOptions): Promise<RetrievedChunk[]> {
    const { topK, knowledgeBaseIds = [], minScore = 0 } = options;

    try {
      // 调用现有的向量检索服务
      const results: VChunkSearchResult[] = await searchVectors(
        query,
        knowledgeBaseIds,
        topK
      );

      // 转换为统一格式
      return results
        .filter(result => this.convertScore(result.score) >= minScore)
        .map(result => this.convertToChunk(result));

    } catch (error) {
      console.error('[VectorRetriever] Retrieval failed:', error);
      // 降级：返回空结果而不是抛出异常
      return [];
    }
  }

  /**
   * 转换 Milvus 结果为统一格式
   */
  private convertToChunk(result: VChunkSearchResult): RetrievedChunk {
    return {
      id: result.id?.toString() || '',
      content: result.content || '',
      source: 'vector',
      score: this.convertScore(result.score),
      metadata: {
        knowledgeBaseId: result.knowledge_base_id,
        category: result.category,
        contentType: result.content_type,
        chapter: result.chapter,
        pageNumber: result.page_number,
      },
    };
  }

  /**
   * 转换 Milvus 距离分数为相似度分数
   * Milvus 使用 L2 距离，距离越小越相似
   * 转换为 0-1 的相似度分数，分数越高越相似
   */
  private convertScore(distance: number): number {
    // L2 距离转相似度：1 / (1 + distance)
    // 距离为 0 时相似度为 1，距离越大相似度越小
    return 1 / (1 + distance);
  }
}
