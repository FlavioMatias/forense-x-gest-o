import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AUDIT_EVENT_PUBLISHER } from '../common/audit-event.port.js';
import type { AuditEventPublisher } from '../common/audit-event.port.js';
import { AuditEvent } from './entities/audit-event.entity.js';
import { AuditEventsService } from './services/audit-events.service.js';

@Injectable()
export class AuditQueryService {
  constructor(
    @InjectRepository(AuditEvent)
    private readonly events: Repository<AuditEvent>,
    @Inject(AUDIT_EVENT_PUBLISHER)
    private readonly publisher: AuditEventPublisher,
    private readonly auditEvents: AuditEventsService,
  ) {}

  async getEvent(eventId: string, actorId: string) {
    const event = await this.events.findOne({
      where: { id: eventId },
      relations: { resourceEvent: true, authEvent: true, metaEvent: true },
    });
    if (!event) throw new NotFoundException('Evento de auditoria não encontrado');

    await this.publisher.record({
      eventType: 'audit.access.viewed',
      actorId,
      result: { outcome: 'success' },
      meta: { action: 'view', scope: `event:${eventId}` },
    });
    return event;
  }

  verifyChain() {
    return this.auditEvents.verifyChain();
  }
}