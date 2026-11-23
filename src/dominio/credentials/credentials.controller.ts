import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { CreateCredentialDto } from './dto/credential.dto.js';
import { CredentialsService } from './credentials.service.js';

@Controller('credentials')
@UseGuards(AuthGuard)
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateCredentialDto) {
    return this.credentials.create(request.user, input);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.credentials.list(request.user);
  }

  @Post(':credentialId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Req() request: AuthenticatedRequest,
    @Param('credentialId') credentialId: string,
  ) {
    return this.credentials.revoke(request.user, credentialId);
  }
}