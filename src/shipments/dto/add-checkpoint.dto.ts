import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddCheckpointDto {
  @IsString()
  @IsNotEmpty()
  location: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsOptional()
  adminName?: string;
}
