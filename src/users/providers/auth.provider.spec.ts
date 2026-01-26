

import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm';
import { user } from '../entity/User.entity';
import { AuthProvider } from './auth.provider';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { RejesterDto } from '../dtos/Rejester.dto';
import { Request } from 'express';

let authProvider: AuthProvider;
let userRepo: Repository<user>;
let RepositoryToken = getRepositoryToken(user);
let jwtService: JwtService;
let mailService: MailService;
let config: ConfigService

const newUser: RejesterDto = { userName: 'omar', email: 'almive@mail.com', password: 'dkvie', passwordConf: 'dkvie' }
const mockReq = {
  protocol: 'http',
  get: jest.fn().mockReturnValue('localhost:3000'),
} as unknown as Request;

describe('authProvider', () => {
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthProvider,
        { provide: JwtService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: RepositoryToken, useValue: {} },
        { provide: ConfigService, useValue: {} },
        { provide: MailerService, useValue: {} },
      ]
    }).compile();
    authProvider = module.get<AuthProvider>(AuthProvider)
    userRepo = module.get<Repository<user>>(RepositoryToken)
    config = module.get<ConfigService>(ConfigService)
    jwtService = module.get<JwtService>(JwtService)
    mailService = module.get<MailService>(MailService)

  })
  it('should call the authProvider and userRepo (be defined)', () => {
    expect(authProvider).toBeDefined()
    expect(userRepo).toBeDefined()
    expect(config).toBeDefined()
    expect(jwtService).toBeDefined()
    expect(mailService).toBeDefined()
  });

  describe('sigup()', () => {
    it('should call the save , create, findOne mocks function from the userRepo and check the returned of sigup() function ', async () => {
      userRepo.save = jest.fn().mockResolvedValue(newUser);
      userRepo.findOne = jest.fn().mockResolvedValue(null)
      userRepo.create = jest.fn().mockReturnValue(newUser);
      config.get = jest.fn();
      jwtService.signAsync = jest.fn();
      mailService.sendValidationEmail = jest.fn();
      const result = await authProvider.sigup(newUser, mockReq);
      expect(userRepo.findOne).toHaveBeenCalledTimes(2)
      expect(userRepo.findOne).toHaveBeenCalled();
      expect(userRepo.save).toHaveBeenCalledTimes(1)
      expect(userRepo.save).toHaveBeenCalled();
      expect(userRepo.create).toHaveBeenCalledTimes(1)
      expect(userRepo.create).toHaveBeenCalled();

      expect(result).toMatchObject({
        message: expect.any(String),
        newUser: expect.objectContaining({
          email: newUser.email,
          userName: newUser.userName,
        }),
      });

      expect(result.newUser.password).toBe('');
    })
  })


})
