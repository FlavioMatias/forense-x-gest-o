import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { AuditAuthEvent } from './audit-auth-event.entity.js';
import { AuditMetaEvent } from './audit-meta-event.entity.js';
import { AuditResourceEvent } from './audit-resource-event.entity.js';

@Entity('audit_events')
@Unique('UQ_audit_events_sequence', ['sequence'])
@Unique('UQ_audit_events_hash', ['hash'])
export class AuditEvent {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'bigint' })
  sequence: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  @Column({ name: 'event_type', type: 'varchar', length: 120 })
  eventType: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'actor_role', type: 'varchar', length: 80, nullable: true })
  actorRole: string | null;

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId: string | null;

  @Column({ name: 'session_id', type: 'uuid', nullable: true })
  sessionId: string | null;

  @Column({ name: 'source_ip', type: 'varchar', length: 64, nullable: true })
  sourceIp: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'jsonb' })
  result: Record<string, unknown>;

  @Column({ type: 'varchar', length: 64 })
  hash: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToOne(() => AuditResourceEvent, (detail) => detail.event)
  resourceEvent: AuditResourceEvent | null;

  @OneToOne(() => AuditAuthEvent, (detail) => detail.event)
  authEvent: AuditAuthEvent | null;

  @OneToOne(() => AuditMetaEvent, (detail) => detail.event)
  metaEvent: AuditMetaEvent | null;
}