import { DataSource } from 'typeorm';
import { User } from '../entities/User';
import { KnowledgeBase } from '../entities/KnowledgeBase';
import { Chunk } from '../entities/Chunk';
import { Conversation } from '../entities/Conversation';
import { Message } from '../entities/Message';
import { AiConfig } from '../entities/AiConfig';
import { McpToolRegistry } from '../entities/McpToolRegistry';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'docmind',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  entities: [User, KnowledgeBase, Chunk, Conversation, Message, AiConfig, McpToolRegistry],
  charset: 'utf8mb4',
});
