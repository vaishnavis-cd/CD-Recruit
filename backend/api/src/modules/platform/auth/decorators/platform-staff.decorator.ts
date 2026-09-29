import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedPlatformStaff } from '../interfaces/platform-auth-payload.interface';

export const CurrentPlatformStaff = createParamDecorator(
  (data: keyof AuthenticatedPlatformStaff | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const staff = request.user as AuthenticatedPlatformStaff;
    return data ? staff?.[data] : staff;
  },
);
