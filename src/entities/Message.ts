import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('qa_message')
export class Message {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  conversation_id: number;

  @Column({ length: 20 })
  role: string;

  @Column({ type: 'longtext' })
  content: string;

  @Column({ type: 'json', nullable: true })
  sources: any;

  @Column({ type: 'json', nullable: true })
  agent_trace: any;

  @Column({ type: 'json', nullable: true })
  mcp_calls: any;

  @Column({ type: 'json', nullable: true })
  reflection_log: any;

  @Column({ type: 'tinyint', default: 0 })
  feedback: number;

  @Column({ type: 'int', nullable: true })
  tokens_used: number;

  @Column({ type: 'int', nullable: true })
  response_time: number;

  @CreateDateColumn({ type: 'datetime' })
  create_time: Date;
}
