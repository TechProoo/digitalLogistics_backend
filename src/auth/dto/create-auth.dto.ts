import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CreateAuthDto {
  @trim()
  @IsEmail({}, { message: 'Email must be a valid email address.' })
  @MaxLength(254, { message: 'Email is too long.' })
  email!: string;

  @trim()
  @IsString({ message: 'Password must be a string.' })
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(72, { message: 'Password is too long.' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'Password must include at least 1 uppercase letter, 1 lowercase letter, and 1 number.',
  })
  password!: string;

  @trim()
  @IsOptional()
  @IsString({ message: 'Name must be a string.' })
  @MinLength(2, { message: 'Name must be at least 2 characters.' })
  @MaxLength(80, { message: 'Name is too long.' })
  name?: string;

  @trim()
  @IsOptional()
  @IsPhoneNumber(undefined, { message: 'Phone must be a valid phone number.' })
  phone?: string;
}
