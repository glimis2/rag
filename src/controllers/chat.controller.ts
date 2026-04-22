import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppDataSource } from '../config/database';
import { Conversation } from '../entities/Conversation';
import { Message } from '../entities/Message';
import { SSE } from 'sse-express';
import { RagService } from '../services/ragService';

export class ChatController {
  private conversationRepository = AppDataSource.getRepository(Conversation);
  private messageRepository = AppDataSource.getRepository(Message);
  private ragService = new RagService();

  /**
   * 创建好 sse后，调用ragService.execute 方法
   * @param req
   * @param res
   */
  stream = async (req: AuthRequest, res: Response) => {
    try {
      const { conversationId, message, kbIds } = req.query;

      if (!message) {
        return res.status(400).json({ code: 400, message: 'Message is required', data: null });
      }

      const sse = new SSE(res);

      const kbIdArray = kbIds ? (Array.isArray(kbIds) ? kbIds : [kbIds]) : [];

      await this.ragService.execute({
        conversationId: conversationId as string,
        kbIds: kbIdArray as string[],
        sse,
        question: message as string,
        userId: req.userId!,
      });

      sse.close();
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Stream failed', data: null });
    }
  };

  getConversations = async (req: AuthRequest, res: Response) => {
    try {
      const { current = 1, size = 20 } = req.query;
      const skip = (Number(current) - 1) * Number(size);

      const [records, total] = await this.conversationRepository.findAndCount({
        where: { user_id: req.userId!, deleted: 0 },
        order: { last_active: 'DESC' },
        skip,
        take: Number(size)
      });

      res.json({ code: 200, message: 'success', data: { records, total } });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Query failed', data: null });
    }
  };

  getHistory = async (req: AuthRequest, res: Response) => {
    try {
      const { conversationId } = req.params;
      const { current = 1, size = 50 } = req.query;
      const skip = (Number(current) - 1) * Number(size);

      const [records, total] = await this.messageRepository.findAndCount({
        where: { conversation_id: Number(conversationId) },
        order: { create_time: 'ASC' },
        skip,
        take: Number(size)
      });

      res.json({ code: 200, message: 'success', data: { records, total } });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Query failed', data: null });
    }
  };

  deleteConversation = async (req: AuthRequest, res: Response) => {
    try {
      const { conversationId } = req.params;
      await this.conversationRepository.update(
        { id: Number(conversationId), user_id: req.userId! },
        { deleted: 1 }
      );
      res.json({ code: 200, message: 'success', data: null });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Delete failed', data: null });
    }
  };

  submitFeedback = async (req: AuthRequest, res: Response) => {
    try {
      const { messageId, rating } = req.body;
      await this.messageRepository.update({ id: messageId }, { feedback: rating });
      res.json({ code: 200, message: 'success', data: null });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Feedback failed', data: null });
    }
  };

  exportConversation = async (req: AuthRequest, res: Response) => {
    try {
      const { conversationId } = req.params;
      // TODO: Implement markdown export
      res.json({ code: 200, message: 'Export not implemented', data: null });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Export failed', data: null });
    }
  };

  getAgentTrace = async (req: AuthRequest, res: Response) => {
    try {
      const { messageId } = req.params;
      const message = await this.messageRepository.findOne({ where: { id: Number(messageId) } });
      res.json({ code: 200, message: 'success', data: message?.agent_trace || [] });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Query failed', data: null });
    }
  };
}
