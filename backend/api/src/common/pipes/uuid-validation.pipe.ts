// DEPRECATED — CANDIDATE FOR REMOVAL. See CODE_QUALITY_REFACTOR_LOG.md item 1.4. Not removed per explicit no-deletion constraint.
import { PipeTransform, Injectable, BadRequestException } from "@nestjs/common";
import { isUUID } from "class-validator";

/**
 * @deprecated Use NestJS built-in ParseUUIDPipe instead.
 */
@Injectable()
export class UUIDValidationPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isUUID(value)) {
      throw new BadRequestException("Invalid UUID format");
    }
    return value;
  }
}
