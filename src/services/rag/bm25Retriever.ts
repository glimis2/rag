/**
 * BM25 检索器
 *
 * 基于词频的传统检索算法，适合精确匹配和关键词查询
 */

import { Retriever, RetrievedChunk, RetrievalOptions } from './types';
import { AppDataSource } from '../../config/database';
import { Chunk } from '../../entities/Chunk';
import { In } from 'typeorm';
import * as natural from 'natural';

/**
 * BM25 文档表示
 */
interface BM25Document {
  id: number;
  content: string;
  tokens: string[];
  knowledgeBaseId: number;
  metadata: any;
}

export class BM25Retriever implements Retriever {
  readonly name = 'bm25';

  // BM25 参数
  private readonly k1 = 1.5; // 词频饱和参数
  private readonly b = 0.75; // 长度归一化参数

  // 中文分词器
  private tokenizer: natural.WordTokenizer;

  constructor() {
    this.tokenizer = new natural.WordTokenizer();
  }

  /**
   * 执行 BM25 检索
   * @param query 查询文本
   * @param options 检索选项
   * @returns 检索结果列表
   */
  async retrieve(query: string, options: RetrievalOptions): Promise<RetrievedChunk[]> {
    const { topK, knowledgeBaseIds = [], minScore = 0 } = options;

    try {
      // 1. 从数据库加载文档
      const documents = await this.loadDocuments(knowledgeBaseIds);

      if (documents.length === 0) {
        return [];
      }

      // 2. 分词查询
      const queryTokens = this.tokenize(query);

      if (queryTokens.length === 0) {
        return [];
      }

      // 3. 计算 BM25 分数
      const scores = this.calculateBM25Scores(queryTokens, documents);

      // 4. 排序并返回 topK
      const results = scores
        .filter(item => item.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(item => this.convertToChunk(item.document, item.score));

      return results;

    } catch (error) {
      console.error('[BM25Retriever] Retrieval failed:', error);
      // 降级：返回空结果
      return [];
    }
  }

  /**
   * 从数据库加载文档
   */
  private async loadDocuments(knowledgeBaseIds: number[]): Promise<BM25Document[]> {
    const chunkRepository = AppDataSource.getRepository(Chunk);

    const whereCondition = knowledgeBaseIds.length > 0
      ? { kb_id: In(knowledgeBaseIds) }
      : {};

    const chunks = await chunkRepository.find({
      where: whereCondition,
      select: ['id', 'content', 'kb_id', 'metadata'],
    });

    return chunks.map(chunk => ({
      id: chunk.id,
      content: chunk.content,
      tokens: this.tokenize(chunk.content),
      knowledgeBaseId: chunk.kb_id,
      metadata: chunk.metadata || {},
    }));
  }

  /**
   * 分词（支持中英文）
   */
  private tokenize(text: string): string[] {
    // 转小写
    const lowerText = text.toLowerCase();

    // 使用 natural 分词器
    const tokens = this.tokenizer.tokenize(lowerText) || [];

    // 过滤停用词和短词
    return tokens.filter(token => token.length > 1);
  }

  /**
   * 计算 BM25 分数
   */
  private calculateBM25Scores(
    queryTokens: string[],
    documents: BM25Document[]
  ): Array<{ document: BM25Document; score: number }> {
    const N = documents.length; // 文档总数
    const avgDocLength = this.calculateAvgDocLength(documents);

    // 计算 IDF
    const idfMap = this.calculateIDF(queryTokens, documents, N);

    // 计算每个文档的 BM25 分数
    return documents.map(doc => {
      const score = this.calculateDocScore(queryTokens, doc, idfMap, avgDocLength);
      return { document: doc, score };
    });
  }

  /**
   * 计算平均文档长度
   */
  private calculateAvgDocLength(documents: BM25Document[]): number {
    const totalLength = documents.reduce((sum, doc) => sum + doc.tokens.length, 0);
    return totalLength / documents.length;
  }

  /**
   * 计算 IDF (Inverse Document Frequency)
   */
  private calculateIDF(
    queryTokens: string[],
    documents: BM25Document[],
    N: number
  ): Map<string, number> {
    const idfMap = new Map<string, number>();

    for (const token of queryTokens) {
      // 计算包含该词的文档数
      const df = documents.filter(doc => doc.tokens.includes(token)).length;

      // IDF = log((N - df + 0.5) / (df + 0.5) + 1)
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
      idfMap.set(token, idf);
    }

    return idfMap;
  }

  /**
   * 计算单个文档的 BM25 分数
   */
  private calculateDocScore(
    queryTokens: string[],
    doc: BM25Document,
    idfMap: Map<string, number>,
    avgDocLength: number
  ): number {
    let score = 0;

    for (const token of queryTokens) {
      const idf = idfMap.get(token) || 0;

      // 计算词频 (TF)
      const tf = doc.tokens.filter(t => t === token).length;

      // BM25 公式
      const numerator = tf * (this.k1 + 1);
      const denominator =
        tf + this.k1 * (1 - this.b + this.b * (doc.tokens.length / avgDocLength));

      score += idf * (numerator / denominator);
    }

    return score;
  }

  /**
   * 转换为统一格式
   */
  private convertToChunk(doc: BM25Document, score: number): RetrievedChunk {
    return {
      id: `bm25_${doc.id}`,
      content: doc.content,
      source: 'bm25',
      score,
      metadata: {
        documentId: doc.id,
        knowledgeBaseId: doc.knowledgeBaseId,
        ...doc.metadata,
      },
    };
  }
}
