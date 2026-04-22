import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppDataSource } from '../config/database';
import { AiConfig } from '../entities/AiConfig';

export class AiConfigController {
  private configRepository = AppDataSource.getRepository(AiConfig);

  list = async (req: AuthRequest, res: Response) => {
    try {
      const configs = await this.configRepository.find({ where: { deleted: 0 } });

      const grouped = configs.reduce((acc: any, config) => {
        if (!acc[config.group_name]) {
          acc[config.group_name] = [];
        }
        acc[config.group_name].push(config);
        return acc;
      }, {});

      res.json({ code: 200, message: 'success', data: grouped });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Query failed', data: null });
    }
  };

  batchUpdate = async (req: AuthRequest, res: Response) => {
    try {
      const updates = req.body;

      for (const [key, value] of Object.entries(updates)) {
        await this.configRepository.update({ config_key: key }, { config_value: String(value) });
      }

      res.json({ code: 200, message: 'success', data: null });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Update failed', data: null });
    }
  };

  resetGroup = async (req: AuthRequest, res: Response) => {
    try {
      const { groupName } = req.params;

      await this.configRepository
        .createQueryBuilder()
        .update(AiConfig)
        .set({ config_value: () => 'default_value' })
        .where('group_name = :groupName', { groupName })
        .execute();

      res.json({ code: 200, message: 'success', data: null });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Reset failed', data: null });
    }
  };

  resetAll = async (req: AuthRequest, res: Response) => {
    try {
      await this.configRepository
        .createQueryBuilder()
        .update(AiConfig)
        .set({ config_value: () => 'default_value' })
        .execute();

      res.json({ code: 200, message: 'success', data: null });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Reset failed', data: null });
    }
  };

  getModels = async (req: AuthRequest, res: Response) => {
    try {
      const models = ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-max-longcontext'];
      res.json({ code: 200, message: 'success', data: models });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Query failed', data: null });
    }
  };
}
