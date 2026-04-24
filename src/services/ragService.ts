import 'dotenv/config';
import { AppDataSource } from '../config/database';
import { Conversation } from '../entities/Conversation';
import { Message } from '../entities/Message';
import { initChatModel } from 'langchain';
import type SSE from 'sse-express';

// 第一阶段：检索链路
import { VectorRetriever } from './rag/vectorRetriever';
import { BM25Retriever } from './rag/bm25Retriever';
import { WebRetriever } from './rag/webRetriever';
import { RRFFusionService } from './rag/fusionService';
import { CohereRerankerService } from './rag/rerankerService';
import { SimpleContextCompressor } from './rag/contextCompressor';
import { RetrievedChunk } from './rag/types';

// 第二阶段：缓存、工具选择、记忆
import { RagCacheService, CachedResult } from './cache/ragCacheService';
import { ToolSelectionService } from './tools/toolSelectionService';
import { MemoryService } from './memory/memoryService';
import { MemoryExtractor } from './memory/memoryExtractor';

// 第三阶段：反思、安全、提示词组装
import { SelfReflectionService } from './reflection/selfReflectionService';
import { SafetyGuard } from './safety/safetyGuard';
import { PromptAssembler } from './prompt/promptAssembler';

const conversationRepository = AppDataSource.getRepository(Conversation);
const messageRepository = AppDataSource.getRepository(Message);

interface RetrievalLog {
  originalQuery: string;
  rewrittenQuery?: string;
  vectorCount: number;
  bm25Count?: number;
  webCount?: number;
  fusedCount?: number;
  rerankedCount: number;
  compressedCount?: number;
  toolsUsed: string[];
  reflectionRounds?: number;
  confidence?: number;
}

interface SourceInfo {
  name: string;
  chapter: string;
  pageNumber: number;
  category: string;
  content?: string;
}

/**
 * 执行 RAG 流程（第二阶段：智能化增强）
 * - 创建或获取会话
 * - 保存用户消息
 * - 检查缓存（频次驱动）
 * - LLM 工具选择
 * - 多路检索（向量 + BM25 + Web）
 * - RRF 融合
 * - 重排序
 * - 上下文压缩
 * - 记忆召回和合并
 * - 流式生成回复
 * - 保存助手回复
 * - 写入缓存
 */
export async function execute(
  conversationId: string | undefined,
  kbIds: string[] | undefined,
  sse: SSE,
  question: string,
  userId: number
): Promise<void> {
  let fullResponse = '';
  const startTime = Date.now();
  const retrievalLog: RetrievalLog = {
    originalQuery: question,
    vectorCount: 0,
    rerankedCount: 0,
    toolsUsed: [],
  };

  // 初始化服务
  const cacheService = new RagCacheService();
  const toolSelectionService = new ToolSelectionService();
  const memoryService = new MemoryService();
  const memoryExtractor = new MemoryExtractor();
  const reflectionService = new SelfReflectionService();
  const safetyGuard = new SafetyGuard();
  const promptAssembler = new PromptAssembler();

  try {
    // 1. 创建或获取会话
    let conversation: Conversation | null;
    if (conversationId) {
      conversation = await conversationRepository.findOne({
        where: { id: parseInt(conversationId) },
      });
      if (!conversation) {
        throw new Error('Conversation not found');
      }
    } else {
      conversation = conversationRepository.create({
        user_id: userId,
        title: question.substring(0, 50),
      });
      await conversationRepository.save(conversation);
      sse.send({ conversationId: conversation.id }, 'conversation');
    }

    // 2. 保存用户消息
    const userMessage = messageRepository.create({
      conversation_id: conversation.id,
      role: 'user',
      content: question,
    });
    await messageRepository.save(userMessage);

    // 3. 查询归一化和频次统计
    const normalizedQuery = cacheService.normalize(question);
    const frequency = await cacheService.incrementFrequency(normalizedQuery);

    sse.send(
      { message: `查询频次: ${frequency}`, frequency },
      'thought'
    );

    // 4. 检查缓存
    const cached = await cacheService.getCache(normalizedQuery);
    if (cached) {
      sse.send({ message: '命中缓存，正在回放...' }, 'thought');

      // 流式回放缓存内容
      await replayCachedResponse(
        conversation,
        cached,
        sse,
        startTime
      );
      return;
    }

    // 5. LLM 工具选择（暂时禁用，使用默认策略）
    sse.send({ message: '正在分析问题...' }, 'thought');

    // 默认策略：如果有知识库则使用文档搜索，否则使用 Web 搜索
    const useWebSearch = !kbIds || kbIds.length === 0;

    const toolSelection = {
      needsTools: true,
      selectedTools: useWebSearch ? ['web_search'] : ['doc_search'],
      toolCalls: useWebSearch
        ? [{ tool: 'web_search', query: question, maxResults: 5 }]
        : [{ tool: 'doc_search', query: question, topK: 20, kbIds: kbIds?.map(id => parseInt(id)) }],
    };

    // 6. 根据工具选择执行检索
    let compressedChunks: RetrievedChunk[] = [];
    let sources: SourceInfo[] = [];

    if (toolSelection.needsTools) {
      const result = await executeToolCalls(
        toolSelection.toolCalls,
        question,
        kbIds,
        userId,
        sse,
        retrievalLog,
        memoryService
      );

      compressedChunks = result.chunks;
      sources = result.sources;
    }

    // 7. 安全检查
    const safetyCheck = safetyGuard.check(question, compressedChunks);

    if (safetyCheck.isEmergency) {
      sse.send(
        { message: '检测到紧急情况关键词', isEmergency: true },
        'thought'
      );
    }

    // 8. 召回记忆并合并到上下文
    const memories = await memoryService.recallMemory(userId, undefined, 3);
    if (memories.length > 0) {
      sse.send(
        { message: `召回 ${memories.length} 条相关记忆` },
        'thought'
      );
      retrievalLog.toolsUsed.push('recall_memory');
    }

    // 9. 初始化模型
    const model = await initChatModel('deepseek-chat', {
      modelProvider: 'openai',
      configuration: {
        baseURL: 'https://api.deepseek.com/v1',
      },
      apiKey: process.env.DEEPSEEK_API_KEY,
      temperature: 0.3,
    });

    // 10. 生成回复
    if (compressedChunks.length > 0 || memories.length > 0) {
      // 使用 PromptAssembler 组装提示词
      const assembled = safetyCheck.needsFallback
        ? promptAssembler.assembleForFallback(question, memories)
        : promptAssembler.assembleForStreaming(question, compressedChunks, memories);

      sse.send({ message: '开始生成回答...' }, 'start');

      // 添加紧急情况提示
      if (safetyCheck.isEmergency) {
        const emergencyNotice = safetyGuard.getEmergencyNotice();
        fullResponse += emergencyNotice;
        sse.send({ content: emergencyNotice }, 'token');
      }

      // 添加降级提示
      if (safetyCheck.needsFallback) {
        const fallbackNotice = safetyGuard.getFallbackNotice(safetyCheck.fallbackReason);
        fullResponse += fallbackNotice + '\n\n';
        sse.send({ content: fallbackNotice + '\n\n' }, 'token');
      }

      const prompt = `${assembled.systemPrompt}

${assembled.userMessage}`;

      const stream = await model.stream(prompt);

      for await (const chunk of stream) {
        const content = chunk.content as string;
        if (content) {
          fullResponse += content;
          sse.send({ content }, 'token');
        }
      }

      // 11. Self-Reflection（流式模式，仅评估不重新生成）
      sse.send({ message: '正在评估答案质量...' }, 'thought');

      const reflectionResult = await reflectionService.reflect(
        question,
        fullResponse,
        compressedChunks,
        true // 流式模式
      );

      retrievalLog.reflectionRounds = reflectionResult.reflectionRounds;
      retrievalLog.confidence = reflectionResult.evaluation.confidence;

      // 如果反思后添加了提示，更新完整回复
      if (reflectionResult.answer !== fullResponse) {
        const additionalContent = reflectionResult.answer.substring(fullResponse.length);
        fullResponse = reflectionResult.answer;
        sse.send({ content: additionalContent }, 'token');
      }

      // 12. 提取并存储记忆
      const extractedMemories = await memoryExtractor.extract(question, fullResponse);
      for (const memory of extractedMemories) {
        await memoryService.storeMemory(
          userId,
          memory.topic,
          memory.content,
          memory.importance
        );
      }
      if (extractedMemories.length > 0) {
        sse.send(
          { message: `已存储 ${extractedMemories.length} 条新记忆` },
          'thought'
        );
      }

      // 13. 保存助手回复
      const assistantMessage = messageRepository.create({
        conversation_id: conversation.id,
        role: 'assistant',
        content: fullResponse,
      });
      await messageRepository.save(assistantMessage);

      // 14. 写入缓存（频次驱动）
      const cachedResult: CachedResult = {
        answer: fullResponse,
        sources,
        retrievalLog,
        timestamp: Date.now(),
        isFallback: safetyCheck.needsFallback,
      };
      await cacheService.putCache(normalizedQuery, cachedResult, frequency);

      // 15. 发送完成事件
      const responseTime = Date.now() - startTime;
      sse.send(
        {
          sources,
          isFallback: safetyCheck.needsFallback,
          isEmergency: safetyCheck.isEmergency,
          responseTime,
          conversationId: conversation.id,
          retrievalLog,
        },
        'done'
      );
    } else {
      // 降级：无检索结果
      await handleFallback(
        conversation,
        question,
        model,
        sse,
        startTime,
        retrievalLog,
        cacheService,
        normalizedQuery,
        frequency,
        memoryService,
        memoryExtractor,
        reflectionService,
        safetyGuard,
        promptAssembler,
        userId
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sse.send({ message: errorMessage }, 'error');
    throw error;
  }
}

/**
 * 执行工具调用
 */
async function executeToolCalls(
  toolCalls: any[],
  question: string,
  kbIds: string[] | undefined,
  userId: number,
  sse: SSE,
  retrievalLog: RetrievalLog,
  memoryService: MemoryService
): Promise<{ chunks: RetrievedChunk[]; sources: SourceInfo[] }> {
  const vectorRetriever = new VectorRetriever();
  const bm25Retriever = new BM25Retriever();
  const webRetriever = new WebRetriever();
  const fusionService = new RRFFusionService();
  const rerankerService = new CohereRerankerService();
  const compressor = new SimpleContextCompressor(4000, 1000);

  const allChunks: RetrievedChunk[][] = [];

  for (const call of toolCalls) {
    if (call.tool === 'doc_search') {
      sse.send({ message: '正在搜索文档...' }, 'thought');

      const knowledgeBaseIds = call.kbIds || (kbIds ? kbIds.map((id: string) => parseInt(id)) : []);

      const [vectorResults, bm25Results] = await Promise.allSettled([
        vectorRetriever.retrieve(call.query || question, {
          topK: call.topK || 20,
          knowledgeBaseIds,
        }),
        bm25Retriever.retrieve(call.query || question, {
          topK: call.topK || 20,
          knowledgeBaseIds,
        }),
      ]);

      const vectorChunks = vectorResults.status === 'fulfilled' ? vectorResults.value : [];
      const bm25Chunks = bm25Results.status === 'fulfilled' ? bm25Results.value : [];

      retrievalLog.vectorCount = vectorChunks.length;
      retrievalLog.bm25Count = bm25Chunks.length;

      if (vectorChunks.length > 0) {
        allChunks.push(vectorChunks);
        retrievalLog.toolsUsed.push('vector_search');
      }
      if (bm25Chunks.length > 0) {
        allChunks.push(bm25Chunks);
        retrievalLog.toolsUsed.push('bm25_search');
      }
    } else if (call.tool === 'web_search') {
      sse.send({ message: '正在搜索网络...' }, 'thought');

      const webChunks = await webRetriever.retrieve(call.query || question, {
        topK: call.maxResults || 5,
      });

      retrievalLog.webCount = webChunks.length;

      if (webChunks.length > 0) {
        allChunks.push(webChunks);
        retrievalLog.toolsUsed.push('web_search');
      }
    } else if (call.tool === 'store_memory') {
      await memoryService.storeMemory(
        userId,
        call.topic,
        call.content,
        call.importance || 'medium'
      );
      sse.send({ message: `已存储记忆: ${call.topic}` }, 'thought');
    }
  }

  // 融合和重排序
  if (allChunks.length === 0) {
    return { chunks: [], sources: [] };
  }

  const fusedChunks = fusionService.fuse(allChunks, 50);
  retrievalLog.fusedCount = fusedChunks.length;

  sse.send(
    {
      totalCount: fusedChunks.length,
      tools: retrievalLog.toolsUsed,
      mode: kbIds && kbIds.length > 0 ? 'selected_document' : 'hybrid',
    },
    'retrieval'
  );

  if (fusedChunks.length > 0) {
    sse.send({ message: '正在重排序结果...' }, 'thought');

    const rerankedChunks = await rerankerService.rerank(question, fusedChunks, 20);
    retrievalLog.rerankedCount = rerankedChunks.length;

    const compressedChunks = compressor.compress(rerankedChunks);
    retrievalLog.compressedCount = compressedChunks.length;

    const sources: SourceInfo[] = compressedChunks.map((chunk) => ({
      name: chunk.metadata?.source || chunk.source,
      chapter: chunk.metadata?.chapter || '',
      pageNumber: chunk.metadata?.page || 0,
      category: chunk.metadata?.category || '',
      content: chunk.content,
    }));

    return { chunks: compressedChunks, sources };
  }

  return { chunks: [], sources: [] };
}

/**
 * 构建上下文（包含检索结果和记忆）
 */
function buildContext(chunks: RetrievedChunk[], memories: any[]): string {
  let context = '';

  if (chunks.length > 0) {
    context += '## 检索到的知识\n';
    context += chunks.map((chunk) => chunk.content).join('\n\n');
    context += '\n\n';
  }

  if (memories.length > 0) {
    context += '## 用户记忆\n';
    context += memories
      .map((m) => `- ${m.topic}: ${m.content}`)
      .join('\n');
    context += '\n\n';
  }

  return context;
}

/**
 * 流式回放缓存内容
 */
async function replayCachedResponse(
  conversation: Conversation,
  cached: CachedResult,
  sse: SSE,
  startTime: number
): Promise<void> {
  sse.send({ message: '从缓存加载...' }, 'start');

  // 模拟流式输出：每 30 字符一批
  const chunkSize = 30;
  for (let i = 0; i < cached.answer.length; i += chunkSize) {
    const chunk = cached.answer.slice(i, i + chunkSize);
    sse.send({ content: chunk }, 'token');
    // 添加小延迟模拟真实生成
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const responseTime = Date.now() - startTime;
  sse.send(
    {
      sources: cached.sources,
      isFallback: cached.isFallback,
      isEmergency: false,
      responseTime,
      conversationId: conversation.id,
      retrievalLog: cached.retrievalLog,
      cached: true,
    },
    'done'
  );
}

/**
 * 降级处理：直接对话模式
 */
async function handleFallback(
  conversation: Conversation,
  question: string,
  model: any,
  sse: SSE,
  startTime: number,
  retrievalLog: RetrievalLog,
  cacheService: RagCacheService,
  normalizedQuery: string,
  frequency: number,
  memoryService: MemoryService,
  memoryExtractor: MemoryExtractor,
  reflectionService: SelfReflectionService,
  safetyGuard: SafetyGuard,
  promptAssembler: PromptAssembler,
  userId: number
): Promise<void> {
  let fullResponse = '';

  // 安全检查
  const safetyCheck = safetyGuard.check(question, []);

  // 召回记忆
  const memories = await memoryService.recallMemory(userId, undefined, 3);

  sse.send({ message: '未找到相关文档，使用通用知识回答...' }, 'start');

  // 添加紧急情况提示
  if (safetyCheck.isEmergency) {
    const emergencyNotice = safetyGuard.getEmergencyNotice();
    fullResponse += emergencyNotice;
    sse.send({ content: emergencyNotice }, 'token');
  }

  // 添加降级提示
  const fallbackNotice = safetyGuard.getFallbackNotice('未检索到相关文档');
  fullResponse += fallbackNotice + '\n\n';
  sse.send({ content: fallbackNotice + '\n\n' }, 'token');

  // 使用 PromptAssembler 组装提示词
  const assembled = promptAssembler.assembleForFallback(question, memories);

  const prompt = `${assembled.systemPrompt}

${assembled.userMessage}`;

  const stream = await model.stream(prompt);

  for await (const chunk of stream) {
    const content = chunk.content as string;
    if (content) {
      fullResponse += content;
      sse.send({ content }, 'token');
    }
  }

  // Self-Reflection（流式模式）
  const reflectionResult = await reflectionService.reflect(
    question,
    fullResponse,
    [],
    true
  );

  retrievalLog.reflectionRounds = reflectionResult.reflectionRounds;
  retrievalLog.confidence = reflectionResult.evaluation.confidence;

  if (reflectionResult.answer !== fullResponse) {
    const additionalContent = reflectionResult.answer.substring(fullResponse.length);
    fullResponse = reflectionResult.answer;
    sse.send({ content: additionalContent }, 'token');
  }

  // 提取并存储记忆
  const extractedMemories = await memoryExtractor.extract(question, fullResponse);
  for (const memory of extractedMemories) {
    await memoryService.storeMemory(
      userId,
      memory.topic,
      memory.content,
      memory.importance
    );
  }

  const assistantMessage = messageRepository.create({
    conversation_id: conversation.id,
    role: 'assistant',
    content: fullResponse,
  });
  await messageRepository.save(assistantMessage);

  const responseTime = Date.now() - startTime;

  // 写入缓存
  const cachedResult: CachedResult = {
    answer: fullResponse,
    sources: [],
    retrievalLog,
    timestamp: Date.now(),
    isFallback: true,
  };
  await cacheService.putCache(normalizedQuery, cachedResult, frequency);

  sse.send(
    {
      sources: [],
      isFallback: true,
      isEmergency: safetyCheck.isEmergency,
      responseTime,
      conversationId: conversation.id,
      retrievalLog,
    },
    'done'
  );
}
