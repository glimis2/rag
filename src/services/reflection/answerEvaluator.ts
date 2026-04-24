/**
 * 答案评估器
 *
 * 使用 LLM 评估答案质量
 */

import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { RetrievedChunk } from '../rag/types';

/**
 * 评估结果
 */
export interface EvaluationResult {
  /** 置信度分数 (0-1) */
  confidence: number;

  /** 发现的问题 */
  issues: string[];

  /** 改进建议 */
  suggestions: string[];
}

/**
 * 答案评估器
 */
export class AnswerEvaluator {
  private readonly openai;
  private readonly model: string;

  constructor(
    apiKey?: string,
    baseURL?: string,
    model: string = 'gpt-4o-mini'
  ) {
    this.openai = createOpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
      baseURL: baseURL || process.env.OPENAI_BASE_URL,
    });
    this.model = model;
  }

  /**
   * 评估答案质量
   * @param question 用户问题
   * @param answer 生成的答案
   * @param chunks 检索到的文档
   * @returns 评估结果
   */
  async evaluate(
    question: string,
    answer: string,
    chunks: RetrievedChunk[]
  ): Promise<EvaluationResult> {
    try {
      const prompt = this.buildEvaluationPrompt(question, answer, chunks);

      const result = await generateText({
        model: this.openai(this.model),
        prompt,
        temperature: 0.3,
      });

      return this.parseEvaluation(result.text);
    } catch (error) {
      console.error('[AnswerEvaluator] Failed to evaluate answer:', error);
      // 降级：返回高置信度，不阻塞流程
      return {
        confidence: 0.9,
        issues: [],
        suggestions: [],
      };
    }
  }

  /**
   * 构建评估 Prompt
   */
  private buildEvaluationPrompt(
    question: string,
    answer: string,
    chunks: RetrievedChunk[]
  ): string {
    const context = chunks.map((c) => c.content).join('\n\n');

    return `你是一个答案质量评估专家。请评估以下答案的质量。

## 用户问题
${question}

## 检索到的知识
${context}

## 待评估的答案
${answer}

## 评估标准
1. 答案是否基于检索到的知识？
2. 答案是否完整回答了问题？
3. 答案是否存在事实错误？
4. 答案是否存在逻辑矛盾？
5. 答案是否过于简略或冗长？

请以 JSON 格式返回评估结果：
{
  "confidence": 0.85,
  "issues": ["问题1", "问题2"],
  "suggestions": ["建议1", "建议2"]
}

其中：
- confidence: 0-1 之间的分数，表示答案质量
- issues: 发现的问题列表（如果没有问题，返回空数组）
- suggestions: 改进建议列表（如果没有建议，返回空数组）

只返回 JSON，不要其他内容。`;
  }

  /**
   * 解析评估结果
   */
  private parseEvaluation(text: string): EvaluationResult {
    try {
      // 提取 JSON 部分
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          confidence: 0.9,
          issues: [],
          suggestions: [],
        };
      }

      const result = JSON.parse(jsonMatch[0]) as EvaluationResult;

      // 验证格式
      if (
        typeof result.confidence !== 'number' ||
        !Array.isArray(result.issues) ||
        !Array.isArray(result.suggestions)
      ) {
        throw new Error('Invalid evaluation format');
      }

      // 确保 confidence 在 0-1 之间
      result.confidence = Math.max(0, Math.min(1, result.confidence));

      return result;
    } catch (error) {
      console.error('[AnswerEvaluator] Failed to parse evaluation:', error);
      return {
        confidence: 0.9,
        issues: [],
        suggestions: [],
      };
    }
  }
}
