
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/users.entity.js';
import { Requirement } from '../requirements/requeriment.entity.js';

export enum PullRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('pull_requests')
export class PullRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'requirement_id', type: 'uuid' })
  requirementId: string;

  @ManyToOne(() => Requirement, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'requirement_id' })
  requirement: Requirement;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ name: 'reviewer_id', type: 'uuid', nullable: true })
  reviewerId: string | null;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: User | null;

  @Column({
    type: 'enum',
    enum: PullRequestStatus,
    default: PullRequestStatus.PENDING,
  })
  status: PullRequestStatus;

  @Column({ name: 'proposed_title', type: 'varchar', length: 200 })
  proposedTitle: string;

  @Column({ name: 'proposed_description', type: 'text' })
  proposedDescription: string;

  @Column({
    name: 'decision_reason',
    type: 'text',
    nullable: true,
  })
  decisionReason: string | null;

  @Column({ name: 'base_version', type: 'int' })
  baseVersion: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;
}
