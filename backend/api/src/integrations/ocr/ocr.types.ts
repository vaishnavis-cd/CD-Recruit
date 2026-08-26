export type DocumentType = "AADHAAR" | "PAN" | "PASSPORT" | "UNKNOWN";

export interface DocumentOcrResult {
  documentType: DocumentType;
  extractedName: string | null;
  documentNumber: string | null;
  dob: string | null;
  confidence: number;
  rawText: string;
  metadata?: {
    panNumber?: string | null;
    aadhaarNumber?: string | null;
    passportNumber?: string | null;
    nationality?: string | null;
    expiryDate?: string | null;
    fatherName?: string | null;
    classificationConfidence?: number;
    mrzDetected?: boolean;
    rawLines?: string[];
  };
}

export interface ClassificationScore {
  type: DocumentType;
  score: number;
  matchedRules: string[];
}

export interface ClassificationResult {
  documentType: DocumentType;
  confidence: number;
  scores: Record<DocumentType, number>;
  matchedRules: string[];
}
