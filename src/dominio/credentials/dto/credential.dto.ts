import { IsArray, IsISO8601, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { credentialScopes } from '../credential.entity.js';

export class CreateCredentialDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsArray()
  @IsIn(credentialScopes, { each: true })
  scopes: string[];

  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;
}