import axios from "axios";
import FormData from "form-data";

const API_URL = "http://localhost:3001/api/v1/proctoring/session/d58c2ef4-e546-4a17-947c-77f47adfc651/upload";

async function main() {
  console.log("🚀 Testing POST /api/v1/proctoring/session/{sessionId}/upload...");

  // Generate 1KB dummy WebM buffer
  const sampleBuffer = Buffer.alloc(1024, "mock-webm-video-content");

  const form = new FormData();
  form.append("file", sampleBuffer, {
    filename: "phone_detected_1784538900.webm",
    contentType: "video/webm",
  });

  try {
    const res = await axios.post(API_URL, form, {
      headers: form.getHeaders(),
    });
    console.log(`STATUS: ${res.status}`);
    console.log(`RESPONSE: ${JSON.stringify(res.data)}`);
  } catch (err: any) {
    console.error("ERROR during file upload:", err?.response?.status, err?.response?.data || err.message);
  }
}

main();
