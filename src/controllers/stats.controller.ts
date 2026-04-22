import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppDataSource } from '../config/database';
import { Message } from '../entities/Message';
import { KnowledgeBase } from '../entities/KnowledgeBase';
import { User } from '../entities/User';
import { Conversation } from '../entities/Conversation';

export class StatsController {
  private messageRepository = AppDataSource.getRepository(Message);
  private kbRepository = AppDataSource.getRepository(KnowledgeBase);
  private userRepository = AppDataSource.getRepository(User);
  private conversationRepository = AppDataSource.getRepository(Conversation);

  getOverview = async (req: AuthRequest, res: Response) => {
    try {
      const totalQuestions = await this.messageRepository.count({ where: { role: 'user' } });
      const totalKb = await this.kbRepository.count({ where: { deleted: 0 } });
      const totalUsers = await this.userRepository.count({ where: { deleted: 0 } });
      const totalConversations = await this.conversationRepository.count({ where: { deleted: 0 } });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayQuestions = await this.messageRepository
        .createQueryBuilder('message')
        .where('message.role = :role', { role: 'user' })
        .andWhere('message.create_time >= :today', { today })
        .getCount();

      res.json({
        code: 200,
        message: 'success',
        data: { totalQuestions, totalKb, totalUsers, totalConversations, todayQuestions }
      });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Query failed', data: null });
    }
  };

  getTrend = async (req: AuthRequest, res: Response) => {
    try {
      const { days = 7 } = req.query;
      const daysNum = Math.min(Math.max(Number(days), 1), 90);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysNum);

      const messages = await this.messageRepository
        .createQueryBuilder('message')
        .select('DATE(message.create_time)', 'date')
        .addSelect('COUNT(*)', 'count')
        .where('message.role = :role', { role: 'user' })
        .andWhere('message.create_time >= :startDate', { startDate })
        .groupBy('DATE(message.create_time)')
        .orderBy('date', 'ASC')
        .getRawMany();

      res.json({ code: 200, message: 'success', data: messages });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Query failed', data: null });
    }
  };

  getToolDistribution = async (req: AuthRequest, res: Response) => {
    try {
      // TODO: Implement tool distribution stats
      res.json({ code: 200, message: 'success', data: [] });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Query failed', data: null });
    }
  };

  getHotKb = async (req: AuthRequest, res: Response) => {
    try {
      // TODO: Implement hot knowledge base ranking
      res.json({ code: 200, message: 'success', data: [] });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Query failed', data: null });
    }
  };

  getResponseTime = async (req: AuthRequest, res: Response) => {
    try {
      const stats = await this.messageRepository
        .createQueryBuilder('message')
        .select('AVG(message.response_time)', 'avgResponseTimeMs')
        .addSelect('MIN(message.response_time)', 'minResponseTimeMs')
        .addSelect('MAX(message.response_time)', 'maxResponseTimeMs')
        .addSelect('COUNT(*)', 'sampleCount')
        .where('message.role = :role', { role: 'assistant' })
        .andWhere('message.response_time IS NOT NULL')
        .getRawOne();

      res.json({
        code: 200,
        message: 'success',
        data: {
          avgResponseTimeMs: Math.round(stats.avgResponseTimeMs || 0),
          minResponseTimeMs: stats.minResponseTimeMs || 0,
          maxResponseTimeMs: stats.maxResponseTimeMs || 0,
          sampleCount: stats.sampleCount || 0,
          dailyTrend: []
        }
      });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Query failed', data: null });
    }
  };
}
