import { Router } from 'express';
import { KnowledgeController } from '../controllers/knowledge.controller';
import { authMiddleware } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';
import { upload } from '../middleware/upload';

const router = Router();
const knowledgeController = new KnowledgeController();

router.post('/upload', authMiddleware, adminMiddleware, upload.single('file'), knowledgeController.upload);
router.get('/list', authMiddleware, knowledgeController.list);
router.get('/categories', authMiddleware, knowledgeController.getCategories);
router.get('/:id', authMiddleware, knowledgeController.getDetail);
router.put('/:id', authMiddleware, adminMiddleware, knowledgeController.update);
router.delete('/:id', authMiddleware, adminMiddleware, knowledgeController.delete);
router.post('/:id/reprocess', authMiddleware, adminMiddleware, knowledgeController.reprocess);

export default router;
