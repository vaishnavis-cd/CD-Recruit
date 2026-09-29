import { SetMetadata } from '@nestjs/common';

export const REQUIRE_MFA_KEY = 'require_mfa';
export const RequireMfa = (require = true) => SetMetadata(REQUIRE_MFA_KEY, require);
