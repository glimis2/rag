/**
 * 上下文压缩器
 *
 * 根据 Token 预算智能压缩检索结果
 * 确保最终上下文不超过模型限制
 */

import { ContextCompressor, RetrievedChunk } from './types';

/**
 * Token 计数器（简单估算）
 * 中文：1 字符 ≈ 1.5 tokens
 * 英文：1 单词 ≈ 1.3 tokens
 */
class TokenCounter {
  /**
   * 估算文本的 token 数量
   */
  static estimate(text: string): number {
    // 统计中文字符数
    const chineseChars = (text.match(/[一-龥]/g) || []).length;

    // 统计英文单词数
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;

    // 其他字符（标点、数字等）
    const otherChars = text.length - chineseChars - englishWords;

    // 估算公式
    return Math.ceil(
      chineseChars * 1.5 +
      englishWords * 1.3 +
      otherChars * 0.5
    );
  }
}

/**
 * 上下文压缩器实现
 */
export class SimpleContextCompressor implements ContextCompressor {
  private readonly maxTokens: number;
  private readonly reserveTokens: number;

  /**
   * @param maxTokens 最大 token 数量
   * @param reserveTokens 为系统提示词和用户消息预留的 token 数量
   */
  constructor(maxTokens: number = 4000, reserveTokens: number = 1000) {
    this.maxTokens = maxTokens;
    this.reserveTokens = reserveTokens;
  }

  /**
   * 计算文本的 Token 数量
   */
  countTokens(text: string): number {
    return TokenCounter.estimate(text);
  }

  /**
   * 压缩检索结果
   * @param chunks 待压缩的结果列表
   * @param maxTokens 最大 token 数量（可选，使用构造函数中的默认值）
   * @returns 压缩后的结果列表
   */
  compress(chunks: RetrievedChunk[], maxTokens?: number): RetrievedChunk[] {
    const budget = (maxTokens || this.maxTokens) - this.reserveTokens;

    if (budget <= 0) {
      console.warn('[ContextCompressor] No token budget available');
      return [];
    }

    const compressed: RetrievedChunk[] = [];
    let usedTokens = 0;

    for (const chunk of chunks) {
      const chunkTokens = TokenCounter.estimate(chunk.content);

      // 如果单个 chunk 超过预算，截断它
      if (chunkTokens > budget) {
        const truncatedChunk = this.truncateChunk(chunk, budget);
        compressed.push(truncatedChunk);
        break; // 预算用完
      }

      // 如果加上这个 chunk 会超预算
      if (usedTokens + chunkTokens > budget) {
        // 尝试部分截断
        const remainingBudget = budget - usedTokens;
        if (remainingBudget > 100) { // 至少保留 100 tokens
          const truncatedChunk = this.truncateChunk(chunk, remainingBudget);
          compressed.push(truncatedChunk);
        }
        break; // 预算用完
      }

      // 正常添加
      compressed.push(chunk);
      usedTokens += chunkTokens;
    }

    console.log(
      `[ContextCompressor] Compressed ${chunks.length} chunks to ${compressed.length} chunks, ` +
      `estimated tokens: ${usedTokens}/${budget}`
    );

    return compressed;
  }

  /**
   * 截断单个 chunk 以适应 token 预算
   */
  private truncateChunk(chunk: RetrievedChunk, targetTokens: number): RetrievedChunk {
    // 估算每个字符对应的 token 数
    const currentTokens = TokenCounter.estimate(chunk.content);
    const ratio = targetTokens / currentTokens;

    // 计算目标字符数
    const targetLength = Math.floor(chunk.content.length * ratio * 0.9); // 留 10% 余量

    // 截断内容
    const truncatedContent = chunk.content.slice(0, targetLength) + '...';

    return {
      ...chunk,
      content: truncatedContent,
      metadata: {
        ...chunk.metadata,
        truncated: true,
        originalLength: chunk.content.length,
        truncatedLength: truncatedContent.length,
      },
    };
  }
}
