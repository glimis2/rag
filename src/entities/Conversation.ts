import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('qa_conversation')
export class Conversation {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  user_id: number;

  @Column({ nullable: true, length: 200 })
  title: string;

  @Column({ type: 'json', nullable: true })
  kb_ids: any;

  @Column({ type: 'int', default: 0 })
  message_count: number;

  @Column({ type: 'datetime', nullable: true })
  last_active: Date;

  @CreateDateColumn({ type: 'datetime' })
  create_time: Date;

  @UpdateDateColumn({ type: 'datetime' })
  update_time: Date;

  @Column({ type: 'tinyint', default: 0 })
  deleted: number;
}
