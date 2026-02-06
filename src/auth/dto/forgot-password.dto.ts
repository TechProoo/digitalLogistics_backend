import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class ForgotPasswordDto {
  @trim()
  @IsEmail({}, { message: 'Email must be a valid email address.' })
  @MaxLength(254, { message: 'Email is too long.' })
  email!: string;
}
