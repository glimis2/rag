import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('sys_user')
export class User {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ unique: true, length: 50 })
  username: string;

  @Column({ length: 255 })
  password: string;

  @Column({ nullable: true, length: 100 })
  nickname: string;

  @Column({ nullable: true, length: 500 })
  avatar: string;

  @Column({ default: 'user', length: 20 })
  role: string;

  @Column({ type: 'json', nullable: true })
  preference: any;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ type: 'datetime', nullable: true })
  last_login: Date;

  @CreateDateColumn({ type: 'datetime' })
  create_time: Date;

  @UpdateDateColumn({ type: 'datetime' })
  update_time: Date;

  @Column({ type: 'tinyint', default: 0 })
  deleted: number;
}
