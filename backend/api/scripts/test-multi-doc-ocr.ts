import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import { OcrEngineService } from "../src/integrations/ocr/ocr-engine.service";
import { DocumentClassifierService } from "../src/integrations/ocr/document-classifier.service";
import { DocumentOcrService } from "../src/integrations/ocr/document-ocr.service";
import { NameMatchService } from "../src/common/services/name-match.service";

/**
 * Generate test ID card image buffers using Sharp + SVG layouts with standard Indian document structures.
 */
async function generateTestImages(): Promise<Array<{
  filename: string;
  category: string;
  expectedType: string;
  expectedName: string;
  expectedDocNumber?: string;
  isDegraded: boolean;
  degradedReason?: string;
  buffer: Buffer;
}>> {
  const samplesDir = path.join(__dirname, "../test-samples");
  if (!fs.existsSync(samplesDir)) {
    fs.mkdirSync(samplesDir, { recursive: true });
  }

  const items: Array<{
    filename: string;
    category: string;
    expectedType: string;
    expectedName: string;
    expectedDocNumber?: string;
    isDegraded: boolean;
    degradedReason?: string;
    svg: string;
    blur?: number;
    brightness?: number;
  }> = [
    // ----------------------------------------------------
    // PAN CARDS
    // ----------------------------------------------------
    {
      filename: "pan_sample_1_clean.png",
      category: "PAN",
      expectedType: "PAN",
      expectedName: "RAJESH KUMAR SHARMA",
      expectedDocNumber: "ABCDE1234F",
      isDegraded: false,
      svg: `
        <svg width="1000" height="600" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#E8F4F8"/>
          <rect x="20" y="20" width="960" height="560" rx="20" fill="#E8F4F8" stroke="#007799" stroke-width="4"/>
          
          <!-- Header -->
          <text x="500" y="70" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#003366" text-anchor="middle">INCOME TAX DEPARTMENT</text>
          <text x="500" y="105" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#003366" text-anchor="middle">GOVT. OF INDIA</text>
          
          <!-- Photo Box -->
          <rect x="60" y="140" width="180" height="220" fill="#CCCCCC" stroke="#888888" stroke-width="2"/>
          <text x="150" y="255" font-family="Arial" font-size="18" fill="#555555" text-anchor="middle">PHOTO</text>
          
          <!-- Details -->
          <text x="280" y="170" font-family="Arial, sans-serif" font-size="16" fill="#666666">Name / नाम</text>
          <text x="280" y="205" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="#000000">RAJESH KUMAR SHARMA</text>
          
          <text x="280" y="250" font-family="Arial, sans-serif" font-size="16" fill="#666666">Father's Name / पिता का नाम</text>
          <text x="280" y="280" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#000000">RAMESH CHANDRA SHARMA</text>
          
          <text x="280" y="325" font-family="Arial, sans-serif" font-size="16" fill="#666666">Date of Birth / जन्म तिथि</text>
          <text x="280" y="355" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#000000">15/08/1992</text>
          
          <!-- PAN Number -->
          <rect x="270" y="390" width="400" height="70" fill="#FFFFFF" stroke="#007799" stroke-width="2" rx="8"/>
          <text x="290" y="415" font-family="Arial, sans-serif" font-size="14" fill="#666666">Permanent Account Number</text>
          <text x="290" y="445" font-family="Courier, monospace" font-size="30" font-weight="bold" fill="#000000">ABCDE1234F</text>
        </svg>
      `,
    },
    {
      filename: "pan_sample_2_clean.png",
      category: "PAN",
      expectedType: "PAN",
      expectedName: "PRIYA ANAND",
      expectedDocNumber: "BKZPA9876K",
      isDegraded: false,
      svg: `
        <svg width="1000" height="600" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#F2F8F9"/>
          <rect x="20" y="20" width="960" height="560" rx="20" fill="#F2F8F9" stroke="#005577" stroke-width="4"/>
          
          <!-- Header -->
          <text x="500" y="65" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="#002244" text-anchor="middle">INCOME TAX DEPARTMENT</text>
          <text x="500" y="100" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#002244" text-anchor="middle">GOVT OF INDIA</text>
          
          <rect x="60" y="130" width="170" height="210" fill="#DDDDDD" stroke="#999999" stroke-width="2"/>
          
          <text x="270" y="160" font-family="Arial, sans-serif" font-size="15" fill="#666666">Name</text>
          <text x="270" y="195" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="#000000">PRIYA ANAND</text>
          
          <text x="270" y="240" font-family="Arial, sans-serif" font-size="15" fill="#666666">Father's Name</text>
          <text x="270" y="270" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#000000">ANAND VENKATESH</text>
          
          <text x="270" y="315" font-family="Arial, sans-serif" font-size="15" fill="#666666">DOB</text>
          <text x="270" y="345" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#000000">22/11/1997</text>
          
          <text x="270" y="415" font-family="Courier, monospace" font-size="32" font-weight="bold" fill="#000000">BKZPA9876K</text>
          <text x="270" y="445" font-family="Arial, sans-serif" font-size="14" fill="#666666">Permanent Account Number Card</text>
        </svg>
      `,
    },
    {
      filename: "pan_sample_3_degraded_blur.png",
      category: "PAN",
      expectedType: "PAN",
      expectedName: "SURESH BABU",
      expectedDocNumber: "XYZPS5555M",
      isDegraded: true,
      degradedReason: "Heavy Gaussian blur + simulated glare",
      blur: 4.5,
      brightness: 1.4,
      svg: `
        <svg width="1000" height="600" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#E8F4F8"/>
          <text x="500" y="70" font-family="Arial" font-size="24" fill="#003366" text-anchor="middle">INCOME TAX DEPARTMENT</text>
          <text x="280" y="190" font-family="Arial" font-size="22" fill="#000000">SURESH BABU</text>
          <text x="280" y="270" font-family="Arial" font-size="18" fill="#000000">KRISHNAN BABU</text>
          <text x="280" y="340" font-family="Arial" font-size="18" fill="#000000">10/04/1985</text>
          <text x="280" y="420" font-family="Courier" font-size="24" fill="#000000">XYZPS5555M</text>
        </svg>
      `,
    },

    // ----------------------------------------------------
    // PASSPORTS (ICAO 9303 MRZ FORMAT)
    // ----------------------------------------------------
    {
      filename: "passport_sample_1_clean.png",
      category: "PASSPORT",
      expectedType: "PASSPORT",
      expectedName: "VAISHNAVI SUNDARAM",
      expectedDocNumber: "Z8172635",
      isDegraded: false,
      svg: `
        <svg width="1000" height="700" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#FCFBF7"/>
          <rect x="20" y="20" width="960" height="660" fill="#FCFBF7" stroke="#333333" stroke-width="2"/>
          
          <!-- Header -->
          <text x="500" y="60" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#111111" text-anchor="middle">PASSPORT / पासपोर्ट</text>
          <text x="500" y="90" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#111111" text-anchor="middle">REPUBLIC OF INDIA / भारत गणराज्य</text>
          
          <!-- Photo -->
          <rect x="50" y="120" width="180" height="230" fill="#E0E0E0" stroke="#999999" stroke-width="1"/>
          <text x="140" y="240" font-family="Arial" font-size="16" fill="#666666" text-anchor="middle">PHOTO</text>
          
          <!-- Visual Fields -->
          <text x="260" y="145" font-family="Arial" font-size="13" fill="#666666">Type / प्रकार</text>
          <text x="260" y="165" font-family="Arial" font-size="16" font-weight="bold" fill="#000000">P</text>
          
          <text x="360" y="145" font-family="Arial" font-size="13" fill="#666666">Country Code</text>
          <text x="360" y="165" font-family="Arial" font-size="16" font-weight="bold" fill="#000000">IND</text>
          
          <text x="500" y="145" font-family="Arial" font-size="13" fill="#666666">Passport No. / पासपोर्ट क्र.</text>
          <text x="500" y="165" font-family="Arial" font-size="18" font-weight="bold" fill="#000000">Z8172635</text>
          
          <text x="260" y="205" font-family="Arial" font-size="13" fill="#666666">Surname / उपनाम</text>
          <text x="260" y="230" font-family="Arial" font-size="20" font-weight="bold" fill="#000000">SUNDARAM</text>
          
          <text x="260" y="270" font-family="Arial" font-size="13" fill="#666666">Given Name(s) / दिया गया नाम</text>
          <text x="260" y="295" font-family="Arial" font-size="20" font-weight="bold" fill="#000000">VAISHNAVI</text>
          
          <text x="260" y="335" font-family="Arial" font-size="13" fill="#666666">Nationality / राष्ट्रीयता</text>
          <text x="260" y="355" font-family="Arial" font-size="16" font-weight="bold" fill="#000000">INDIAN</text>
          
          <text x="450" y="335" font-family="Arial" font-size="13" fill="#666666">Date of Birth / जन्म तिथि</text>
          <text x="450" y="355" font-family="Arial" font-size="16" font-weight="bold" fill="#000000">14/06/1998</text>
          
          <!-- MRZ Zone (OCR-B Font Standard) -->
          <rect x="40" y="490" width="920" height="150" fill="#FFFFFF" stroke="#CCCCCC" stroke-width="1"/>
          
          <text x="60" y="550" font-family="'Courier New', Courier, monospace" font-size="27" font-weight="bold" letter-spacing="3" fill="#000000">P&lt;INDSUNDARAM&lt;&lt;VAISHNAVI&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</text>
          <text x="60" y="605" font-family="'Courier New', Courier, monospace" font-size="27" font-weight="bold" letter-spacing="3" fill="#000000">Z8172635&lt;4IND9806148F2810156&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;0</text>
        </svg>
      `,
    },
    {
      filename: "passport_sample_2_clean.png",
      category: "PASSPORT",
      expectedType: "PASSPORT",
      expectedName: "ARUN KUMAR VERMA",
      expectedDocNumber: "N4928174",
      isDegraded: false,
      svg: `
        <svg width="1000" height="700" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#FCFBF7"/>
          <text x="500" y="60" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#111111" text-anchor="middle">PASSPORT</text>
          <text x="500" y="90" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#111111" text-anchor="middle">REPUBLIC OF INDIA</text>
          
          <text x="260" y="200" font-family="Arial" font-size="14" fill="#666666">Surname</text>
          <text x="260" y="230" font-family="Arial" font-size="22" font-weight="bold" fill="#000000">VERMA</text>
          
          <text x="260" y="270" font-family="Arial" font-size="14" fill="#666666">Given Names</text>
          <text x="260" y="300" font-family="Arial" font-size="22" font-weight="bold" fill="#000000">ARUN KUMAR</text>
          
          <!-- MRZ Zone -->
          <text x="60" y="550" font-family="'Courier New', Courier, monospace" font-size="27" font-weight="bold" letter-spacing="3" fill="#000000">P&lt;INDVERMA&lt;&lt;ARUN&lt;KUMAR&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</text>
          <text x="60" y="605" font-family="'Courier New', Courier, monospace" font-size="27" font-weight="bold" letter-spacing="3" fill="#000000">N4928174&lt;2IND9402283M3101158&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;4</text>
        </svg>
      `,
    },
    {
      filename: "passport_sample_3_degraded_cut_mrz.png",
      category: "PASSPORT",
      expectedType: "PASSPORT",
      expectedName: "UNKNOWN",
      expectedDocNumber: undefined,
      isDegraded: true,
      degradedReason: "Cutoff/cropped MRZ missing lines + heavy blur",
      blur: 3.5,
      svg: `
        <svg width="1000" height="400" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#EAEAEA"/>
          <text x="500" y="80" font-family="Arial" font-size="20" fill="#333333" text-anchor="middle">PASSPORT / REPUBLIC OF INDIA</text>
          <!-- Incomplete corrupted fragment -->
          <text x="60" y="250" font-family="Courier" font-size="20" fill="#999999">P&lt;XXXX&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</text>
        </svg>
      `,
    },

    // ----------------------------------------------------
    // AADHAAR CARDS
    // ----------------------------------------------------
    {
      filename: "aadhaar_sample_1_clean.png",
      category: "AADHAAR",
      expectedType: "AADHAAR",
      expectedName: "KAVITHA SUBRAMANIAN",
      expectedDocNumber: "778822906503",
      isDegraded: false,
      svg: `
        <svg width="1000" height="600" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#FFFFFF"/>
          <rect x="20" y="20" width="960" height="560" rx="10" fill="#FFFFFF" stroke="#EE8800" stroke-width="3"/>
          
          <text x="500" y="70" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#003366" text-anchor="middle">UNIQUE IDENTIFICATION AUTHORITY OF INDIA</text>
          <text x="500" y="100" font-family="Arial, sans-serif" font-size="18" fill="#333333" text-anchor="middle">GOVERNMENT OF INDIA</text>
          
          <rect x="60" y="140" width="180" height="220" fill="#E8E8E8" stroke="#CCCCCC" stroke-width="2"/>
          
          <text x="280" y="190" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="#000000">KAVITHA SUBRAMANIAN</text>
          <text x="280" y="235" font-family="Arial, sans-serif" font-size="18" fill="#333333">DOB: 12/03/1995</text>
          <text x="280" y="275" font-family="Arial, sans-serif" font-size="18" fill="#333333">Female / महिला</text>
          
          <text x="500" y="440" font-family="Arial, sans-serif" font-size="34" font-weight="bold" letter-spacing="4" fill="#000000" text-anchor="middle">7788 2290 6503</text>
          <text x="500" y="485" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#EE8800" text-anchor="middle">मेरा आधार, मेरी पहचान</text>
        </svg>
      `,
    },

    // ----------------------------------------------------
    // UNKNOWN / NON-ID DOCUMENT
    // ----------------------------------------------------
    {
      filename: "unknown_grocery_receipt.png",
      category: "UNKNOWN",
      expectedType: "UNKNOWN",
      expectedName: "UNKNOWN",
      isDegraded: false,
      degradedReason: "Random utility invoice receipt — should classify as UNKNOWN",
      svg: `
        <svg width="600" height="800" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#FFFDE8"/>
          <text x="300" y="80" font-family="Courier, monospace" font-size="24" font-weight="bold" fill="#000000" text-anchor="middle">SUPERMARKET MART</text>
          <text x="300" y="120" font-family="Courier, monospace" font-size="16" fill="#333333" text-anchor="middle">INVOICE #982347</text>
          <text x="80" y="200" font-family="Courier, monospace" font-size="16" fill="#000000">1. Milk 1L ........... $2.50</text>
          <text x="80" y="240" font-family="Courier, monospace" font-size="16" fill="#000000">2. Organic Bread ..... $3.20</text>
          <text x="80" y="280" font-family="Courier, monospace" font-size="16" fill="#000000">3. Apples 1kg ........ $4.00</text>
          <text x="80" y="360" font-family="Courier, monospace" font-size="20" font-weight="bold" fill="#000000">TOTAL: $9.70</text>
          <text x="300" y="460" font-family="Courier, monospace" font-size="16" fill="#555555" text-anchor="middle">THANK YOU FOR SHOPPING</text>
        </svg>
      `,
    },
  ];

  const results = [];
  for (const item of items) {
    const svgBuffer = Buffer.from(item.svg);
    let pipeline = sharp(svgBuffer).png();
    if (item.blur) {
      pipeline = pipeline.blur(item.blur);
    }
    if (item.brightness) {
      pipeline = pipeline.modulate({ brightness: item.brightness });
    }
    const pngBuffer = await pipeline.toBuffer();
    const filePath = path.join(samplesDir, item.filename);
    fs.writeFileSync(filePath, pngBuffer);

    results.push({
      filename: item.filename,
      category: item.category,
      expectedType: item.expectedType,
      expectedName: item.expectedName,
      expectedDocNumber: item.expectedDocNumber,
      isDegraded: item.isDegraded,
      degradedReason: item.degradedReason,
      buffer: pngBuffer,
    });
  }

  return results;
}

/**
 * Execute real OCR Benchmark suite and generate validation tables.
 */
async function runBenchmark() {
  console.log(`\n========================================================================`);
  console.log(`  MULTI-DOCUMENT OCR BENCHMARK & REAL TEST SUITE (PAN, PASSPORT, AADHAAR)`);
  console.log(`========================================================================\n`);

  console.log(`Generating high-fidelity test samples for PAN, Passport, and Aadhaar...`);
  const samples = await generateTestImages();
  console.log(`Generated ${samples.length} real image samples (Clean + Degraded stress test cases).\n`);

  const ocrEngine = new OcrEngineService();
  const classifier = new DocumentClassifierService();
  const documentOcrService = new DocumentOcrService(ocrEngine, classifier);
  const nameMatcher = new NameMatchService();

  const results: any[] = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    console.log(`------------------------------------------------------------------------`);
    console.log(`[TEST ${i + 1}/${samples.length}] File: ${s.filename} | Expected Category: ${s.category}`);
    if (s.isDegraded) {
      console.log(`  ⚠️ Degraded Stress Case: ${s.degradedReason}`);
    }

    const t0 = Date.now();
    const ocrRes = await documentOcrService.parseDocument(s.buffer);
    const elapsed = Date.now() - t0;

    let nameMatchRes: { matched: boolean; similarity: number } = { matched: false, similarity: 0 };
    if (ocrRes.extractedName && s.expectedName && s.expectedName !== "UNKNOWN") {
      nameMatchRes = nameMatcher.compareNames(s.expectedName, ocrRes.extractedName);
    }

    const typeMatch = ocrRes.documentType === s.expectedType;
    const docNoMatch = !s.expectedDocNumber || ocrRes.documentNumber === s.expectedDocNumber;
    let isSuccess = false;
    if (s.expectedType === "UNKNOWN") {
      isSuccess = ocrRes.documentType === "UNKNOWN" || ocrRes.confidence <= 0.3;
    } else if (s.isDegraded) {
      isSuccess = ocrRes.confidence < 0.6 || ocrRes.documentType === "UNKNOWN" || typeMatch;
    } else {
      isSuccess = typeMatch && (nameMatchRes.matched || (ocrRes.extractedName && s.expectedName.toUpperCase().includes(ocrRes.extractedName.toUpperCase())));
    }

    console.log(`  » Detected Doc Type : ${ocrRes.documentType} (Expected: ${s.expectedType}) [${typeMatch ? "✓ PASS" : "✗ FAIL"}]`);
    console.log(`  » Extracted Name    : "${ocrRes.extractedName || "NONE"}" (Expected: "${s.expectedName}")`);
    console.log(`  » Document Number   : "${ocrRes.documentNumber || "NONE"}" (Expected: "${s.expectedDocNumber || "N/A"}")`);
    console.log(`  » DOB Extracted     : "${ocrRes.dob || "NONE"}"`);
    console.log(`  » Name Similarity   : ${(nameMatchRes.similarity * 100).toFixed(1)}% (Matched: ${nameMatchRes.matched ? "YES" : "NO"})`);
    console.log(`  » Confidence Score  : ${(ocrRes.confidence * 100).toFixed(0)}%`);
    console.log(`  » Processing Time   : ${elapsed}ms`);
    console.log(`  » Raw OCR Snippet   : ${ocrRes.rawText.replace(/[\r\n]+/g, " ").substring(0, 90)}...`);

    results.push({
      filename: s.filename,
      category: s.category,
      expectedType: s.expectedType,
      detectedType: ocrRes.documentType,
      typeMatch,
      expectedName: s.expectedName,
      extractedName: ocrRes.extractedName || "—",
      nameSimilarity: nameMatchRes.similarity,
      nameMatched: nameMatchRes.matched,
      documentNumber: ocrRes.documentNumber || "—",
      dob: ocrRes.dob || "—",
      confidence: ocrRes.confidence,
      isDegraded: s.isDegraded,
      degradedReason: s.degradedReason || "Clean image",
      overallStatus: isSuccess ? "PASS" : "FAIL",
      elapsedMs: elapsed,
      rawOcrText: ocrRes.rawText,
    });
  }

  console.log(`\n========================================================================`);
  console.log(`                         SUMMARY BENCHMARK TABLE`);
  console.log(`========================================================================\n`);

  console.table(
    results.map((r) => ({
      File: r.filename,
      Expected: r.expectedType,
      Detected: r.detectedType,
      "Extracted Name": r.extractedName,
      "Expected Name": r.expectedName,
      "Sim %": `${(r.nameSimilarity * 100).toFixed(0)}%`,
      "Doc Number": r.documentNumber,
      Confidence: `${(r.confidence * 100).toFixed(0)}%`,
      Status: r.overallStatus,
    })),
  );

  // Write full JSON output report for audit
  fs.writeFileSync(
    path.join(__dirname, "../test-samples/benchmark-results.json"),
    JSON.stringify(results, null, 2),
  );

  console.log(`\n✓ Full benchmark results exported to test-samples/benchmark-results.json\n`);
}

runBenchmark().catch((err) => {
  console.error("Benchmark failed with error:", err);
  process.exit(1);
});
