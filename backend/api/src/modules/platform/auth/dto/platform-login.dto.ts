import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class PlatformLoginDto {
  @IsEmail({}, { message: 'A valid staff email address is required' })
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;
}
