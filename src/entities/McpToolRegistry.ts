import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('mcp_tool_registry')
export class McpToolRegistry {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ unique: true, length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: 'embedded', length: 20 })
  mode: string;

  @Column({ type: 'bigint', default: 0 })
  call_count: number;

  @Column({ type: 'int', default: 0 })
  avg_latency_ms: number;

  @Column({ default: 'active', length: 20 })
  status: string;

  @CreateDateColumn({ type: 'datetime' })
  create_time: Date;

  @UpdateDateColumn({ type: 'datetime' })
  update_time: Date;
}
