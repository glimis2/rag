import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export class UserController {
  private userRepository = AppDataSource.getRepository(User);

  register = async (req: AuthRequest, res: Response) => {
    try {
      const { username, password, email } = req.body;

      const existingUser = await this.userRepository.findOne({ where: { username } });
      if (existingUser) {
        return res.status(400).json({ code: 400, message: 'Username already exists', data: null });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = this.userRepository.create({
        username,
        password: hashedPassword,
        nickname: username,
      });

      await this.userRepository.save(user);
      res.json({ code: 200, message: 'success', data: null });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Registration failed', data: null });
    }
  };

  login = async (req: AuthRequest, res: Response) => {
    try {
      const { username, password } = req.body;

      const user = await this.userRepository.findOne({ where: { username, deleted: 0 } });
      if (!user || user.status === 0) {
        return res.status(401).json({ code: 401, message: 'Invalid credentials', data: null });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ code: 401, message: 'Invalid credentials', data: null });
      }

      const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      user.last_login = new Date();
      await this.userRepository.save(user);

      res.json({
        code: 200,
        message: 'success',
        data: { token, userId: user.id, username: user.username, role: user.role }
      });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Login failed', data: null });
    }
  };

  getInfo = async (req: AuthRequest, res: Response) => {
    try {
      const user = await this.userRepository.findOne({ where: { id: req.userId } });
      if (!user) {
        return res.status(404).json({ code: 404, message: 'User not found', data: null });
      }

      res.json({
        code: 200,
        message: 'success',
        data: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          avatar: user.avatar,
          role: user.role,
          preference: user.preference
        }
      });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Failed to get user info', data: null });
    }
  };

  updateInfo = async (req: AuthRequest, res: Response) => {
    try {
      const { nickname, avatar } = req.body;
      await this.userRepository.update({ id: req.userId }, { nickname, avatar });
      res.json({ code: 200, message: 'success', data: null });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Update failed', data: null });
    }
  };

  updatePreference = async (req: AuthRequest, res: Response) => {
    try {
      const preference = req.body;
      await this.userRepository.update({ id: req.userId }, { preference });
      res.json({ code: 200, message: 'success', data: null });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Update failed', data: null });
    }
  };

  list = async (req: AuthRequest, res: Response) => {
    try {
      const { current = 1, size = 10, keyword } = req.query;
      const skip = (Number(current) - 1) * Number(size);

      const queryBuilder = this.userRepository.createQueryBuilder('user')
        .where('user.deleted = 0');

      if (keyword) {
        queryBuilder.andWhere('(user.username LIKE :keyword OR user.nickname LIKE :keyword)', {
          keyword: `%${keyword}%`
        });
      }

      const [records, total] = await queryBuilder
        .skip(skip)
        .take(Number(size))
        .getManyAndCount();

      res.json({ code: 200, message: 'success', data: { records, total, current, size } });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Query failed', data: null });
    }
  };

  updateStatus = async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { status } = req.body;
      await this.userRepository.update({ id: Number(userId) }, { status });
      res.json({ code: 200, message: 'success', data: null });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Update failed', data: null });
    }
  };

  updateRole = async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      await this.userRepository.update({ id: Number(userId) }, { role });
      res.json({ code: 200, message: 'success', data: null });
    } catch (error) {
      res.status(500).json({ code: 500, message: 'Update failed', data: null });
    }
  };
}
