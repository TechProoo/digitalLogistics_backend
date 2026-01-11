import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddNoteDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsOptional()
  adminName?: string;
}
