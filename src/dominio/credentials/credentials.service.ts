import {
  ConflictException,
  Injectable,
  NotFoundException,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { AUDIT_EVENT_PUBLISHER } from '../../common/audit-event.port.js';
import type { AuditEventPublisher } from '../../common/audit-event.port.js';
import { User } from '../users/users.entity.js';
import {
  Credential,
  CredentialStatus,
  CredentialType,
} from './credential.entity.js';
import { CreateCredentialDto } from './dto/credential.dto.js';

@Injectable()
export class CredentialsService {
  constructor(
    @InjectRepository(Credential)
    private readonly credentials: Repository<Credential>,
    private readonly dataSource: DataSource,
    @Optional() @Inject(AUDIT_EVENT_PUBLISHER)
    private readonly auditEvents?: AuditEventPublisher,
  ) {}

  async create(user: User, input: CreateCredentialDto) {
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
      throw new ConflictException('A expiração deve estar no futuro');
    }
    const token = randomBytes(32).toString('base64url');
    const credential = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Credential);
      const created = await repository.save(
        repository.create({
          name: input.name.trim(),
          type: CredentialType.API_TOKEN,
          status: CredentialStatus.ACTIVE,
          userId: user.id,
          scopes: input.scopes,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt,
          revokedAt: null,
        }),
      );
      await this.auditEvents?.record(
        {
          eventType: 'credential.created',
          actorId: user.id,
          result: { outcome: 'success' },
          resource: {
            resourceType: 'credential',
            resourceId: created.id,
            operation: 'create',
            newValues: {
              name: created.name,
              type: created.type,
              status: created.status,
              userId: created.userId,
              scopes: created.scopes,
              expiresAt: created.expiresAt?.toISOString() ?? null,
            },
          },
        },
        manager,
      );
      return created;
    });
    return {
      id: credential.id,
      name: credential.name,
      type: credential.type,
      status: credential.status,
      scopes: credential.scopes,
      expiresAt: credential.expiresAt,
      createdAt: credential.createdAt,
      token,
    };
  }

  async list(user: User) {
    const credentials = await this.credentials.find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });
    await this.auditEvents?.record({
      eventType: 'credential.listed',
      actorId: user.id,
      result: { outcome: 'success', count: credentials.length },
      resource: {
        resourceType: 'credential_collection',
        resourceId: user.id,
        operation: 'list',
        newValues: { credentialIds: credentials.map(({ id }) => id) },
      },
    });
    return credentials;
  }

  async revoke(user: User, credentialId: string) {
    const credential = await this.credentials.findOne({
      where: { id: credentialId, userId: user.id },
    });
    if (!credential) throw new NotFoundException('Credencial não encontrada');
    if (credential.status === CredentialStatus.REVOKED) {
      throw new ConflictException('Credencial já revogada');
    }
    await this.dataSource.transaction(async (manager) => {
      const oldValues = { status: credential.status, revokedAt: credential.revokedAt };
      credential.status = CredentialStatus.REVOKED;
      credential.revokedAt = new Date();
      const revoked = await manager.getRepository(Credential).save(credential);
      await this.auditEvents?.record(
        {
          eventType: 'credential.revoked',
          actorId: user.id,
          result: { outcome: 'success' },
          resource: {
            resourceType: 'credential',
            resourceId: credential.id,
            operation: 'revoke',
            oldValues,
            newValues: { status: revoked.status, revokedAt: revoked.revokedAt },
          },
        },
        manager,
      );
    });
  }
}