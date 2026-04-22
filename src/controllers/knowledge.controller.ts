import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppDataSource } from '../config/database';
import { KnowledgeBase } from '../entities/KnowledgeBase';
import { Chunk } from '../entities/Chunk';
import path from 'path';
import {processDocument} from '../services/documentService'

export class KnowledgeController {
  private kbRepository = AppDataSource.getRepository(KnowledgeBase);
  private chunkRepository = AppDataSource.getRepository(Chunk);

  upload = async (req: AuthRequest, res: Response) => {
    try {
      const { category, description, name } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ code: 400, message: 'No file uploaded', data: null });
      }

      const fileExt = path.extname(file.originalname).toLowerCase().replace('.', '');

      const kb = this.kbRepository.create({
        name: name || file.originalname,
        category,
        description,
        file_url: file.path,
        file_type: fileExt,
        file_size: file.size,
        status: 'uploading',
        user_id: req.userId!
      });

      await this.kbRepository.save(kb);

      processDocument(kb,file) // 异步操作，无需等待

      // TODO: Trigger background processing
      res.json({ code: 200, message: '上传成功，正在后台处理...', data: kb.id });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Upload failed', data: null });
    }
  };

  list = async (req: AuthRequest, res: Response) => {
    try {
      const { current = 1, size = 10, category, status } = req.query;
      const skip = (Number(current) - 1) * Number(size);

      const queryBuilder = this.kbRepository.createQueryBuilder('kb')
        .where('kb.deleted = 0');

      if (category) {
        queryBuilder.andWhere('kb.category = :category', { category });
      }

      if (status) {
        queryBuilder.andWhere('kb.status = :status', { status });
      }

      const [records, total] = await queryBuilder
        .orderBy('kb.create_time', 'DESC')
        .skip(skip)
        .take(Number(size))
        .getManyAndCount();

      res.json({ code: 200, message: 'success', data: { records, total } });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Query failed', data: null });
    }
  };

  getDetail = async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const kb = await this.kbRepository.findOne({ where: { id: Number(id), deleted: 0 } });

      if (!kb) {
        return res.status(404).json({ code: 404, message: 'Knowledge base not found', data: null });
      }

      res.json({ code: 200, message: 'success', data: kb });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Query failed', data: null });
    }
  };

  update = async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, description, category } = req.body;

      await this.kbRepository.update({ id: Number(id) }, { name, description, category });
      res.json({ code: 200, message: 'success', data: null });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Update failed', data: null });
    }
  };

  delete = async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      await this.kbRepository.update({ id: Number(id) }, { deleted: 1 });
      res.json({ code: 200, message: 'success', data: null });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Delete failed', data: null });
    }
  };

  reprocess = async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      await this.kbRepository.update({ id: Number(id) }, { status: 'processing' });
      // TODO: Trigger reprocessing
      res.json({ code: 200, message: '已重新提交处理', data: null });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Reprocess failed', data: null });
    }
  };

  getCategories = async (req: AuthRequest, res: Response) => {
    try {
      const categories = await this.kbRepository
        .createQueryBuilder('kb')
        .select('DISTINCT kb.category', 'category')
        .where('kb.deleted = 0 AND kb.category IS NOT NULL')
        .getRawMany();

      const categoryList = categories.map(c => c.category);
      res.json({ code: 200, message: 'success', data: categoryList });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Query failed', data: null });
    }
  };
}
