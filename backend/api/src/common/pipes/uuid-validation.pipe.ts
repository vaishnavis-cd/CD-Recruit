import { PipeTransform, Injectable, BadRequestException } from "@nestjs/common";
import { isUUID } from "class-validator";

@Injectable()
export class UUIDValidationPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isUUID(value)) {
      throw new BadRequestException("Invalid UUID format");
    }
    return value;
  }
}
