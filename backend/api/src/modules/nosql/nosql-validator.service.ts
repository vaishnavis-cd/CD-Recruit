import { Injectable, BadRequestException } from "@nestjs/common";

export type MongoOperator =
  | "find"
  | "aggregate"
  | "insertOne"
  | "insertMany"
  | "updateOne"
  | "updateMany"
  | "deleteOne"
  | "deleteMany"
  | "countDocuments";

export interface MongoOperationObject {
  collection: string;
  operator: MongoOperator;
  payload: any;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

@Injectable()
export class NosqlValidatorService {
  private readonly blocklistedKeys = [
    "dropDatabase",
    "drop",
    "createUser",
    "shutdownServer",
    "serverStatus",
    "eval",
    "listDatabases",
    "adminCommand",
    "$where",
    "mapReduce",
  ];

  /**
   * Validates if a value contains function bodies or common JavaScript/eval keywords.
   */
  private scanForJS(val: any): { blocked: boolean; reason?: string } {
    if (val === null || val === undefined) {
      return { blocked: false };
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      const jsKeywords = [
        /\bfunction\b/,
        /=>/,
        /\breturn\b/,
        /\beval\b/,
        /\bwindow\b/,
        /\bdocument\b/,
        /\bprocess\b/,
        /\brequire\b/,
        /\bexec\b/,
      ];
      if (jsKeywords.some((pattern) => pattern.test(trimmed))) {
        return { blocked: true, reason: `Value contains potential JavaScript code: "${trimmed.slice(0, 50)}"` };
      }
      return { blocked: false };
    }

    if (Array.isArray(val)) {
      for (const item of val) {
        const res = this.scanForJS(item);
        if (res.blocked) return res;
      }
      return { blocked: false };
    }

    if (typeof val === "object") {
      for (const key of Object.keys(val)) {
        if (this.blocklistedKeys.includes(key)) {
          return { blocked: true, reason: `Disallowed blocklisted key found: "${key}"` };
        }
        const res = this.scanForJS(val[key]);
        if (res.blocked) return res;
      }
      return { blocked: false };
    }

    return { blocked: false };
  }

  /**
   * Validate candidate MongoDB operation.
   */
  validateOperation(operation: any, questionContent: any): ValidationResult {
    // 1. Structural Checks: Strict top-level schema validation
    if (!operation || typeof operation !== "object") {
      return { valid: false, reason: "Operation must be a JSON object" };
    }

    const allowedTopLevel = ["collection", "operator", "payload"];
    const topLevelKeys = Object.keys(operation);
    const hasUnknownTopLevel = topLevelKeys.some((k) => !allowedTopLevel.includes(k));
    if (hasUnknownTopLevel) {
      return { valid: false, reason: "Operation contains unknown top-level fields" };
    }

    if (!operation.collection || typeof operation.collection !== "string") {
      return { valid: false, reason: "Missing or invalid 'collection' field" };
    }

    if (!operation.operator || typeof operation.operator !== "string") {
      return { valid: false, reason: "Missing or invalid 'operator' field" };
    }

    // 2. Payload size cap (10KB)
    try {
      const payloadSize = Buffer.byteLength(JSON.stringify(operation));
      if (payloadSize > 10 * 1024) {
        return { valid: false, reason: "Payload size exceeds 10KB limit" };
      }
    } catch {
      return { valid: false, reason: "Failed to measure payload size" };
    }

    // 3. Whitelist check against question config
    const allowedOps: string[] = questionContent.allowedOperations || [];
    if (!allowedOps.includes(operation.operator)) {
      return {
        valid: false,
        reason: `Operation '${operation.operator}' is not allowed for this question`,
      };
    }

    // 4. Hard-blocklist recursively scanning for blocklisted keys and JS injections
    const blocklistCheck = this.scanForJS(operation.payload);
    if (blocklistCheck.blocked) {
      return { valid: false, reason: blocklistCheck.reason };
    }

    // 5. Operation-specific payload schema validation
    const payload = operation.payload || {};
    switch (operation.operator) {
      case "find": {
        const keys = Object.keys(payload);
        const allowed = ["filter", "projection", "options"];
        if (keys.some((k) => !allowed.includes(k))) {
          return { valid: false, reason: "Invalid payload keys for 'find' operator" };
        }
        break;
      }
      case "aggregate": {
        const keys = Object.keys(payload);
        if (keys.some((k) => k !== "pipeline")) {
          return { valid: false, reason: "Invalid payload keys for 'aggregate' operator" };
        }
        const pipeline = payload.pipeline;
        if (!Array.isArray(pipeline)) {
          return { valid: false, reason: "'pipeline' must be an array" };
        }
        if (pipeline.length > 10) {
          return { valid: false, reason: "Aggregation pipeline exceeds maximum of 10 stages" };
        }
        break;
      }
      case "insertOne": {
        const keys = Object.keys(payload);
        if (keys.some((k) => k !== "document")) {
          return { valid: false, reason: "Invalid payload keys for 'insertOne' operator" };
        }
        break;
      }
      case "insertMany": {
        const keys = Object.keys(payload);
        if (keys.some((k) => k !== "documents")) {
          return { valid: false, reason: "Invalid payload keys for 'insertMany' operator" };
        }
        if (!Array.isArray(payload.documents)) {
          return { valid: false, reason: "'documents' must be an array" };
        }
        break;
      }
      case "updateOne":
      case "updateMany": {
        const keys = Object.keys(payload);
        const allowed = ["filter", "update", "options"];
        if (keys.some((k) => !allowed.includes(k))) {
          return { valid: false, reason: `Invalid payload keys for '${operation.operator}' operator` };
        }
        if (!payload.update || typeof payload.update !== "object") {
          return { valid: false, reason: "'update' document must be specified" };
        }
        break;
      }
      case "deleteOne":
      case "deleteMany":
      case "countDocuments": {
        const keys = Object.keys(payload);
        const allowed = ["filter"];
        if (keys.some((k) => !allowed.includes(k))) {
          return { valid: false, reason: `Invalid payload keys for '${operation.operator}' operator` };
        }
        break;
      }
      default:
        return { valid: false, reason: `Unknown operator: '${operation.operator}'` };
    }

    return { valid: true };
  }
}
