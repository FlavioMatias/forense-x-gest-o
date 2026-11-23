import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRequirementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreatePullRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  proposedTitle: string;

  @IsString()
  proposedDescription: string;
}

export class DecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}