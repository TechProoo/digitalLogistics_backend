import { IsString, IsNotEmpty, MaxLength, Matches } from 'class-validator';

export class UpdateBankDetailsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  bankName: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10}$/, { message: 'Account number must be exactly 10 digits' })
  bankAccount: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  bankAccountName: string;
}
