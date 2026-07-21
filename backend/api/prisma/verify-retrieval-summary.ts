import axios from "axios";

const SESSION_ID = "d58c2ef4-e546-4a17-947c-77f47adfc651";
const GET_EVENTS_URL = `http://localhost:3001/api/v1/proctoring/session/${SESSION_ID}`;
const GET_SUMMARY_URL = `http://localhost:3001/api/v1/proctoring/session/${SESSION_ID}/summary`;

async function main() {
  console.log("🚀 Phase 7: Testing GET /api/v1/proctoring/session/{sessionId}...");
  try {
    const res = await axios.get(GET_EVENTS_URL);
    console.log(`STATUS: ${res.status}`);
    console.log(`EVENTS RETRIEVED (${res.data.length} items):`);
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error("ERROR retrieving events:", err?.response?.status, err?.response?.data || err.message);
  }

  console.log("\n🚀 Phase 8: Testing GET /api/v1/proctoring/session/{sessionId}/summary...");
  try {
    const res = await axios.get(GET_SUMMARY_URL);
    console.log(`STATUS: ${res.status}`);
    console.log("SUMMARY RESPONSE:");
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error("ERROR retrieving summary:", err?.response?.status, err?.response?.data || err.message);
  }
}

main();
