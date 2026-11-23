import type { EntityManager } from 'typeorm';

export const AUDIT_EVENT_PUBLISHER = Symbol('AUDIT_EVENT_PUBLISHER');

export type AuditResourceDetail = {
  resourceType: string;
  resourceId: string;
  operation: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  approverId?: string | null;
};

export type AuditAuthDetail = {
  username?: string | null;
  action: string;
  success: boolean;
};

export type AuditMetaDetail = {
  action: string;
  scope?: string | null;
};

export type AuditEventInput = {
  eventType: string;
  actorId?: string | null;
  actorRole?: string | null;
  result: Record<string, unknown>;
  resource?: AuditResourceDetail;
  auth?: AuditAuthDetail;
  meta?: AuditMetaDetail;
};

export interface AuditEventPublisher {
  record(input: AuditEventInput, manager?: EntityManager): Promise<void>;
}