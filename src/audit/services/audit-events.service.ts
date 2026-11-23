import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AuditEventInput, AuditEventPublisher } from '../../common/audit-event.port.js';
import { RequestContext } from '../../common/request-context.js';
import { AuditAuthEvent } from '../entities/audit-auth-event.entity.js';
import { AuditEvent } from '../entities/audit-event.entity.js';
import { AuditMetaEvent } from '../entities/audit-meta-event.entity.js';
import { AuditResourceEvent } from '../entities/audit-resource-event.entity.js';

export const AUDIT_GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
export const AUDIT_ADVISORY_LOCK_KEY = 741852963;

type AuditDetails = {
  resourceEvent: AuditResourceEvent | null;
  authEvent: AuditAuthEvent | null;
  metaEvent: AuditMetaEvent | null;
};

@Injectable()
export class AuditEventsService implements AuditEventPublisher {
  constructor(
    private readonly dataSource: DataSource,
    private readonly requestContext: RequestContext,
  ) {}

  async record(input: AuditEventInput, manager?: EntityManager): Promise<void> {
    if (manager) {
      await this.recordInTransaction(manager, input);
      return;
    }
    await this.dataSource.transaction((transaction) =>
      this.recordInTransaction(transaction, input),
    );
  }

  async verifyChain() {
    const events = await this.dataSource.getRepository(AuditEvent).find({
      relations: { resourceEvent: true, authEvent: true, metaEvent: true },
      order: { sequence: 'ASC' },
    });
    const failures: Array<{
      eventId: string;
      sequence: string;
      reason: string;
      expectedHash?: string;
      actualHash?: string;
    }> = [];
    let previousHash = AUDIT_GENESIS_HASH;

    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      const expectedSequence = String(index + 1);
      if (event.sequence !== expectedSequence) {
        failures.push({
          eventId: event.id,
          sequence: event.sequence,
          reason: `expected sequence ${expectedSequence}`,
        });
      }

      const expectedHash = this.hashEvent(event, this.detailsFromEvent(event), previousHash);
      if (event.hash !== expectedHash) {
        failures.push({
          eventId: event.id,
          sequence: event.sequence,
          reason: 'hash mismatch',
          expectedHash,
          actualHash: event.hash,
        });
      }
      previousHash = event.hash;
    }

    return { valid: failures.length === 0, checkedCount: events.length, failures };
  }

  private async recordInTransaction(manager: EntityManager, input: AuditEventInput) {
    await manager.query(`SELECT pg_advisory_xact_lock(${AUDIT_ADVISORY_LOCK_KEY})`);

    const events = manager.getRepository(AuditEvent);
    const previous = await events
      .createQueryBuilder('event')
      .orderBy('event.sequence', 'DESC')
      .getOne();
    const sequence = previous ? (BigInt(previous.sequence) + 1n).toString() : '1';
    const id = randomUUID();
    const occurredAt = new Date();
    const createdAt = new Date();
    const requestContext = this.requestContext.current();
    const event = events.create({
      id,
      sequence,
      occurredAt,
      eventType: input.eventType,
      actorId: input.actorId === undefined ? requestContext.actorId : input.actorId,
      actorRole: input.actorRole ?? requestContext.actorRole,
      requestId: requestContext.requestId,
      sessionId: requestContext.sessionId,
      sourceIp: requestContext.sourceIp,
      userAgent: requestContext.userAgent,
      result: this.redact(input.result),
      hash: '',
      createdAt,
    });

    const details: AuditDetails = {
      resourceEvent: input.resource
        ? manager.getRepository(AuditResourceEvent).create({
            id: randomUUID(),
            eventId: id,
            resourceType: input.resource.resourceType,
            resourceId: input.resource.resourceId,
            operation: input.resource.operation,
            oldValues: this.redact(input.resource.oldValues ?? null),
            newValues: this.redact(input.resource.newValues ?? null),
            approverId: input.resource.approverId ?? null,
          })
        : null,
      authEvent: input.auth
        ? manager.getRepository(AuditAuthEvent).create({
            id: randomUUID(),
            eventId: id,
            username: input.auth.username ?? null,
            action: input.auth.action,
            success: input.auth.success,
          })
        : null,
      metaEvent: input.meta
        ? manager.getRepository(AuditMetaEvent).create({
            id: randomUUID(),
            eventId: id,
            action: input.meta.action,
            scope: input.meta.scope ?? null,
          })
        : null,
    };

    event.hash = this.hashEvent(event, details, previous?.hash ?? AUDIT_GENESIS_HASH);
    await events.save(event);
    if (details.resourceEvent) await manager.getRepository(AuditResourceEvent).save(details.resourceEvent);
    if (details.authEvent) await manager.getRepository(AuditAuthEvent).save(details.authEvent);
    if (details.metaEvent) await manager.getRepository(AuditMetaEvent).save(details.metaEvent);
  }

  private hashEvent(event: AuditEvent, details: AuditDetails, previousHash: string) {
    const canonical = canonicalize({
      id: event.id,
      sequence: event.sequence,
      occurredAt: event.occurredAt,
      eventType: event.eventType,
      actorId: event.actorId,
      actorRole: event.actorRole,
      requestId: event.requestId,
      sessionId: event.sessionId,
      sourceIp: event.sourceIp,
      userAgent: event.userAgent,
      result: event.result,
      createdAt: event.createdAt,
      details,
    });
    return createHash('sha256')
      .update(Buffer.concat([Buffer.from(canonical, 'utf8'), Buffer.from(previousHash, 'hex')]))
      .digest('hex');
  }

  private detailsFromEvent(event: AuditEvent): AuditDetails {
    return {
      resourceEvent: event.resourceEvent
        ? {
            id: event.resourceEvent.id,
            eventId: event.resourceEvent.eventId,
            resourceType: event.resourceEvent.resourceType,
            resourceId: event.resourceEvent.resourceId,
            operation: event.resourceEvent.operation,
            oldValues: event.resourceEvent.oldValues,
            newValues: event.resourceEvent.newValues,
            approverId: event.resourceEvent.approverId,
          } as AuditResourceEvent
        : null,
      authEvent: event.authEvent
        ? {
            id: event.authEvent.id,
            eventId: event.authEvent.eventId,
            username: event.authEvent.username,
            action: event.authEvent.action,
            success: event.authEvent.success,
          } as AuditAuthEvent
        : null,
      metaEvent: event.metaEvent
        ? {
            id: event.metaEvent.id,
            eventId: event.metaEvent.eventId,
            action: event.metaEvent.action,
            scope: event.metaEvent.scope,
          } as AuditMetaEvent
        : null,
    };
  }

  private redact<T>(value: T): T {
    if (Array.isArray(value)) return value.map((entry) => this.redact(entry)) as T;
    if (!value || typeof value !== 'object' || value instanceof Date) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /password|token|secret|authorization|hash/i.test(key) ? '[REDACTED]' : this.redact(entry),
      ]),
    ) as T;
  }
}

export function canonicalize(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}