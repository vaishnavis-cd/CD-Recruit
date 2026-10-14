import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class GetPublicPricingQueryDto {
  @ApiPropertyOptional({ description: "Country code (IN or US)", example: "IN" })
  @IsOptional()
  @IsString()
  country?: string = "IN";
}

export interface PublicPricingTier {
  id: string;
  name: string;
  tagline: string;
  price: number | null;
  currency: string;
  credits: number | string;
  period: string;
  features: string[];
  highlight: boolean;
  badge?: string;
  ctaText: string;
  ctaAction: "signup" | "contact";
}

export interface PublicPricingResponseDto {
  country: string;
  currency: string;
  tiers: PublicPricingTier[];
  faq: Array<{ question: string; answer: string }>;
}
