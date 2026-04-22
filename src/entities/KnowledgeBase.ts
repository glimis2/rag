import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('kb_knowledge_base')
export class KnowledgeBase {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 200 })
  name: string;

  @Column({ nullable: true, length: 50 })
  category: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true, length: 500 })
  file_url: string;

  @Column({ nullable: true, length: 10 })
  file_type: string;

  @Column({ type: 'bigint', nullable: true })
  file_size: number;

  @Column({ type: 'int', default: 0 })
  chunk_count: number;

  @Column({ default: 'uploading', length: 20 })
  status: string;

  @Column({ type: 'text', nullable: true })
  error_msg: string;

  @Column({ type: 'bigint' })
  user_id: number;

  @CreateDateColumn({ type: 'datetime' })
  create_time: Date;

  @UpdateDateColumn({ type: 'datetime' })
  update_time: Date;

  @Column({ type: 'tinyint', default: 0 })
  deleted: number;
}
