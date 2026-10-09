import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsEmail,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
} from "class-validator";

export class PublicClientSignupDto {
  @ApiProperty({ description: "Company or Organization Name", example: "Acme Technologies" })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  companyName: string;

  @ApiProperty({ description: "Corporate work email (personal email domains rejected)", example: "hr@acme.com" })
  @IsEmail()
  workEmail: string;

  @ApiProperty({ description: "Full name of workspace administrator", example: "Jane Doe" })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  adminName: string;

  @ApiProperty({
    description: "Password for administrator account (min 8 chars, mixed case, number, symbol)",
    example: "Secret#Pass123",
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/, {
    message: "Password must contain uppercase, lowercase, digit, and special character",
  })
  password: string;

  @ApiPropertyOptional({ description: "ISO-2 Country code", example: "IN", default: "IN" })
  @IsOptional()
  @IsString()
  billingCountry?: string = "IN";

  @ApiPropertyOptional({ description: "Primary hiring scenario", example: "CAMPUS_HIRING" })
  @IsOptional()
  @IsString()
  intendedUse?: string;
}

export interface PublicClientSignupResponseDto {
  success: boolean;
  message: string;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  trial: {
    credits: number;
    validityDays: number;
  };
}
