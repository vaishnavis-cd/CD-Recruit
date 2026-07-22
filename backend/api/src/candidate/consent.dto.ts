import { IsEnum, IsString, IsOptional } from "class-validator";

export enum ConsentTypeEnum {
  TERMS = "TERMS",
  BIOMETRIC = "BIOMETRIC",
  SELFIE = "SELFIE",
  AUDIO = "AUDIO",
}

export class RecordConsentDto {
  @IsEnum(ConsentTypeEnum)
  consentType!: ConsentTypeEnum;

  @IsString()
  version!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}
