import { OllamaEmbeddings } from '@langchain/ollama';
import { ChatOllama } from '@langchain/ollama';
import { VectorStoreService } from './vectorStoreService';
import { ChunkRepository } from '../repositories/ChunkRepository';
import { AppDataSource } from '../config/database';
import { Conversation } from '../entities/Conversation';
import { Message } from '../entities/Message';
import { SSE } from 'sse-express';

export interface RagExecuteOptions {
  conversationId?: string;
  kbIds?: string[];
  sse: SSE;
  question: string;
  userId: number;
}

export class RagService {
  private vectorStoreService: VectorStoreService;
  private chunkRepository: ChunkRepository;
  private conversationRepository = AppDataSource.getRepository(Conversation);
  private messageRepository = AppDataSource.getRepository(Message);
  private embeddings: OllamaEmbeddings;
  private llm: ChatOllama;

  constructor() {
    this.vectorStoreService = new VectorStoreService();
    this.chunkRepository = new ChunkRepository(AppDataSource);

    this.embeddings = new OllamaEmbeddings({
      model: process.env.OLLAMA_EMBEDDING_MODEL || 'bge-m3',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    });

    this.llm = new ChatOllama({
      model: process.env.OLLAMA_CHAT_MODEL || 'qwen2.5:7b',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      temperature: 0.7,
    });
  }

  async execute(options: RagExecuteOptions): Promise<void> {
    const { conversationId, kbIds, sse, question, userId } = options;

    try {
      let conversation: Conversation;

      if (conversationId) {
        conversation = await this.conversationRepository.findOne({
          where: { id: parseInt(conversationId) },
        });
        if (!conversation) {
          throw new Error('Conversation not found');
        }
      } else {
        conversation = this.conversationRepository.create({
          user_id: userId,
          title: question.substring(0, 50),
        });
        await this.conversationRepository.save(conversation);

        sse.send({ conversationId: conversation.id }, 'conversation');
      }

      const userMessage = this.messageRepository.create({
        conversation_id: conversation.id,
        role: 'user',
        content: question,
      });
      await this.messageRepository.save(userMessage);

      let context = '';
      let sourceChunks: any[] = [];

      if (kbIds && kbIds.length > 0) {
        const relevantChunks = await this.vectorStoreService.searchVectors(
          question,
          kbIds,
          5
        );

        if (relevantChunks.length > 0) {
          sourceChunks = relevantChunks;
          context = relevantChunks
            .map((chunk, index) => `[${index + 1}] ${chunk.content}`)
            .join('\n\n');

          sse.send({ sources: sourceChunks }, 'sources');
        }
      }

      const prompt = context
        ? `基于以下上下文回答问题：

上下文：
${context}

问题：${question}

请根据上下文提供准确的回答。如果上下文中没有相关信息，请说明。`
        : question;

      const stream = await this.llm.stream(prompt);
      let fullResponse = '';

      for await (const chunk of stream) {
        const token = chunk.content.toString();
        fullResponse += token;
        sse.send({ token }, 'token');
      }

      const assistantMessage = this.messageRepository.create({
        conversation_id: conversation.id,
        role: 'assistant',
        content: fullResponse,
      });
      await this.messageRepository.save(assistantMessage);

      sse.send({ done: true }, 'done');
    } catch (error) {
      sse.send({ error: error.message }, 'error');
      throw error;
    }
  }
} 