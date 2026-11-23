import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { DataSource, Repository } from 'typeorm';
import { Inject, Optional } from '@nestjs/common';
import { AUDIT_EVENT_PUBLISHER } from '../../common/audit-event.port.js';
import type { AuditEventPublisher } from '../../common/audit-event.port.js';
import { RequestContext } from '../../common/request-context.js';
import { AuthChallenge } from './auth-challenge.entity.js';
import { AuthSession } from './auth-session.entity.js';
import { LoginDto, RegisterDto, VerifyLoginDto } from './dto/auth.dto.js';
import { User } from '../users/users.entity.js';

const scrypt = promisify(scryptCallback);
const challengeLifetimeMs = 5 * 60 * 1000;
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const maxChallengeAttempts = 5;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AuthChallenge)
    private readonly challenges: Repository<AuthChallenge>,
    @InjectRepository(AuthSession)
    private readonly sessions: Repository<AuthSession>,
    private readonly dataSource: DataSource,
    @Optional() @Inject(AUDIT_EVENT_PUBLISHER)
    private readonly auditEvents?: AuditEventPublisher,
    @Optional() private readonly requestContext?: RequestContext,
  ) {}

  async register(input: RegisterDto) {
    const email = input.email.trim().toLowerCase();
    const user = this.users.create({
      name: input.name.trim(),
      email,
      passwordHash: await this.hashSecret(input.password),
      animalAnswerHash: await this.hashSecret(this.normalizeAnswer(input.animal)),
      active: true,
    });

    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        const persisted = await manager.getRepository(User).save(user);
        await this.auditEvents?.record(
          {
            eventType: 'auth.account.registered',
            actorId: null,
            result: { outcome: 'success' },
            auth: { username: email, action: 'registration', success: true },
          },
          manager,
        );
        return persisted;
      });
      return this.publicUser(saved);
    } catch (error) {
      if (this.isDuplicateKey(error)) throw new ConflictException('E-mail já cadastrado');
      throw error;
    }
  }

  async beginLogin(input: LoginDto) {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.animalAnswerHash')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: input.email.trim().toLowerCase() })
      .getOne();

    if (!user?.active || !(await this.verifySecret(input.password, user.passwordHash))) {
      await this.auditEvents?.record({
        eventType: 'auth.login.failed',
        actorId: null,
        result: { outcome: 'failure', reason: 'invalid_credentials' },
        auth: {
          username: input.email.trim().toLowerCase(),
          action: 'password_validation',
          success: false,
        },
      });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const challenge = await this.dataSource.transaction(async (manager) => {
      const persistedChallenge = await manager.getRepository(AuthChallenge).save(
        manager.getRepository(AuthChallenge).create({
          userId: user.id,
          expiresAt: new Date(Date.now() + challengeLifetimeMs),
          attempts: 0,
          usedAt: null,
        }),
      );
      await this.auditEvents?.record(
        {
          eventType: 'auth.login.challenge_issued',
          actorId: user.id,
          result: { outcome: 'success' },
          auth: { username: user.email, action: 'password_validation', success: true },
        },
        manager,
      );
      return persistedChallenge;
    });
    return { challengeId: challenge.id, expiresAt: challenge.expiresAt };
  }

  async verifyLogin(input: VerifyLoginDto) {
    const result = await this.dataSource.transaction(async (manager) => {
      const challenge = await manager
        .getRepository(AuthChallenge)
        .createQueryBuilder('challenge')
        .setLock('pessimistic_write', undefined, ['challenge'])
        .leftJoinAndSelect('challenge.user', 'user')
        .addSelect('user.animalAnswerHash')
        .where('challenge.id = :id', { id: input.challengeId })
        .getOne();

      if (
        !challenge ||
        challenge.usedAt ||
        challenge.expiresAt <= new Date() ||
        challenge.attempts >= maxChallengeAttempts ||
        !challenge.user.active
      ) {
        await this.auditEvents?.record(
          {
            eventType: 'auth.login.verification_failed',
            actorId: null,
            result: { outcome: 'failure', reason: 'invalid_or_expired_challenge' },
            auth: {
              username: challenge?.user?.email ?? null,
              action: 'second_factor_validation',
              success: false,
            },
          },
          manager,
        );
        return { error: 'invalid' as const };
      }

      const isValid = await this.verifySecret(
        this.normalizeAnswer(input.animal),
        challenge.user.animalAnswerHash,
      );
      if (!isValid) {
        challenge.attempts += 1;
        if (challenge.attempts >= maxChallengeAttempts) challenge.usedAt = new Date();
        await manager.getRepository(AuthChallenge).save(challenge);
        await this.auditEvents?.record(
          {
            eventType: 'auth.login.verification_failed',
            actorId: null,
            result: { outcome: 'failure', reason: 'incorrect_second_factor' },
            auth: {
              username: challenge.user.email,
              action: 'second_factor_validation',
              success: false,
            },
          },
          manager,
        );
        return { error: 'answer' as const };
      }

      challenge.usedAt = new Date();
      await manager.getRepository(AuthChallenge).save(challenge);
      const token = randomBytes(32).toString('base64url');
      const session = manager.getRepository(AuthSession).create({
        userId: challenge.userId,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + sessionLifetimeMs),
        revokedAt: null,
      });
      await manager.getRepository(AuthSession).save(session);
      this.requestContext?.setActor(challenge.userId, session.id);
      await this.auditEvents?.record(
        {
          eventType: 'auth.session.created',
          actorId: challenge.userId,
          result: { outcome: 'success', expiresAt: session.expiresAt.toISOString() },
          auth: {
            username: challenge.user.email,
            action: 'second_factor_validation',
            success: true,
          },
        },
        manager,
      );
      return { token, expiresAt: session.expiresAt, user: challenge.user };
    });

    if ('error' in result) {
      throw new UnauthorizedException(
        result.error === 'answer'
          ? 'Resposta de verificação inválida'
          : 'Desafio inválido ou expirado',
      );
    }
    return {
      accessToken: result.token,
      expiresAt: result.expiresAt,
      user: this.publicUser(result.user),
    };
  }

  async logout(session: AuthSession) {
    await this.dataSource.transaction(async (manager) => {
      const revokedAt = new Date();
      await manager.getRepository(AuthSession).update(session.id, { revokedAt });
      await this.auditEvents?.record(
        {
          eventType: 'auth.session.revoked',
          actorId: session.userId,
          result: { outcome: 'success' },
          auth: { username: session.user.email, action: 'logout', success: true },
        },
        manager,
      );
    });
  }

  publicUser(user: User) {
    return { id: user.id, name: user.name, email: user.email, active: user.active };
  }

  private normalizeAnswer(answer: string) {
    return answer.trim().toLocaleLowerCase('pt-BR');
  }

  private async hashSecret(value: string) {
    const salt = randomBytes(16).toString('hex');
    const derived = (await scrypt(value, salt, 64)) as Buffer;
    return `scrypt$${salt}$${derived.toString('hex')}`;
  }

  private async verifySecret(value: string, encoded: string) {
    const [algorithm, salt, storedHex] = encoded.split('$');
    if (algorithm !== 'scrypt' || !salt || !storedHex) return false;
    const expected = Buffer.from(storedHex, 'hex');
    const actual = (await scrypt(value, salt, expected.length)) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private isDuplicateKey(error: unknown) {
    if (typeof error !== 'object' || error === null) return false;
    const databaseError = error as {
      code?: unknown;
      driverError?: { code?: unknown };
    };
    return databaseError.code === '23505' || databaseError.driverError?.code === '23505';
  }
}