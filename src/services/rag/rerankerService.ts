/**
 * 重排序服务
 *
 * 使用 Cohere Rerank API 对检索结果进行精确重排序
 * 提高最终结果的相关性
 */

import { RerankerService, RetrievedChunk } from './types';

/**
 * Cohere Rerank API 响应接口
 */
interface CohereRerankResponse {
  results: Array<{
    index: number;
    relevance_score: number;
  }>;
}

/**
 * Cohere 重排序服务实现
 */
export class CohereRerankerService implements RerankerService {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly apiUrl: string;

  /**
   * @param apiKey Cohere API Key
   * @param model 重排序模型，默认 rerank-english-v3.0
   */
  constructor(
    apiKey: string = process.env.COHERE_API_KEY || '',
    model: string = 'rerank-english-v3.0'
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.apiUrl = 'https://api.cohere.ai/v1/rerank';
  }

  /**
   * 重排序检索结果
   * @param query 用户查询
   * @param chunks 待重排序的结果列表
   * @param topK 返回前 K 个结果
   * @returns 重排序后的结果列表
   */
  async rerank(
    query: string,
    chunks: RetrievedChunk[],
    topK: number
  ): Promise<RetrievedChunk[]> {
    // 如果没有配置 API Key，直接返回原始结果
    if (!this.apiKey) {
      console.warn('[Reranker] Cohere API Key not configured, skipping rerank');
      return chunks.slice(0, topK);
    }

    // 如果结果数量小于等于 topK，无需重排序
    if (chunks.length <= topK) {
      return chunks;
    }

    try {
      // 调用 Cohere Rerank API
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          query,
          documents: chunks.map(chunk => chunk.content),
          top_n: topK,
          return_documents: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cohere API error: ${response.status} ${errorText}`);
      }

      const data = await response.json() as CohereRerankResponse;

      // 根据 Cohere 返回的排序重新组织结果
      const rerankedChunks = data.results.map(result => ({
        ...chunks[result.index],
        score: result.relevance_score,
        metadata: {
          ...chunks[result.index].metadata,
          originalScore: chunks[result.index].score,
          rerankScore: result.relevance_score,
        },
      }));

      return rerankedChunks;
    } catch (error) {
      console.error('[Reranker] Failed to rerank:', error);
      // 降级：返回原始排序的前 topK 个结果
      return chunks.slice(0, topK);
    }
  }
}
