import { IsIn, IsString, IsNotEmpty } from 'class-validator';

export class SendMessageDto {
  @IsIn(['admin', 'driver'])
  sender: 'admin' | 'driver';

  @IsString()
  @IsNotEmpty()
  text: string;
}
