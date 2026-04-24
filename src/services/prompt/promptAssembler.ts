/**
 * Prompt 组装器
 *
 * 组装系统提示词，整合记忆上下文和检索结果
 */

import { RetrievedChunk } from '../rag/types';
import { MemoryEntry } from '../memory/memoryService';

/**
 * Prompt 组装选项
 */
export interface PromptAssemblerOptions {
  /** 是否包含记忆上下文 */
  includeMemory?: boolean;

  /** 是否包含检索结果 */
  includeContext?: boolean;

  /** 最大上下文长度（字符数） */
  maxContextLength?: number;

  /** 系统角色描述 */
  systemRole?: string;
}

/**
 * 组装后的 Prompt
 */
export interface AssembledPrompt {
  /** 系统提示词 */
  systemPrompt: string;

  /** 用户消息（包含上下文） */
  userMessage: string;

  /** 使用的记忆数量 */
  memoryCount: number;

  /** 使用的文档块数量 */
  chunkCount: number;
}

/**
 * Prompt 组装器
 */
export class PromptAssembler {
  private readonly defaultSystemRole = `你是一个专业的 AI 助手，基于提供的知识库回答用户问题。

核心原则：
1. 优先使用检索到的知识库内容回答问题
2. 如果知识库中没有相关信息，基于通用知识回答，并明确说明
3. 保持回答准确、完整、易懂
4. 如果不确定，诚实地表达不确定性
5. 尊重用户的偏好和记忆`;

  /**
   * 组装完整的 Prompt
   * @param question 用户问题
   * @param chunks 检索到的文档块
   * @param memories 用户记忆
   * @param options 组装选项
   * @returns 组装后的 Prompt
   */
  assemble(
    question: string,
    chunks: RetrievedChunk[] = [],
    memories: MemoryEntry[] = [],
    options: PromptAssemblerOptions = {}
  ): AssembledPrompt {
    const {
      includeMemory = true,
      includeContext = true,
      maxContextLength = 8000,
      systemRole,
    } = options;

    // 1. 构建系统提示词
    const systemPrompt = this.buildSystemPrompt(
      systemRole || this.defaultSystemRole,
      memories,
      includeMemory
    );

    // 2. 构建用户消息（包含上下文）
    const userMessage = this.buildUserMessage(
      question,
      chunks,
      includeContext,
      maxContextLength
    );

    return {
      systemPrompt,
      userMessage,
      memoryCount: includeMemory ? memories.length : 0,
      chunkCount: includeContext ? chunks.length : 0,
    };
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(
    baseRole: string,
    memories: MemoryEntry[],
    includeMemory: boolean
  ): string {
    let prompt = baseRole;

    // 添加记忆上下文
    if (includeMemory && memories.length > 0) {
      prompt += '\n\n## 用户偏好和记忆\n';

      // 按重要性分组
      const highImportance = memories.filter((m) => m.importance === 'high');
      const mediumImportance = memories.filter((m) => m.importance === 'medium');
      const lowImportance = memories.filter((m) => m.importance === 'low');

      if (highImportance.length > 0) {
        prompt += '\n### 重要信息\n';
        highImportance.forEach((m) => {
          prompt += `- ${m.content}\n`;
        });
      }

      if (mediumImportance.length > 0) {
        prompt += '\n### 偏好设置\n';
        mediumImportance.forEach((m) => {
          prompt += `- ${m.content}\n`;
        });
      }

      if (lowImportance.length > 0) {
        prompt += '\n### 其他信息\n';
        lowImportance.forEach((m) => {
          prompt += `- ${m.content}\n`;
        });
      }
    }

    return prompt;
  }

  /**
   * 构建用户消息
   */
  private buildUserMessage(
    question: string,
    chunks: RetrievedChunk[],
    includeContext: boolean,
    maxContextLength: number
  ): string {
    if (!includeContext || chunks.length === 0) {
      return question;
    }

    // 构建上下文
    const context = this.buildContext(chunks, maxContextLength);

    return `## 知识库内容

${context}

## 用户问题

${question}

请基于上述知识库内容回答用户问题。如果知识库中没有相关信息，请基于通用知识回答，并明确说明。`;
  }

  /**
   * 构建上下文（处理长度限制）
   */
  private buildContext(
    chunks: RetrievedChunk[],
    maxLength: number
  ): string {
    let context = '';
    let currentLength = 0;

    // 按分数排序，优先使用高分文档
    const sortedChunks = [...chunks].sort((a, b) => b.score - a.score);

    for (const chunk of sortedChunks) {
      const chunkText = this.formatChunk(chunk);
      const chunkLength = chunkText.length;

      // 检查是否超过长度限制
      if (currentLength + chunkLength > maxLength) {
        // 如果还没有添加任何内容，至少添加第一个块的部分内容
        if (context === '') {
          const remainingLength = maxLength - currentLength;
          context += chunkText.substring(0, remainingLength) + '...\n\n';
        }
        break;
      }

      context += chunkText + '\n\n';
      currentLength += chunkLength + 2; // +2 for newlines
    }

    return context.trim();
  }

  /**
   * 格式化单个文档块
   */
  private formatChunk(chunk: RetrievedChunk): string {
    const metadata = chunk.metadata || {};
    const source = metadata.source || '未知来源';
    const title = metadata.title || '';

    let formatted = '';

    // 添加来源信息
    if (title) {
      formatted += `### ${title}\n`;
    }
    formatted += `**来源**: ${source}\n`;
    formatted += `**相关度**: ${(chunk.score * 100).toFixed(1)}%\n\n`;

    // 添加内容
    formatted += chunk.content;

    return formatted;
  }

  /**
   * 为流式响应组装 Prompt
   * （简化版本，不包含复杂的上下文处理）
   */
  assembleForStreaming(
    question: string,
    chunks: RetrievedChunk[] = [],
    memories: MemoryEntry[] = []
  ): AssembledPrompt {
    return this.assemble(question, chunks, memories, {
      includeMemory: true,
      includeContext: true,
      maxContextLength: 6000, // 流式模式使用较短的上下文
    });
  }

  /**
   * 为降级模式组装 Prompt
   * （不包含检索结果，仅使用通用知识）
   */
  assembleForFallback(
    question: string,
    memories: MemoryEntry[] = []
  ): AssembledPrompt {
    return this.assemble(question, [], memories, {
      includeMemory: true,
      includeContext: false,
      systemRole: `你是一个专业的 AI 助手。

当前处于降级模式，知识库检索结果不足。请基于通用知识回答用户问题，并明确说明这不是基于特定知识库的回答。

核心原则：
1. 诚实地说明当前没有足够的知识库信息
2. 基于通用知识提供有用的回答
3. 建议用户换一种方式提问或提供更多上下文
4. 尊重用户的偏好和记忆`,
    });
  }
}
