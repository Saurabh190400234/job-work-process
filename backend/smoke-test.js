const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const BASE_URL = process.env.API_BASE || "http://127.0.0.1:5000/api";

let token = "";

async function login() {
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    throw new Error("ADMIN_PASSWORD missing for smoke test");
  }

  const response = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.token) {
    throw new Error(data.message || "Login failed for smoke test");
  }

  token = data.token;
  console.log("OK /login");
}

async function check(path, validate) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${data.message || "Request failed"}`);
  }

  validate?.(data);
  console.log(`OK ${path}`);
  return data;
}

(async () => {
  await login();

  await check("/test-db", (data) => {
    if (!data.success) {
      throw new Error("Database check failed");
    }
  });

  await check("/state", (data) => {
    [
      "vendors",
      "customers",
      "productMasters",
      "bosGrns",
      "lots",
      "vendorEndGrns",
      "vendorProductions",
      "schedules",
      "sales",
    ].forEach((key) => {
      if (!Array.isArray(data[key])) {
        throw new Error(`State field ${key} is not an array`);
      }
    });
  });
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});