import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyMfaDto {
  @IsString()
  @IsNotEmpty({ message: 'Temporary token is required for MFA verification' })
  tempToken!: string;

  @IsString()
  @Length(6, 6, { message: 'TOTP verification code must be exactly 6 digits' })
  totpCode!: string;
}

export class ConfirmMfaDto {
  @IsString()
  @Length(6, 6, { message: 'TOTP confirmation code must be exactly 6 digits' })
  totpCode!: string;
}
