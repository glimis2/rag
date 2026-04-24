/**
 * 工具选择服务
 *
 * 使用 LLM 智能选择合适的工具来回答用户问题
 */

import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { availableTools, ToolName, ToolCallResult } from './toolDefinitions';

/**
 * 工具选择结果
 */
export interface ToolSelectionResult {
  /** 是否需要使用工具 */
  needsTools: boolean;

  /** 选择的工具列表 */
  selectedTools: ToolName[];

  /** 工具调用参数 */
  toolCalls: ToolCallResult[];

  /** LLM 的推理过程 */
  reasoning?: string;
}

/**
 * 工具选择服务
 */
export class ToolSelectionService {
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
   * 选择合适的工具
   * @param query 用户查询
   * @param userId 用户 ID
   * @param kbIds 知识库 ID 列表
   * @returns 工具选择结果
   */
  async selectTools(
    query: string,
    userId: number,
    kbIds?: string[]
  ): Promise<ToolSelectionResult> {
    try {
      const systemPrompt = this.buildSystemPrompt(kbIds);

      const result = await generateText({
        model: this.openai(this.model),
        system: systemPrompt,
        prompt: query,
        tools: availableTools,
      });

      // 解析工具调用
      const toolCalls: ToolCallResult[] = [];
      const selectedTools: Set<ToolName> = new Set();

      if (result.toolCalls && result.toolCalls.length > 0) {
        for (const call of result.toolCalls) {
          const toolName = call.toolName as ToolName;
          selectedTools.add(toolName);

          // 注入 userId 到需要的工具
          const args = (call as any).args || {};
          if (toolName === 'recall_memory' || toolName === 'store_memory') {
            args.userId = userId;
          }
          if (toolName === 'doc_search' && kbIds) {
            args.kbIds = kbIds.map(id => parseInt(id));
          }

          toolCalls.push({
            tool: toolName,
            ...args,
          });
        }
      }

      return {
        needsTools: toolCalls.length > 0,
        selectedTools: Array.from(selectedTools),
        toolCalls,
        reasoning: result.text,
      };
    } catch (error) {
      console.error('[ToolSelection] Failed to select tools:', error);

      // 降级：默认使用文档搜索
      return {
        needsTools: true,
        selectedTools: ['doc_search'],
        toolCalls: [
          {
            tool: 'doc_search',
            query,
            kbIds: kbIds ? kbIds.map(id => parseInt(id)) : undefined,
            topK: 10,
          },
        ],
      };
    }
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(kbIds?: string[]): string {
    const hasKnowledgeBase = kbIds && kbIds.length > 0;

    return `你是一个智能助手，需要根据用户的问题选择合适的工具来获取信息。

可用工具：
1. doc_search - 在知识库中搜索文档${hasKnowledgeBase ? '（当前用户已选择知识库）' : ''}
2. web_search - 在互联网上搜索最新信息
3. recall_memory - 召回用户的历史记忆
4. store_memory - 存储重要信息到记忆

工具选择策略：
- 如果问题涉及特定领域知识、技术文档、产品说明，优先使用 doc_search
- 如果问题需要实时数据、新闻、最新动态，使用 web_search
- 如果问题涉及用户的历史对话、个人偏好，使用 recall_memory
- 如果用户明确表达了偏好、待办事项等需要记住的信息，使用 store_memory
- 可以同时使用多个工具，例如先搜索文档，再搜索网络补充最新信息
${hasKnowledgeBase ? '- 当前用户已选择知识库，优先使用 doc_search' : '- 如果没有选择知识库且问题不是通用知识，考虑使用 web_search'}

请根据用户的问题，选择最合适的工具组合。`;
  }

  /**
   * 判断是否需要 Web 搜索
   * 快速启发式判断，用于降级场景
   */
  static needsWebSearch(query: string, hasKnowledgeBase: boolean): boolean {
    if (hasKnowledgeBase) {
      return false; // 有知识库时不使用 Web 搜索
    }

    const webKeywords = [
      '最新', '今天', '现在', '新闻', '实时',
      '最近', '当前', '今年', '2024', '2025', '2026',
    ];

    return webKeywords.some(keyword => query.includes(keyword));
  }
}
