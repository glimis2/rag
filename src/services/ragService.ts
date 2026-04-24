import 'dotenv/config';
import { AppDataSource } from '../config/database';
import { Conversation } from '../entities/Conversation';
import { Message } from '../entities/Message';
import { initChatModel } from 'langchain';
import type SSE from 'sse-express';

// 新的检索链路
import { VectorRetriever } from './rag/vectorRetriever';
import { BM25Retriever } from './rag/bm25Retriever';
import { WebRetriever } from './rag/webRetriever';
import { RRFFusionService } from './rag/fusionService';
import { CohereRerankerService } from './rag/rerankerService';
import { SimpleContextCompressor } from './rag/contextCompressor';
import { RetrievedChunk } from './rag/types';

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
}

interface SourceInfo {
  name: string;
  chapter: string;
  pageNumber: number;
  category: string;
  content?: string;
}

/**
 * 执行 RAG 流程（第一阶段：核心检索链路）
 * - 创建或获取会话
 * - 保存用户消息
 * - 多路检索（向量 + BM25 + Web）
 * - RRF 融合
 * - 重排序
 * - 上下文压缩
 * - 流式生成回复
 * - 保存助手回复
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

    // 3. 初始化模型
    const model = await initChatModel('deepseek-chat', {
      modelProvider: 'openai',
      configuration: {
        baseURL: 'https://api.deepseek.com/v1',
      },
      apiKey: process.env.DEEPSEEK_API_KEY,
      temperature: 0.3,
    });

    // 4. 初始化检索器
    const vectorRetriever = new VectorRetriever();
    const bm25Retriever = new BM25Retriever();
    const webRetriever = new WebRetriever();

    // 5. 并行多路检索
    sse.send({ message: '正在检索相关文档...' }, 'thought');

    const knowledgeBaseIds = kbIds ? kbIds.map(id => parseInt(id)) : [];

    const [vectorResults, bm25Results, webResults] = await Promise.allSettled([
      vectorRetriever.retrieve(question, { topK: 20, knowledgeBaseIds }),
      bm25Retriever.retrieve(question, { topK: 20, knowledgeBaseIds }),
      kbIds && kbIds.length > 0 ? Promise.resolve([]) : webRetriever.retrieve(question, { topK: 5 }),
    ]);

    const vectorChunks = vectorResults.status === 'fulfilled' ? vectorResults.value : [];
    const bm25Chunks = bm25Results.status === 'fulfilled' ? bm25Results.value : [];
    const webChunks = webResults.status === 'fulfilled' ? webResults.value : [];

    retrievalLog.vectorCount = vectorChunks.length;
    retrievalLog.bm25Count = bm25Chunks.length;
    retrievalLog.webCount = webChunks.length;

    // 记录使用的工具
    if (vectorChunks.length > 0) retrievalLog.toolsUsed.push('vector_search');
    if (bm25Chunks.length > 0) retrievalLog.toolsUsed.push('bm25_search');
    if (webChunks.length > 0) retrievalLog.toolsUsed.push('web_search');

    // 6. RRF 融合
    const fusionService = new RRFFusionService();
    const allResults = [vectorChunks, bm25Chunks, webChunks].filter(r => r.length > 0);

    let fusedChunks: RetrievedChunk[] = [];
    if (allResults.length > 0) {
      fusedChunks = fusionService.fuse(allResults, 50);
      retrievalLog.fusedCount = fusedChunks.length;
    }

    sse.send(
      {
        totalCount: fusedChunks.length,
        tools: retrievalLog.toolsUsed,
        mode: kbIds && kbIds.length > 0 ? 'selected_document' : 'hybrid',
      },
      'retrieval'
    );

    // 7. 重排序
    if (fusedChunks.length > 0) {
      sse.send({ message: '正在重排序结果...' }, 'thought');

      const rerankerService = new CohereRerankerService();
      const rerankedChunks = await rerankerService.rerank(question, fusedChunks, 20);
      retrievalLog.rerankedCount = rerankedChunks.length;

      // 8. 上下文压缩
      const compressor = new SimpleContextCompressor(4000, 1000);
      const compressedChunks = compressor.compress(rerankedChunks);
      retrievalLog.compressedCount = compressedChunks.length;

      // 9. 处理检索结果
      if (compressedChunks.length > 0) {
        // 发送检索到的文档源
        const sources: SourceInfo[] = compressedChunks.map((chunk) => ({
          name: chunk.metadata?.source || chunk.source,
          chapter: chunk.metadata?.chapter || '',
          pageNumber: chunk.metadata?.page || 0,
          category: chunk.metadata?.category || '',
          content: chunk.content,
        }));

        // 10. 构建提示词
        const context = compressedChunks.map((chunk) => chunk.content).join('\n\n');

        // 11. 开始生成
        sse.send({ message: '开始生成回答...' }, 'start');

        const prompt = `你是一个专业的AI助手。请根据提供的上下文信息准确回答用户的问题。如果上下文中没有相关信息，请明确说明。

上下文信息：
${context}

用户问题：${question}`;

        // 12. 流式生成回复
        const stream = await model.stream(prompt);

        for await (const chunk of stream) {
          const content = chunk.content as string;
          if (content) {
            fullResponse += content;
            sse.send({ content }, 'token');
          }
        }

        // 13. 保存助手回复
        const assistantMessage = messageRepository.create({
          conversation_id: conversation.id,
          role: 'assistant',
          content: fullResponse,
        });
        await messageRepository.save(assistantMessage);

        // 14. 发送完成事件
        const responseTime = Date.now() - startTime;
        sse.send(
          {
            sources,
            isFallback: false,
            isEmergency: false,
            responseTime,
            conversationId: conversation.id,
            retrievalLog,
          },
          'done'
        );
      } else {
        // 降级：无有效检索结果
        await handleFallback(conversation, question, model, sse, startTime, retrievalLog);
      }
    } else {
      // 降级：无检索结果
      await handleFallback(conversation, question, model, sse, startTime, retrievalLog);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sse.send({ message: errorMessage }, 'error');
    throw error;
  }
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
  retrievalLog: RetrievalLog
): Promise<void> {
  let fullResponse = '';

  sse.send({ message: '未找到相关文档，使用通用知识回答...' }, 'start');

  const prompt = `你是一个友好、专业的AI助手。请用简洁、准确的语言回答用户的问题。

用户问题：${question}`;

  const stream = await model.stream(prompt);

  for await (const chunk of stream) {
    const content = chunk.content as string;
    if (content) {
      fullResponse += content;
      sse.send({ content }, 'token');
    }
  }

  const assistantMessage = messageRepository.create({
    conversation_id: conversation.id,
    role: 'assistant',
    content: fullResponse,
  });
  await messageRepository.save(assistantMessage);

  const responseTime = Date.now() - startTime;
  sse.send(
    {
      sources: [],
      isFallback: true,
      isEmergency: false,
      responseTime,
      conversationId: conversation.id,
      retrievalLog,
    },
    'done'
  );
}
