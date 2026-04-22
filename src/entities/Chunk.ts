import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('kb_chunk')
export class Chunk {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'bigint' })
  kb_id: number;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'int', nullable: true })
  chunk_index: number;

  @Column({ type: 'json', nullable: true })
  metadata: any;

  @Column({ nullable: true, length: 100 })
  vector_id: string;

  @CreateDateColumn({ type: 'datetime' })
  create_time: Date;
}
