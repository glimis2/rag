import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authMiddleware } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';

const router = Router();
const userController = new UserController();

router.post('/register', userController.register);
router.post('/login', userController.login);
router.get('/info', authMiddleware, userController.getInfo);
router.put('/info', authMiddleware, userController.updateInfo);
router.put('/preference', authMiddleware, userController.updatePreference);
router.get('/list', authMiddleware, adminMiddleware, userController.list);
router.put('/:userId/status', authMiddleware, adminMiddleware, userController.updateStatus);
router.put('/:userId/role', authMiddleware, adminMiddleware, userController.updateRole);

export default router;
