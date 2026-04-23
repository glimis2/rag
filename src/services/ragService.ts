import 'dotenv/config';
import { AppDataSource } from '../config/database';
import { Conversation } from '../entities/Conversation';
import { Message } from '../entities/Message';
import { createRetriever } from '../retrieval/customerRetrieval';
import { initChatModel } from 'langchain';
import type SSE from 'sse-express';

const conversationRepository = AppDataSource.getRepository(Conversation);
const messageRepository = AppDataSource.getRepository(Message);

interface RetrievalLog {
  originalQuery: string;
  rewrittenQuery?: string;
  vectorCount: number;
  bm25Count?: number;
  fusedCount?: number;
  rerankedCount: number;
}

interface SourceInfo {
  name: string;
  chapter: string;
  pageNumber: number;
  category: string;
  content?: string;
}

/**
 * 执行 RAG 流程
 * - 创建或获取会话
 * - 保存用户消息
 * - 查询改写（可选）
 * - 向量检索与上下文压缩
 * - 流式生成回复
 * - 保存助手回复
 * 
 * 此处实际上走的就是一个流水线
 */
export async function execute(
  conversationId: string | undefined,
  kbIds: string[] | undefined,
  sse: SSE,
  question: string,
  userId: number
): Promise<void> {
  let conversation: Conversation;
  let fullResponse = '';
  const startTime = Date.now();
  const retrievalLog: RetrievalLog = {
    originalQuery: question,
    vectorCount: 0,
    rerankedCount: 0,
  };

  try {
    // 1. 创建或获取会话
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
    // ---------------------- 下面开始 走计算
    // 3. 初始化模型
    const model = await initChatModel('deepseek-chat', {
      modelProvider: 'openai',
      configuration: {
        baseURL: 'https://api.deepseek.com/v1',
      },
      apiKey: process.env.DEEPSEEK_API_KEY,
      temperature: 0.3,
    });

    // 4. 创建检索器
    const retriever = await createRetriever(sse, kbIds);

    // 5. 检索相关文档（已包含向量检索 + BM25重排序）
    const docs = await retriever.invoke(question);
    retrievalLog.vectorCount = docs.length;
    retrievalLog.rerankedCount = docs.length;

    sse.send(
      {
        totalCount: docs.length,
        tools: ['doc_search'],
        mode: 'selected_document',
      },
      'retrieval'
    );

    // sse.send(
    //   {
    //     topK: docs.length,
    //     reranked: docs.length,
    //   },
    //   'rerank'
    // );

    // 6. 处理检索结果
    if (docs.length > 0) {
      // 发送检索到的文档源
      const sources: SourceInfo[] = docs.map((doc) => ({
        name: doc.metadata.source || 'Unknown',
        chapter: doc.metadata.chapter || '',
        pageNumber: doc.metadata.page || 0,
        category: doc.metadata.category || '',
        content: doc.pageContent,
      }));

      // 7. 构建提示词
      const context = docs.map((doc) => doc.pageContent).join('\n\n');

      // 8. 开始生成
      sse.send({ message: '开始生成...' }, 'start');

      const prompt = `你是一个专业的AI助手。请根据提供的上下文信息准确回答用户的问题。如果上下文中没有相关信息，请明确说明。

上下文信息：
${context}

用户问题：${question}`;

      // 9. 流式生成回复
      const stream = await model.stream(prompt);

      for await (const chunk of stream) {
        const content = chunk.content as string;
        if (content) {
          fullResponse += content;
          sse.send({ content }, 'token');
        }
      }

      // 10. 保存助手回复
      const assistantMessage = messageRepository.create({
        conversation_id: conversation.id,
        role: 'assistant',
        content: fullResponse,
      });
      await messageRepository.save(assistantMessage);

      // 11. 发送完成事件
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
      // 无检索结果，直接对话
      sse.send({ message: '开始生成...' }, 'start');

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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sse.send({ message: errorMessage }, 'error');
    throw error;
  }
}
