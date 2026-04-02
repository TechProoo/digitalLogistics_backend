import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

export class DriverLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
