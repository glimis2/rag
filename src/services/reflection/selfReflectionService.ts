/**
 * Self-Reflection 服务
 *
 * 实现答案自纠错机制
 */

import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { AnswerEvaluator, EvaluationResult } from './answerEvaluator';
import { RetrievedChunk } from '../rag/types';

/**
 * Self-Reflection 服务
 */
export class SelfReflectionService {
  private readonly evaluator: AnswerEvaluator;
  private readonly deepseek;
  private readonly model: string;
  private readonly maxReflections: number;
  private readonly confidenceThreshold: number;

  constructor(
    apiKey?: string,
    baseURL?: string,
    model: string = 'deepseek-chat',
    maxReflections: number = 3,
    confidenceThreshold: number = 0.8
  ) {
    this.evaluator = new AnswerEvaluator(apiKey, baseURL, model);
    this.deepseek = createOpenAI({
      apiKey: apiKey || process.env.DEEPSEEK_API_KEY,
      baseURL: baseURL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    });
    this.model = model;
    this.maxReflections = maxReflections;
    this.confidenceThreshold = confidenceThreshold;
  }

  /**
   * 反思并改进答案
   * @param question 用户问题
   * @param answer 初始答案
   * @param chunks 检索到的文档
   * @param isStreaming 是否流式模式
   * @returns 改进后的答案和评估结果
   */
  async reflect(
    question: string,
    answer: string,
    chunks: RetrievedChunk[],
    isStreaming: boolean = false
  ): Promise<{
    answer: string;
    evaluation: EvaluationResult;
    reflectionRounds: number;
  }> {
    let currentAnswer = answer;
    let reflectionRounds = 0;

    for (let i = 0; i < this.maxReflections; i++) {
      // 评估当前答案
      const evaluation = await this.evaluator.evaluate(
        question,
        currentAnswer,
        chunks
      );

      reflectionRounds = i + 1;

      console.log(
        `[SelfReflection] Round ${reflectionRounds}: confidence=${evaluation.confidence}`
      );

      // 如果置信度足够高，直接返回
      if (evaluation.confidence >= this.confidenceThreshold) {
        return {
          answer: currentAnswer,
          evaluation,
          reflectionRounds,
        };
      }

      // 流式模式下无法重新生成，添加提示后返回
      if (isStreaming) {
        const notice =
          '\n\n💡 提示：答案可能需要进一步完善，建议追问或重新提问。';
        return {
          answer: currentAnswer + notice,
          evaluation,
          reflectionRounds,
        };
      }

      // 重新生成改进的答案
      currentAnswer = await this.regenerateAnswer(
        question,
        chunks,
        currentAnswer,
        evaluation
      );
    }

    // 达到最大反思次数，返回最后的答案
    const finalEvaluation = await this.evaluator.evaluate(
      question,
      currentAnswer,
      chunks
    );

    return {
      answer: currentAnswer,
      evaluation: finalEvaluation,
      reflectionRounds,
    };
  }

  /**
   * 重新生成改进的答案
   */
  private async regenerateAnswer(
    question: string,
    chunks: RetrievedChunk[],
    previousAnswer: string,
    evaluation: EvaluationResult
  ): Promise<string> {
    try {
      const context = chunks.map((c) => c.content).join('\n\n');

      const prompt = `你是一个专业的AI助手。之前的答案存在一些问题，请改进。

## 用户问题
${question}

## 检索到的知识
${context}

## 之前的答案
${previousAnswer}

## 发现的问题
${evaluation.issues.join('\n')}

## 改进建议
${evaluation.suggestions.join('\n')}

请生成一个改进后的答案，确保：
1. 解决上述所有问题
2. 基于检索到的知识
3. 完整、准确、易懂

改进后的答案：`;

      const result = await generateText({
        model: this.deepseek(this.model),
        prompt,
        temperature: 0.7,
      });

      return result.text;
    } catch (error) {
      console.error('[SelfReflection] Failed to regenerate answer:', error);
      // 降级：返回原答案
      return previousAnswer;
    }
  }
}
