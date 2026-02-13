

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'dictionary' })
@Index('idx_unique_eng_ara', ['eng', 'ara'], { unique: true })
@Index('idx_eng', ['eng'])
@Index('idx_ara', ['ara'])
export class Dictionary {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 })
  eng: string;

  @Column({ type: 'varchar', length: 150 })
  ara: string;
}