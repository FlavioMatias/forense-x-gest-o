import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';
import { AuditEvent } from './audit-event.entity.js';

@Entity('audit_resource_events')
export class AuditResourceEvent {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ name: 'event_id', type: 'uuid', unique: true })
  eventId: string;

  @OneToOne(() => AuditEvent, (event) => event.resourceEvent, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'event_id' })
  event: AuditEvent;

  @Column({ name: 'resource_type', type: 'varchar', length: 80 })
  resourceType: string;

  @Column({ name: 'resource_id', type: 'varchar', length: 120 })
  resourceId: string;

  @Column({ type: 'varchar', length: 80 })
  operation: string;

  @Column({ name: 'old_values', type: 'jsonb', nullable: true })
  oldValues: Record<string, unknown> | null;

  @Column({ name: 'new_values', type: 'jsonb', nullable: true })
  newValues: Record<string, unknown> | null;

  @Column({ name: 'approver_id', type: 'uuid', nullable: true })
  approverId: string | null;
}