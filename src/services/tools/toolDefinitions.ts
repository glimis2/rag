/**
 * RAG Agent 工具定义
 *
 * 使用 Vercel AI SDK 的 tool calling 功能
 */

import { tool } from 'ai';
import { z } from 'zod';

/**
 * 文档搜索工具
 * 在知识库中搜索相关文档
 */
export const docSearchTool = tool({
  description: '在知识库中搜索相关文档。适用于需要查找特定领域知识、技术文档、产品说明等场景。',
  parameters: z.object({
    query: z.string().describe('搜索查询，应该是清晰的关键词或问题'),
    kbIds: z.array(z.number()).optional().describe('限定搜索的知识库 ID 列表，不指定则搜索所有知识库'),
    topK: z.number().min(1).max(20).default(10).describe('返回的文档数量，默认 10'),
  }),
});

/**
 * Web 搜索工具
 * 在互联网上搜索最新信息
 */
export const webSearchTool = tool({
  description: '在互联网上搜索最新信息。适用于需要实时数据、新闻、最新技术动态等场景。',
  parameters: z.object({
    query: z.string().describe('搜索查询，应该是清晰的关键词或问题'),
    maxResults: z.number().min(1).max(10).default(5).describe('返回的搜索结果数量，默认 5'),
  }),
});

/**
 * 记忆召回工具
 * 从用户的历史对话中召回相关记忆
 */
export const recallMemoryTool = tool({
  description: '从用户的历史对话中召回相关记忆。适用于需要上下文连续性、个性化回答的场景。',
  parameters: z.object({
    userId: z.number().describe('用户 ID'),
    topic: z.string().optional().describe('记忆主题，用于过滤相关记忆'),
    limit: z.number().min(1).max(10).default(5).describe('返回的记忆数量，默认 5'),
  }),
});

/**
 * 记忆存储工具
 * 将重要信息存储到用户记忆中
 */
export const storeMemoryTool = tool({
  description: '将重要信息存储到用户记忆中。适用于用户明确表达的偏好、重要事实、待办事项等。',
  parameters: z.object({
    userId: z.number().describe('用户 ID'),
    topic: z.string().describe('记忆主题，用于分类和检索'),
    content: z.string().describe('记忆内容，应该是结构化的、清晰的信息'),
    importance: z.enum(['low', 'medium', 'high']).default('medium').describe('重要性级别'),
  }),
});

/**
 * 所有可用工具
 */
export const availableTools = {
  doc_search: docSearchTool,
  web_search: webSearchTool,
  recall_memory: recallMemoryTool,
  store_memory: storeMemoryTool,
};

/**
 * 工具名称类型
 */
export type ToolName = keyof typeof availableTools;

/**
 * 工具调用结果
 */
export interface ToolCallResult {
  tool: ToolName;
  [key: string]: any;
}
