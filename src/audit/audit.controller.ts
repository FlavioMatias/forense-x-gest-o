import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../dominio/auth/auth.guard.js';
import type { AuthenticatedRequest } from '../dominio/auth/auth.guard.js';
import { AuditAccessGuard } from './audit-access.guard.js';
import { AuditQueryService } from './audit-query.service.js';
import { AuditEventsService } from './services/audit-events.service.js';

@Controller('audit')
@UseGuards(AuthGuard, AuditAccessGuard)
export class AuditController {
  constructor(
    private readonly queries: AuditQueryService,
    private readonly events: AuditEventsService,
  ) {}

  @Get('events/:eventId')
  async getEvent(
    @Req() request: AuthenticatedRequest,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Res() response: Response,
  ) {
    const event = await this.queries.getEvent(eventId, request.user.id);
    const integrity = await this.events.verifyChain();
    const detail = event.resourceEvent ?? event.authEvent ?? event.metaEvent;
    const html = renderAuditEvent(event, detail, integrity);
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    response.type('html').send(html);
  }
}

function renderAuditEvent(event: object, detail: object | null, integrity: unknown) {
  const record = event as Record<string, unknown>;
  const detailRecord = (detail ?? {}) as Record<string, unknown>;
  const rows = [
    ['Evento', record.eventType],
    ['Sequência', record.sequence],
    ['Ocorrido em', record.occurredAt],
    ['Ator', record.actorId],
    ['Papel', record.actorRole],
    ['Requisição', record.requestId],
    ['Sessão', record.sessionId],
    ['Origem', record.sourceIp],
    ['User-Agent', record.userAgent],
    ['Resultado', record.result],
    ['Hash', record.hash],
    ['Especialização', detailRecord],
    ['Verificação da cadeia', integrity],
  ];
  const body = rows
    .map(([label, value]) => {
      const rendered =
        value && typeof value === 'object'
          ? JSON.stringify(value, null, 2)
          : value === null || value === undefined
            ? ''
            : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
              ? String(value)
              : JSON.stringify(value);
      return `<tr><th>${escapeHtml(String(label))}</th><td><pre>${escapeHtml(rendered)}</pre></td></tr>`;
    })
    .join('');

  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Evento de auditoria</title><style>body{font:15px system-ui,sans-serif;margin:2rem;color:#17212b}h1{font-size:1.4rem}table{border-collapse:collapse;width:100%;max-width:1000px}th,td{border:1px solid #ccd3d9;padding:.65rem;text-align:left;vertical-align:top}th{width:12rem;background:#f2f5f7}pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font:inherit}</style><h1>Evento de auditoria</h1><table>${body}</table></html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return replacements[character];
  });
}