
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

export enum CredentialType {
  API_TOKEN = 'api_token',
}

export enum CredentialStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

export const credentialScopes = [
  'projects:read',
  'projects:write',
  'requirements:read',
  'requirements:write',
  'requirements:review',
  'requirements:implement',
] as const;

@Entity('credentials')
export class Credential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({
    type: 'enum',
    enum: CredentialType,
    default: CredentialType.API_TOKEN,
  })
  type: CredentialType;

  @Column({
    type: 'enum',
    enum: CredentialStatus,
    default: CredentialStatus.ACTIVE,
  })
  status: CredentialStatus;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'simple-array', default: '' })
  scopes: string[];

  @Column({
    name: 'token_hash',
    type: 'varchar',
    length: 255,
    unique: true,
    select: false,
  })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
