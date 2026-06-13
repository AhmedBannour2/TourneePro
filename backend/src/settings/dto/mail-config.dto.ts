import { IsString, IsEmail, IsOptional } from 'class-validator';

export class MailConfigDto {
  @IsString()
  @IsOptional()
  resendApiKey?: string;

  @IsString()
  @IsOptional()
  from?: string;

  @IsEmail()
  @IsOptional()
  testRecipient?: string;
}
