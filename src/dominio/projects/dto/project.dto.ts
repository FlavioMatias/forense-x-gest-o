import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ProjectRole } from '../dominio.entity.js';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class AddProjectMemberDto {
  @IsString()
  userId: string;

  @IsEnum(ProjectRole)
  role: ProjectRole;
}

export class UpdateProjectMemberDto {
  @IsEnum(ProjectRole)
  role: ProjectRole;
}