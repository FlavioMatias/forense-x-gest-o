import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';
import { AuditEvent } from './audit-event.entity.js';

@Entity('audit_auth_events')
export class AuditAuthEvent {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ name: 'event_id', type: 'uuid', unique: true })
  eventId: string;

  @OneToOne(() => AuditEvent, (event) => event.authEvent, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'event_id' })
  event: AuditEvent;

  @Column({ type: 'varchar', length: 255, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', length: 80 })
  action: string;

  @Column({ type: 'boolean' })
  success: boolean;
}