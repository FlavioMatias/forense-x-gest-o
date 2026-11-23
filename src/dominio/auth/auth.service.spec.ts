import { UnauthorizedException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { AuthChallenge } from './auth-challenge.entity.js';
import { AuthSession } from './auth-session.entity.js';
import { AuthService } from './auth.service.js';
import { User } from '../users/users.entity.js';

describe('AuthService', () => {
  const queryBuilder = {
    addSelect: vi.fn(),
    where: vi.fn(),
    getOne: vi.fn(),
  };
  queryBuilder.addSelect.mockReturnValue(queryBuilder);
  queryBuilder.where.mockReturnValue(queryBuilder);

  const userRepository = {
    create: vi.fn((value: Partial<User>) => value),
    save: vi.fn(async (value: Partial<User>) => ({ ...value, id: 'user-id' }) as User),
    createQueryBuilder: vi.fn(() => queryBuilder),
  };
  const challengeRepository = {
    create: vi.fn((value: Partial<AuthChallenge>) => value),
    save: vi.fn(async (value: Partial<AuthChallenge>) => ({
      ...value,
      id: 'challenge-id',
    }) as AuthChallenge),
  };
  const sessionRepository = { save: vi.fn() };
  const transactionManager = {
    getRepository: vi.fn((entity: unknown) =>
      entity === User ? userRepository : challengeRepository,
    ),
  };
  const dataSource = ({
    transaction: vi.fn(async (operation: (manager: unknown) => unknown) => {
      return operation(transactionManager);
    }),
  }) as unknown as DataSource;
  const service = new AuthService(
    userRepository as unknown as Repository<User>,
    challengeRepository as unknown as Repository<AuthChallenge>,
    sessionRepository as unknown as Repository<AuthSession>,
    dataSource,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryBuilder.addSelect.mockReturnValue(queryBuilder);
    queryBuilder.where.mockReturnValue(queryBuilder);
  });

  it('normalizes email and never returns credential hashes', async () => {
    const result = await service.register({
      name: 'Pessoa Teste',
      email: '  Teste@Example.com ',
      password: 'senha-segura',
      animal: ' Coelho ',
    });

    const savedUser = userRepository.save.mock.calls[0][0];
    expect(savedUser.email).toBe('teste@example.com');
    expect(savedUser.passwordHash).toMatch(/^scrypt\$/);
    expect(savedUser.animalAnswerHash).toMatch(/^scrypt\$/);
    expect(savedUser.passwordHash).not.toContain('senha-segura');
    expect(result).toEqual({
      id: 'user-id',
      name: 'Pessoa Teste',
      email: 'teste@example.com',
      active: true,
    });
  });

  it('requires the second step before issuing a session', async () => {
    await service.register({
      name: 'Pessoa Teste',
      email: 'teste@example.com',
      password: 'senha-segura',
      animal: 'coelho',
    });
    const user = { ...userRepository.save.mock.calls[0][0], id: 'user-id' } as User;
    queryBuilder.getOne.mockResolvedValue(user);

    const result = await service.beginLogin({
      email: ' TESTE@example.com ',
      password: 'senha-segura',
    });

    expect(result.challengeId).toBe('challenge-id');
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(sessionRepository.save).not.toHaveBeenCalled();
  });

  it('does not disclose whether the email exists when the password is invalid', async () => {
    queryBuilder.getOne.mockResolvedValue(null);
    await expect(
      service.beginLogin({ email: 'missing@example.com', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});