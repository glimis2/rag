/**
 * 记忆提取器
 *
 * 使用 LLM 从对话中提取显式记忆
 */

import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

/**
 * 提取的记忆条目
 */
export interface ExtractedMemory {
  topic: string;
  content: string;
  importance: 'low' | 'medium' | 'high';
}

/**
 * 记忆提取器
 */
export class MemoryExtractor {
  private readonly deepseek;
  private readonly model: string;

  constructor(
    apiKey?: string,
    baseURL?: string,
    model: string = 'deepseek-chat'
  ) {
    this.deepseek = createOpenAI({
      apiKey: apiKey || process.env.DEEPSEEK_API_KEY,
      baseURL: baseURL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    });
    this.model = model;
  }

  /**
   * 从对话中提取记忆
   * @param userMessage 用户消息
   * @param assistantMessage 助手回复
   * @returns 提取的记忆列表
   */
  async extract(
    userMessage: string,
    assistantMessage?: string
  ): Promise<ExtractedMemory[]> {
    try {
      const prompt = this.buildExtractionPrompt(userMessage, assistantMessage);

      const result = await generateText({
        model: this.deepseek(this.model),
        prompt,
        temperature: 0.3,
      });

      // 解析 LLM 返回的记忆
      return this.parseMemories(result.text);
    } catch (error) {
      console.error('[MemoryExtractor] Failed to extract memories:', error);
      return [];
    }
  }

  /**
   * 构建提取 Prompt
   */
  private buildExtractionPrompt(
    userMessage: string,
    assistantMessage?: string
  ): string {
    return `你是一个记忆提取专家。请从以下对话中提取需要记住的重要信息。

用户消息：${userMessage}
${assistantMessage ? `助手回复：${assistantMessage}` : ''}

提取规则：
1. 只提取用户明确表达的偏好、事实、待办事项等
2. 不要提取临时性的、一次性的信息
3. 每条记忆应该包含：主题（topic）、内容（content）、重要性（importance: low/medium/high）

示例：
用户说："我对青霉素过敏"
提取：topic=allergy, content=青霉素过敏, importance=high

用户说："我喜欢简洁的回答"
提取：topic=preference, content=喜欢简洁的回答风格, importance=medium

用户说："提醒我明天下午3点开会"
提取：topic=reminder, content=明天下午3点开会, importance=high

请以 JSON 数组格式返回提取的记忆，如果没有需要记住的信息，返回空数组 []：
[
  {"topic": "主题", "content": "内容", "importance": "high"},
  ...
]

只返回 JSON，不要其他内容。`;
  }

  /**
   * 解析 LLM 返回的记忆
   */
  private parseMemories(text: string): ExtractedMemory[] {
    try {
      // 提取 JSON 部分
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const memories = JSON.parse(jsonMatch[0]) as ExtractedMemory[];

      // 验证格式
      return memories.filter(
        (m) =>
          m.topic &&
          m.content &&
          ['low', 'medium', 'high'].includes(m.importance)
      );
    } catch (error) {
      console.error('[MemoryExtractor] Failed to parse memories:', error);
      return [];
    }
  }
}
