import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('sys_ai_config')
export class AiConfig {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ unique: true, length: 64 })
  config_key: string;

  @Column({ length: 512 })
  config_value: string;

  @Column({ default: 'string', length: 16 })
  value_type: string;

  @Column({ length: 32 })
  group_name: string;

  @Column({ length: 64 })
  label: string;

  @Column({ nullable: true, length: 256 })
  description: string;

  @Column({ length: 512 })
  default_value: string;

  @Column({ nullable: true, length: 64 })
  min_value: string;

  @Column({ nullable: true, length: 64 })
  max_value: string;

  @CreateDateColumn({ type: 'datetime' })
  create_time: Date;

  @UpdateDateColumn({ type: 'datetime' })
  update_time: Date;

  @Column({ type: 'tinyint', default: 0 })
  deleted: number;
}
