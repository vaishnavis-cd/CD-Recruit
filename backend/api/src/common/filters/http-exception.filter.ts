import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AppException } from "./app-exception";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_SERVER_ERROR";
    let message = "An unexpected error occurred.";

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
      const responseBody = exception.getResponse() as any;
      if (responseBody && typeof responseBody === "object") {
        code = responseBody.code || responseBody.error || "HTTP_EXCEPTION";
        if (Array.isArray(responseBody.message)) {
          message = responseBody.message.join(", ");
        } else if (responseBody.message) {
          message = responseBody.message;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    response.status(status).json({
      statusCode: status,
      code,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
