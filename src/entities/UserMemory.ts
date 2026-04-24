import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * 用户记忆实体
 * 存储用户的长期记忆，用于个性化对话
 */
@Entity('user_memory')
@Index(['user_id', 'topic'])
@Index(['user_id', 'importance'])
export class UserMemory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  user_id!: number;

  @Column({ type: 'varchar', length: 255 })
  topic!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({
    type: 'enum',
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  })
  importance!: 'low' | 'medium' | 'high';

  @Column({ type: 'text', nullable: true })
  embedding?: string; // JSON 字符串存储向量

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
