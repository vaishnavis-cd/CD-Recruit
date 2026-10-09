import { Injectable, Logger } from "@nestjs/common";
import { PriceBookService } from "../billing/price/price-book.service";
import {
  GetPublicPricingQueryDto,
  PublicPricingResponseDto,
  PublicPricingTier,
} from "./dto/public-pricing.dto";

@Injectable()
export class PublicPricingService {
  private readonly logger = new Logger(PublicPricingService.name);

  constructor(private readonly priceBookService: PriceBookService) {}

  /**
   * Returns public, region-aware pricing catalog.
   */
  async getPublicPricing(query?: GetPublicPricingQueryDto): Promise<PublicPricingResponseDto> {
    const rawCountry = (query?.country || "IN").trim().toUpperCase();
    const country = ["IN", "US"].includes(rawCountry) ? rawCountry : "IN";
    const currency = country === "IN" ? "INR" : "USD";
    const symbol = country === "IN" ? "₹" : "$";

    let drivePassPrice = country === "IN" ? 5000 : 200;
    let talentReservePrice = country === "IN" ? 25000 : 950;

    try {
      const catalog = await this.priceBookService.listCatalog({
        country,
        activeOnly: true,
      });

      const entries = Array.isArray(catalog) ? catalog : (catalog as any).items || [];
      const drivePassEntry = entries.find((item: any) => item.sku === "DRIVE_PASS");
      if (drivePassEntry) {
        drivePassPrice = Math.round(drivePassEntry.unitPriceMinor / 100);
      }

      const reserveEntry = entries.find(
        (item: any) => item.poolType === "TALENT_RESERVE" && item.credits >= 50,
      );
      if (reserveEntry) {
        talentReservePrice = Math.round(reserveEntry.unitPriceMinor / 100);
      }
    } catch (err: any) {
      this.logger.warn(`Could not load dynamic PriceBook catalog: ${err.message}. Using standard regional tier defaults.`);
    }

    const tiers: PublicPricingTier[] = [
      {
        id: "starter-trial",
        name: "Trial / Evaluation",
        tagline: "Free instant access to run your first 25 live technical interviews.",
        price: 0,
        currency,
        credits: 25,
        period: "14-day validity",
        features: [
          "25 live candidate evaluation credits",
          "All 5 core engines (MCQ, SQL, Coding, NoSQL, Simulation)",
          "Real-time webcam, tab-switch & audio proctoring",
          "Automated Say-Do Score & forensic audit report",
          "Zero credit card required at signup",
        ],
        highlight: false,
        ctaText: "Start Free Trial",
        ctaAction: "signup",
      },
      {
        id: "drive-pass",
        name: "Campus Drive Pass",
        tagline: "High-concurrency hiring pass for structured college or hackathon drives.",
        price: drivePassPrice,
        currency,
        credits: 100,
        period: "per drive event",
        features: [
          "100 assessment attempts included",
          "Custom question authoring & test-case evaluator",
          "Live proctoring dashboard with live video mosaic",
          "Instant PDF/Excel candidate rankings",
          "Incident window pause & network waiver tools",
          "Priority recruiter support",
        ],
        highlight: true,
        badge: "Most Popular",
        ctaText: "Get Drive Pass",
        ctaAction: "signup",
      },
      {
        id: "talent-reserve",
        name: "Talent Reserve",
        tagline: "Year-round flexible credit pool for high-growth technical recruiting teams.",
        price: talentReservePrice,
        currency,
        credits: 500,
        period: "annual credit pool",
        features: [
          "500 flexible credits with unused rollover support",
          "Curated role templates (Frontend, Backend, DevOps, Data)",
          "Multi-seat recruiter management (Admin, HR, Reviewer)",
          "ATS webhook integration & automatic grade push",
          "Quarterly integrity audit verification",
          "Dedicated customer success manager",
        ],
        highlight: false,
        ctaText: "Choose Talent Reserve",
        ctaAction: "signup",
      },
      {
        id: "enterprise",
        name: "Enterprise",
        tagline: "Custom scale, dedicated proctoring clusters, and air-gapped security.",
        price: null,
        currency,
        credits: "Custom Volume",
        period: "custom agreement",
        features: [
          "Volume commitments over 2,000+ candidates",
          "Dedicated Judge0 code execution sandbox clusters",
          "Configurable proctoring thresholds & compliance policies",
          "Enterprise SSO (SAML 2.0 / Okta / Azure AD)",
          "99.9% uptime SLA & 24/7 emergency incident hotline",
          "Custom invoice billing & procurement workflows",
        ],
        highlight: false,
        ctaText: "Talk to Enterprise Sales",
        ctaAction: "contact",
      },
    ];

    const faq = [
      {
        question: "How does the credit model work?",
        answer:
          "Exactly 1 credit is consumed only when a candidate begins a live assessment attempt. Practice, tutorials, and system checks do not cost any credits.",
      },
      {
        question: "What happens if a candidate experiences power or network failure?",
        answer:
          "Recruiters can issue a courtesy reattempt or leverage platform incident windows without paying for an extra credit, ensuring zero penalty for candidate infrastructure issues.",
      },
      {
        question: "Can I upgrade or buy additional credits after my trial?",
        answer:
          "Yes! You can purchase additional Drive Passes or Talent Reserve credit packs directly from your Recruiter Dashboard via card, UPI, or corporate invoice.",
      },
      {
        question: "Do credits expire?",
        answer:
          "Trial credits are valid for 14 days. Drive Pass credits are valid for the scheduled drive window (up to 30 days). Talent Reserve credits are valid for 12 months with rollover options.",
      },
    ];

    return {
      country,
      currency,
      tiers,
      faq,
    };
  }
}
