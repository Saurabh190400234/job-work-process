const BASE_URL = process.env.API_BASE || "http://127.0.0.1:5000/api";

async function check(path, validate) {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  const data = await response.json();
  validate?.(data);
  console.log(`OK ${path}`);
  return data;
}

(async () => {
  await check("/test-db", (data) => {
    if (!data.success) throw new Error("Database check failed");
  });
  await check("/state", (data) => {
    ["vendors", "customers", "productMasters", "bosGrns", "lots", "vendorEndGrns", "vendorProductions", "schedules", "sales"].forEach((key) => {
      if (!Array.isArray(data[key])) throw new Error(`State field ${key} is not an array`);
    });
  });
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
