import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  IsInt,
  Min,
  IsBoolean,
} from "class-validator";

export class CreatePartnerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  callbackUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  rateLimit?: number;
}

export class UpdatePartnerDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  callbackUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  rateLimit?: number;

  @IsOptional()
  @IsBoolean()
  isRevoked?: boolean;
}
