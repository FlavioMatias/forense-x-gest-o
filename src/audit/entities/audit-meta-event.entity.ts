import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';
import { AuditEvent } from './audit-event.entity.js';

@Entity('audit_meta_events')
export class AuditMetaEvent {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ name: 'event_id', type: 'uuid', unique: true })
  eventId: string;

  @OneToOne(() => AuditEvent, (event) => event.metaEvent, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'event_id' })
  event: AuditEvent;

  @Column({ type: 'varchar', length: 80 })
  action: string;

  @Column({ type: 'varchar', length: 180, nullable: true })
  scope: string | null;
}