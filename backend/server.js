require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const pool = require("./db");

const DOCUMENT_FIELDS = {
  panCard: "pan_card_url",
  aadharCard: "aadhar_card_url",
  cancelCheque: "cancel_cheque_url",
  gstDoc: "gst_url",
  otherDoc: "other_doc_url",
};

const uploadDocs = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = [".pdf", ".jpg", ".jpeg", ".png"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(allowed.includes(ext) ? null : new Error("Only PDF/JPG/PNG files allowed"), allowed.includes(ext));
  },
}).fields([
  { name: "panCard", maxCount: 1 },
  { name: "aadharCard", maxCount: 1 },
  { name: "cancelCheque", maxCount: 1 },
  { name: "gstDoc", maxCount: 1 },
  { name: "otherDoc", maxCount: 1 },
]);

const app = express();
const publicDir = path.join(__dirname, "..");

async function ensureSchema() {
  await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendors (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_name text NOT NULL UNIQUE,
      city text DEFAULT '',
      contact text DEFAULT '',
      is_active boolean DEFAULT true,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_name text NOT NULL UNIQUE,
      city text DEFAULT '',
      contact text DEFAULT '',
      is_active boolean DEFAULT true,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_masters (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bpcs_no text NOT NULL,
      vendor_name text NOT NULL,
      shape text NOT NULL,
      grade text NOT NULL,
      size_mm numeric NOT NULL,
      input_weight_kg numeric NOT NULL,
      net_input_weight_kg numeric NOT NULL,
      is_active boolean DEFAULT true,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (bpcs_no, vendor_name)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS raw_materials (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code text NOT NULL UNIQUE,
      description text DEFAULT '',
      shape text DEFAULT '',
      grade text DEFAULT '',
      size_mm numeric,
      stock_kg numeric DEFAULT 0,
      fixed_kg numeric DEFAULT 0,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bos_grns (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      supplier_invoice text NOT NULL,
      product_id uuid,
      component_code text NOT NULL,
      vendor_name text NOT NULL,
      grn_date date NOT NULL,
      qty_mt numeric NOT NULL,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_end_grns (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bos_grn_id uuid,
      lot_no text,
      received_date date NOT NULL,
      received_mt numeric NOT NULL,
      remarks text DEFAULT '',
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_work_lots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bos_grn_id uuid,
      lot_no text NOT NULL UNIQUE,
      vendor text NOT NULL,
      component_code text NOT NULL,
      issue_date date NOT NULL,
      raw_issued_kg numeric NOT NULL,
      output_stage text DEFAULT 'finished',
      produced_qty numeric DEFAULT 0,
      scrap_kg numeric DEFAULT 0,
      end_cut_kg numeric DEFAULT 0,
      balance_raw_kg numeric DEFAULT 0,
      receipt_date date,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_productions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lot_no text,
      component_code text NOT NULL,
      production_date date NOT NULL,
      semi_finished_pieces numeric DEFAULT 0,
      scrap_mt numeric DEFAULT 0,
      remarks text DEFAULT '',
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_schedules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      customer text NOT NULL,
      component_code text NOT NULL,
      due_date date NOT NULL,
      required_qty numeric NOT NULL,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query("ALTER TABLE vendor_productions ADD COLUMN IF NOT EXISTS lot_no text");
  await pool.query("ALTER TABLE vendor_end_grns DROP CONSTRAINT IF EXISTS vendor_end_grns_bos_grn_id_fkey");
  await pool.query("ALTER TABLE vendor_end_grns ADD COLUMN IF NOT EXISTS lot_no text");
  await pool.query(`
    UPDATE vendor_end_grns
    SET lot_no = bos_grn_id
    WHERE lot_no IS NULL
      AND bos_grn_id IS NOT NULL
      AND bos_grn_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  `);
  await pool.query(`
    UPDATE vendor_end_grns
    SET bos_grn_id = NULL
    WHERE bos_grn_id IS NOT NULL
      AND bos_grn_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  `);
  await pool.query("ALTER TABLE vendor_end_grns ALTER COLUMN bos_grn_id TYPE uuid USING bos_grn_id::uuid");
  await pool.query("ALTER TABLE job_work_lots ADD COLUMN IF NOT EXISTS bos_grn_id uuid");
  await pool.query("ALTER TABLE job_work_lots ADD COLUMN IF NOT EXISTS end_cut_kg numeric DEFAULT 0");
  await pool.query("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS full_address text DEFAULT ''");
  await pool.query("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS pan_card_url text DEFAULT ''");
  await pool.query("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS aadhar_card_url text DEFAULT ''");
  await pool.query("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS cancel_cheque_url text DEFAULT ''");
  await pool.query("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS gst_url text DEFAULT ''");
  await pool.query("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS other_doc_url text DEFAULT ''");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_documents (
      vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      field_name text NOT NULL,
      file_name text NOT NULL,
      mime_type text NOT NULL,
      data bytea NOT NULL,
      updated_at timestamp DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (vendor_id, field_name)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_sales (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      customer text NOT NULL,
      component_code text NOT NULL,
      sale_date date NOT NULL,
      invoice_no text NOT NULL,
      sold_qty numeric NOT NULL,
      rate_per_piece numeric DEFAULT 0,
      remarks text DEFAULT '',
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    INSERT INTO vendor_end_grns (bos_grn_id, lot_no, received_date, received_mt, remarks)
    SELECT l.bos_grn_id, l.lot_no, COALESCE(l.receipt_date, l.issue_date),
      l.raw_issued_kg / 1000,
      'Auto-created for existing components-ready lot during flow repair'
    FROM job_work_lots l
    WHERE l.receipt_date IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM vendor_end_grns v
        WHERE v.lot_no = l.lot_no
      )
  `);
}

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    try {
      const url = new URL(origin);
      const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
      const isRender = url.hostname.endsWith(".onrender.com");
      return callback(isLocal || isRender ? null : new Error(`CORS blocked for origin: ${origin}`), isLocal || isRender);
    } catch {
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: "2mb" }));

function cleanText(value) {
  return String(value ?? "").trim();
}

function upperText(value) {
  return cleanText(value).toUpperCase();
}

function toNumber(value, fieldName, min = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min) {
    const error = new Error(`${fieldName} must be a valid number`);
    error.status = 400;
    throw error;
  }
  return number;
}

function requiredText(value, fieldName) {
  const text = cleanText(value);
  if (!text) {
    const error = new Error(`${fieldName} is required`);
    error.status = 400;
    throw error;
  }
  return text;
}

function asyncHandler(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error(error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Request failed",
      });
    }
  };
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function upsertRawMaterial(client, product) {
  const rawCode = `${product.shape}-${product.grade}-${product.sizeMm}`.toUpperCase();
  await client.query(
    `
    INSERT INTO raw_materials (code, description, shape, grade, size_mm, stock_kg, fixed_kg)
    VALUES ($1, $2, $3, $4, $5, 0, 0)
    ON CONFLICT (code)
    DO UPDATE SET
      description = EXCLUDED.description,
      shape = EXCLUDED.shape,
      grade = EXCLUDED.grade,
      size_mm = EXCLUDED.size_mm
    `,
    [rawCode, `${product.shape} ${product.grade} ${product.sizeMm}mm`, product.shape, product.grade, product.sizeMm],
  );
}

app.get("/api/test-db", asyncHandler(async (req, res) => {
  const result = await pool.query("SELECT NOW() AS current_time");
  res.json({
    success: true,
    message: "PostgreSQL connected successfully",
    time: result.rows[0].current_time,
  });
}));

app.get("/api/state", asyncHandler(async (req, res) => {
  const [
    vendors,
    customers,
    productMasters,
    rawMaterials,
    bosGrns,
    vendorEndGrns,
    lots,
    vendorProductions,
    schedules,
    sales,
  ] = await Promise.all([
    pool.query(`
      SELECT id, vendor_name AS "vendorName", city, contact, full_address AS "fullAddress",
        pan_card_url AS "panCardUrl", aadhar_card_url AS "aadharCardUrl",
        cancel_cheque_url AS "cancelChequeUrl", gst_url AS "gstUrl", other_doc_url AS "otherDocUrl"
      FROM vendors
      WHERE is_active = true
      ORDER BY vendor_name
    `),
    pool.query(`
      SELECT id, customer_name AS "customerName", city, contact
      FROM customers
      WHERE is_active = true
      ORDER BY customer_name
    `),
    pool.query(`
      SELECT id, bpcs_no AS "bpcsNo", vendor_name AS "vendorName", shape, grade,
        size_mm AS "sizeMm", input_weight_kg AS "inputWeightKg",
        net_input_weight_kg AS "netInputWeightKg"
      FROM product_masters
      WHERE is_active = true
      ORDER BY bpcs_no, vendor_name
    `),
    pool.query(`
      SELECT code, description, stock_kg AS "stockKg", fixed_kg AS "fixedKg"
      FROM raw_materials
      ORDER BY code
    `),
    pool.query(`
      SELECT id, supplier_invoice AS "supplierInvoice", product_id AS "productId",
        component_code AS "componentCode", vendor_name AS "vendorName",
        grn_date AS "grnDate", qty_mt AS "qtyMt"
      FROM bos_grns
      ORDER BY grn_date DESC, created_at DESC
    `),
    pool.query(`
      SELECT id, bos_grn_id AS "bosGrnId", lot_no AS "lotNo", received_date AS "grnDate",
        received_mt AS "receivedMt", remarks
      FROM vendor_end_grns
      ORDER BY received_date DESC, created_at DESC
    `),
    pool.query(`
      SELECT id, bos_grn_id AS "bosGrnId", lot_no AS "lotNo", vendor, component_code AS "componentCode",
        issue_date AS "issueDate", raw_issued_kg AS "rawIssuedKg",
        output_stage AS "outputStage", produced_qty AS "producedQty",
        scrap_kg AS "scrapKg", end_cut_kg AS "endCutKg", balance_raw_kg AS "balanceRawKg",
        receipt_date AS "receiptDate"
      FROM job_work_lots
      ORDER BY issue_date DESC, created_at DESC
    `),
    pool.query(`
      SELECT id, component_code AS "componentCode", production_date AS "productionDate",
        lot_no AS "lotNo",
        semi_finished_pieces AS "semiFinishedPieces",
        scrap_mt AS "scrapMt", remarks
      FROM vendor_productions
      ORDER BY production_date DESC, created_at DESC
    `),
    pool.query(`
      SELECT id, customer, component_code AS "componentCode", due_date AS "dueDate",
        required_qty AS "requiredQty"
      FROM customer_schedules
      ORDER BY due_date ASC
    `),
    pool.query(`
      SELECT id, customer, component_code AS "componentCode", sale_date AS "saleDate",
        invoice_no AS "invoiceNo", sold_qty AS "soldQty", rate_per_piece AS "ratePerPiece", remarks
      FROM customer_sales
      ORDER BY sale_date DESC, created_at DESC
    `),
  ]);

  res.json({
    vendors: vendors.rows,
    customers: customers.rows,
    productMasters: productMasters.rows,
    rawMaterials: rawMaterials.rows,
    bosGrns: bosGrns.rows,
    vendorEndGrns: vendorEndGrns.rows,
    lots: lots.rows,
    vendorProductions: vendorProductions.rows,
    schedules: schedules.rows,
    sales: sales.rows,
    components: [],
  });
}));

app.post("/api/vendors", asyncHandler(async (req, res) => {
  const vendorName = upperText(requiredText(req.body.vendorName, "Vendor name"));
  const city = cleanText(req.body.city);
  const contact = cleanText(req.body.contact);
  const fullAddress = cleanText(req.body.fullAddress);
  const result = await pool.query(
    `
    INSERT INTO vendors (vendor_name, city, contact, full_address)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (vendor_name)
    DO UPDATE SET city = EXCLUDED.city, contact = EXCLUDED.contact,
      full_address = EXCLUDED.full_address, is_active = true
    RETURNING id, vendor_name AS "vendorName", city, contact, full_address AS "fullAddress",
      pan_card_url AS "panCardUrl", aadhar_card_url AS "aadharCardUrl",
      cancel_cheque_url AS "cancelChequeUrl", gst_url AS "gstUrl", other_doc_url AS "otherDocUrl"
    `,
    [vendorName, city, contact, fullAddress],
  );
  res.json({ success: true, vendor: result.rows[0] });
}));

app.post("/api/vendors/:id/documents", (req, res, next) => {
  uploadDocs(req, res, async (err) => {
    if (err) return next(err);
    try {
      const updates = {};
      for (const [fieldName, columnName] of Object.entries(DOCUMENT_FIELDS)) {
        const file = req.files?.[fieldName]?.[0];
        if (!file) continue;

        await pool.query(
          `
          INSERT INTO vendor_documents (vendor_id, field_name, file_name, mime_type, data, updated_at)
          VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          ON CONFLICT (vendor_id, field_name)
          DO UPDATE SET
            file_name = EXCLUDED.file_name,
            mime_type = EXCLUDED.mime_type,
            data = EXCLUDED.data,
            updated_at = CURRENT_TIMESTAMP
          `,
          [req.params.id, fieldName, file.originalname, file.mimetype, file.buffer],
        );
        updates[columnName] = `/api/vendors/${req.params.id}/documents/${fieldName}`;
      }

      if (Object.keys(updates).length === 0) return res.json({ success: true });

      const setClauses = Object.keys(updates).map((col, i) => `${col} = $${i + 2}`).join(", ");
      const values = [req.params.id, ...Object.values(updates)];
      await pool.query(`UPDATE vendors SET ${setClauses} WHERE id = $1`, values);
      res.json({ success: true });
    } catch (dbErr) {
      next(dbErr);
    }
  });
});

app.get("/api/vendors/:id/documents/:fieldName", asyncHandler(async (req, res) => {
  if (!DOCUMENT_FIELDS[req.params.fieldName]) {
    const error = new Error("Document field not found");
    error.status = 404;
    throw error;
  }

  const result = await pool.query(
    `
    SELECT file_name AS "fileName", mime_type AS "mimeType", data
    FROM vendor_documents
    WHERE vendor_id = $1 AND field_name = $2
    `,
    [req.params.id, req.params.fieldName],
  );
  if (!result.rowCount) {
    const error = new Error("Document not found");
    error.status = 404;
    throw error;
  }

  const doc = result.rows[0];
  const safeName = cleanText(doc.fileName).replace(/["\r\n]/g, "") || "document";
  res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
  res.send(doc.data);
}));

app.post("/api/customers", asyncHandler(async (req, res) => {
  const customerName = upperText(requiredText(req.body.customerName, "Customer name"));
  const city = cleanText(req.body.city);
  const contact = cleanText(req.body.contact);
  const result = await pool.query(
    `
    INSERT INTO customers (customer_name, city, contact)
    VALUES ($1, $2, $3)
    ON CONFLICT (customer_name)
    DO UPDATE SET city = EXCLUDED.city, contact = EXCLUDED.contact, is_active = true
    RETURNING id, customer_name AS "customerName", city, contact
    `,
    [customerName, city, contact],
  );
  res.json({ success: true, customer: result.rows[0] });
}));

app.post("/api/products", asyncHandler(async (req, res) => {
  const product = {
    bpcsNo: upperText(requiredText(req.body.bpcsNo, "BPCS No")),
    vendorName: upperText(requiredText(req.body.vendorName, "Vendor name")),
    shape: upperText(requiredText(req.body.shape, "Shape")),
    grade: upperText(requiredText(req.body.grade, "Grade")),
    sizeMm: toNumber(req.body.sizeMm, "Size", 0.01),
    inputWeightKg: toNumber(req.body.inputWeightKg, "Input weight", 0.001),
    netInputWeightKg: toNumber(req.body.netInputWeightKg, "Net input weight", 0.001),
  };

  const result = await withTransaction(async (client) => {
    const saved = await client.query(
      `
      INSERT INTO product_masters
        (bpcs_no, vendor_name, shape, grade, size_mm, input_weight_kg, net_input_weight_kg)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (bpcs_no, vendor_name)
      DO UPDATE SET
        shape = EXCLUDED.shape,
        grade = EXCLUDED.grade,
        size_mm = EXCLUDED.size_mm,
        input_weight_kg = EXCLUDED.input_weight_kg,
        net_input_weight_kg = EXCLUDED.net_input_weight_kg,
        is_active = true
      RETURNING id, bpcs_no AS "bpcsNo", vendor_name AS "vendorName", shape, grade,
        size_mm AS "sizeMm", input_weight_kg AS "inputWeightKg",
        net_input_weight_kg AS "netInputWeightKg"
      `,
      [
        product.bpcsNo,
        product.vendorName,
        product.shape,
        product.grade,
        product.sizeMm,
        product.inputWeightKg,
        product.netInputWeightKg,
      ],
    );
    await upsertRawMaterial(client, product);
    return saved;
  });

  res.json({ success: true, product: result.rows[0] });
}));

app.post("/api/bos-grns", asyncHandler(async (req, res) => {
  const result = await pool.query(
    `
    INSERT INTO bos_grns (supplier_invoice, product_id, component_code, vendor_name, grn_date, qty_mt)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
    `,
    [
      upperText(requiredText(req.body.supplierInvoice, "Supplier invoice")),
      cleanText(req.body.productId) || null,
      upperText(requiredText(req.body.componentCode, "Component code")),
      upperText(requiredText(req.body.vendorName, "Vendor name")),
      requiredText(req.body.grnDate, "GRN date"),
      toNumber(req.body.qtyMt, "Qty MT", 0.001),
    ],
  );
  res.json({ success: true, id: result.rows[0].id });
}));

app.post("/api/vendor-end-grns", asyncHandler(async (req, res) => {
  const lotNo = upperText(requiredText(req.body.lotNo || req.body.bosGrnId, "Job Work assignment"));
  const receivedMt = toNumber(req.body.receivedMt, "Received MT", 0.001);

  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lotNo]);
    const lot = await client.query("SELECT bos_grn_id, raw_issued_kg FROM job_work_lots WHERE lot_no = $1", [lotNo]);
    if (!lot.rowCount) {
      const error = new Error("Job Work assignment not found");
      error.status = 404;
      throw error;
    }
    const received = await client.query(
      "SELECT COALESCE(SUM(received_mt), 0) AS total FROM vendor_end_grns WHERE lot_no = $1",
      [lotNo],
    );
    const issuedMt = Number(lot.rows[0].raw_issued_kg || 0) / 1000;
    if (Number(received.rows[0].total) + receivedMt > issuedMt) {
      const error = new Error("Vendor GRN received MT cannot exceed assigned material MT");
      error.status = 400;
      throw error;
    }
    await client.query(
      `
      INSERT INTO vendor_end_grns (bos_grn_id, lot_no, received_date, received_mt, remarks)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [lot.rows[0].bos_grn_id, lotNo, requiredText(req.body.grnDate, "Vendor GRN date"), receivedMt, cleanText(req.body.remarks)],
    );
  });

  res.json({ success: true });
}));

app.post("/api/job-work-lots", asyncHandler(async (req, res) => {
  const lotNo = upperText(requiredText(req.body.lotNo, "Lot no"));
  const bosGrnId = requiredText(req.body.bosGrnId, "BOS GRN");
  const vendor = upperText(requiredText(req.body.vendor, "Vendor"));
  const componentCode = upperText(requiredText(req.body.componentCode, "Component code"));
  const issueDate = requiredText(req.body.issueDate, "Issue date");
  const rawIssuedKg = toNumber(req.body.rawIssuedKg, "Raw issued KG", 0.001);
  const outputStage = ["semi", "finished"].includes(req.body.outputStage) ? req.body.outputStage : "finished";

  const id = await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [bosGrnId]);

    const grn = await client.query(
      "SELECT component_code, vendor_name, qty_mt FROM bos_grns WHERE id = $1",
      [bosGrnId],
    );
    if (!grn.rowCount) {
      const error = new Error("BOS GRN not found");
      error.status = 404;
      throw error;
    }
    if (upperText(grn.rows[0].component_code) !== componentCode) {
      const error = new Error("Selected component does not match BOS GRN");
      error.status = 400;
      throw error;
    }
    if (upperText(grn.rows[0].vendor_name) !== vendor) {
      const error = new Error("Selected vendor does not match BOS GRN");
      error.status = 400;
      throw error;
    }
    const assigned = await client.query(
      "SELECT COALESCE(SUM(raw_issued_kg), 0) AS total_kg FROM job_work_lots WHERE bos_grn_id = $1",
      [bosGrnId],
    );

    const receivedKg = Number(grn.rows[0].qty_mt || 0) * 1000;
    const assignedKg = Number(assigned.rows[0].total_kg || 0);
    const balanceKg = receivedKg - assignedKg;

    if (rawIssuedKg > balanceKg + 0.001) {
      const error = new Error(`Job Work issue cannot exceed BOS GRN balance. Available ${(Math.max(balanceKg, 0) / 1000).toFixed(3)} MT`);
      error.status = 400;
      throw error;
    }

    const result = await client.query(
      `
      INSERT INTO job_work_lots
        (bos_grn_id, lot_no, vendor, component_code, issue_date, raw_issued_kg, output_stage)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
      `,
      [bosGrnId, lotNo, vendor, componentCode, issueDate, rawIssuedKg, outputStage],
    );
    return result.rows[0].id;
  });

  res.json({ success: true, id });
}));

app.put("/api/job-work-lots/:lotNo/receipt", asyncHandler(async (req, res) => {
  const producedQty = toNumber(req.body.producedQty, "Produced qty");
  const endCutKg = toNumber(req.body.endCutKg ?? req.body.scrapKg ?? 0, "End cut KG");
  const receiptDate = requiredText(req.body.receiptDate, "Receipt date");
  const lotNo = upperText(req.params.lotNo);

  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lotNo]);
    const lot = await client.query(
      `
      SELECT l.raw_issued_kg, l.component_code, COALESCE(l.produced_qty, 0) AS produced_qty,
        COALESCE(l.end_cut_kg, 0) AS end_cut_kg, p.net_input_weight_kg,
        COALESCE(SUM(v.received_mt), 0) AS vendor_received_mt
      FROM job_work_lots l
      LEFT JOIN product_masters p
        ON p.bpcs_no = l.component_code
        AND p.vendor_name = l.vendor
        AND p.is_active = true
      LEFT JOIN vendor_end_grns v ON v.lot_no = l.lot_no
      WHERE l.lot_no = $1
      GROUP BY l.raw_issued_kg, l.component_code, l.produced_qty, l.end_cut_kg, p.net_input_weight_kg
      LIMIT 1
      `,
      [lotNo],
    );
    if (!lot.rowCount) {
      const error = new Error("Job work lot not found");
      error.status = 404;
      throw error;
    }

    const row = lot.rows[0];
    const receivedKg = Number(row.vendor_received_mt || 0) * 1000;
    if (receivedKg <= 0) {
      const error = new Error("Vendor GRN must be confirmed before Components Ready");
      error.status = 400;
      throw error;
    }

    const usableRawKg = Math.min(Number(row.raw_issued_kg || 0), receivedKg);
    const currentEndCutKg = Number(row.end_cut_kg || 0);
    if (currentEndCutKg + endCutKg > usableRawKg) {
      const error = new Error("Total end cut KG cannot exceed vendor received raw material");
      error.status = 400;
      throw error;
    }

    const netInputWeightKg = Number(row.net_input_weight_kg || 0);
    if (netInputWeightKg > 0) {
      const expectedQty = Math.floor(usableRawKg / netInputWeightKg);
      const currentProducedQty = Number(row.produced_qty || 0);
      if (currentProducedQty + producedQty > expectedQty) {
        const error = new Error(`Finished qty cannot exceed remaining ${Math.max(expectedQty - currentProducedQty, 0)} pcs`);
        error.status = 400;
        throw error;
      }
    }

    const result = await client.query(
      `
      UPDATE job_work_lots
      SET receipt_date = $2,
        produced_qty = COALESCE(produced_qty, 0) + $3,
        output_stage = $4,
        end_cut_kg = COALESCE(end_cut_kg, 0) + $5,
        balance_raw_kg = $6
      WHERE lot_no = $1
      RETURNING id
      `,
      [
        lotNo,
        receiptDate,
        producedQty,
        ["semi", "finished"].includes(req.body.outputStage) ? req.body.outputStage : "finished",
        endCutKg,
        toNumber(req.body.balanceRawKg, "Balance raw KG"),
      ],
    );
    if (!result.rowCount) {
      const error = new Error("Job work lot not found");
      error.status = 404;
      throw error;
    }
  });
  res.json({ success: true });
}));

app.post("/api/vendor-productions", asyncHandler(async (req, res) => {
  const lotNo = upperText(requiredText(req.body.lotNo, "Lot no"));
  const componentCode = upperText(requiredText(req.body.componentCode, "Component code"));
  const semiFinishedPieces = toNumber(req.body.semiFinishedPieces, "Semi finished pieces");

  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lotNo]);
    const lot = await client.query(
      `
      SELECT l.raw_issued_kg, p.net_input_weight_kg, COALESCE(SUM(v.received_mt), 0) AS vendor_received_mt
      FROM job_work_lots l
      LEFT JOIN product_masters p
        ON p.bpcs_no = l.component_code
        AND p.vendor_name = l.vendor
        AND p.is_active = true
      LEFT JOIN vendor_end_grns v ON v.lot_no = l.lot_no
      WHERE l.lot_no = $1 AND l.component_code = $2
      GROUP BY l.raw_issued_kg, p.net_input_weight_kg
      LIMIT 1
      `,
      [lotNo, componentCode],
    );
    if (!lot.rowCount) {
      const error = new Error("Job work lot not found");
      error.status = 404;
      throw error;
    }
    const receivedKg = Number(lot.rows[0].vendor_received_mt || 0) * 1000;
    if (receivedKg <= 0) {
      const error = new Error("Vendor GRN must be confirmed before semi finished progress");
      error.status = 400;
      throw error;
    }
    const netInputWeightKg = Number(lot.rows[0].net_input_weight_kg || 0);
    if (netInputWeightKg > 0) {
      const expectedQty = Math.floor(Math.min(Number(lot.rows[0].raw_issued_kg || 0), receivedKg) / netInputWeightKg);
      const existing = await client.query(
        "SELECT COALESCE(SUM(semi_finished_pieces), 0) AS semi FROM vendor_productions WHERE lot_no = $1",
        [lotNo],
      );
      if (Number(existing.rows[0].semi || 0) + semiFinishedPieces > expectedQty) {
        const error = new Error(`Semi finished qty cannot exceed expected ${expectedQty} pcs`);
        error.status = 400;
        throw error;
      }
    }

    await client.query(
    `
    INSERT INTO vendor_productions
      (lot_no, component_code, production_date, semi_finished_pieces, scrap_mt, remarks)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      lotNo,
      componentCode,
      requiredText(req.body.productionDate, "Production date"),
      semiFinishedPieces,
      toNumber(req.body.scrapMt || 0, "Scrap MT"),
      cleanText(req.body.remarks),
    ],
    );
  });
  res.json({ success: true });
}));

app.post("/api/schedules", asyncHandler(async (req, res) => {
  await pool.query(
    `
    INSERT INTO customer_schedules (customer, component_code, due_date, required_qty)
    VALUES ($1, $2, $3, $4)
    `,
    [
      upperText(requiredText(req.body.customer, "Customer")),
      upperText(requiredText(req.body.componentCode, "Component code")),
      requiredText(req.body.dueDate, "Due date"),
      toNumber(req.body.requiredQty, "Required qty", 1),
    ],
  );
  res.json({ success: true });
}));

app.post("/api/sales", asyncHandler(async (req, res) => {
  const customer = upperText(requiredText(req.body.customer, "Customer"));
  const componentCode = upperText(requiredText(req.body.componentCode, "Component code"));
  const saleDate = requiredText(req.body.saleDate, "Sale date");
  const invoiceNo = upperText(requiredText(req.body.invoiceNo, "Invoice no"));
  const soldQty = toNumber(req.body.soldQty, "Sold qty", 1);
  const ratePerPiece = toNumber(req.body.ratePerPiece || 0, "Rate per piece");
  const remarks = cleanText(req.body.remarks);

  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [componentCode]);

    const customerExists = await client.query(
      "SELECT 1 FROM customers WHERE customer_name = $1 AND is_active = true LIMIT 1",
      [customer],
    );
    if (!customerExists.rowCount) {
      const error = new Error("Customer not found");
      error.status = 404;
      throw error;
    }

    const productExists = await client.query(
      "SELECT 1 FROM product_masters WHERE bpcs_no = $1 AND is_active = true LIMIT 1",
      [componentCode],
    );
    if (!productExists.rowCount) {
      const error = new Error("Product not found");
      error.status = 404;
      throw error;
    }

    const produced = await client.query(
      `
      SELECT COALESCE(SUM(produced_qty), 0) AS total
      FROM job_work_lots
      WHERE component_code = $1 AND receipt_date IS NOT NULL
      `,
      [componentCode],
    );

    const sold = await client.query(
      "SELECT COALESCE(SUM(sold_qty), 0) AS total FROM customer_sales WHERE component_code = $1",
      [componentCode],
    );

    const available = Number(produced.rows[0].total || 0) - Number(sold.rows[0].total || 0);
    if (soldQty > available) {
      const error = new Error(`Sale qty cannot exceed available finished stock. Available ${Math.max(available, 0)} pcs`);
      error.status = 400;
      throw error;
    }

    const scheduled = await client.query(
      `
      SELECT COALESCE(SUM(required_qty), 0) AS total
      FROM customer_schedules
      WHERE customer = $1 AND component_code = $2
      `,
      [customer, componentCode],
    );

    const customerSold = await client.query(
      `
      SELECT COALESCE(SUM(sold_qty), 0) AS total
      FROM customer_sales
      WHERE customer = $1 AND component_code = $2
      `,
      [customer, componentCode],
    );

    const pendingScheduleQty = Number(scheduled.rows[0].total || 0) - Number(customerSold.rows[0].total || 0);

    if (pendingScheduleQty <= 0) {
      const error = new Error("No pending customer schedule found for this sale");
      error.status = 400;
      throw error;
    }

    if (soldQty > pendingScheduleQty) {
      const error = new Error(`Sale qty cannot exceed pending customer schedule. Pending ${Math.max(pendingScheduleQty, 0)} pcs`);
      error.status = 400;
      throw error;
    }

    await client.query(
      `
      INSERT INTO customer_sales
        (customer, component_code, sale_date, invoice_no, sold_qty, rate_per_piece, remarks)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [customer, componentCode, saleDate, invoiceNo, soldQty, ratePerPiece, remarks],
    );
  });

  res.json({ success: true });
}));

app.patch("/api/vendors/:id", asyncHandler(async (req, res) => {
  const vendorName = upperText(requiredText(req.body.vendorName, "Vendor name"));
  const city = cleanText(req.body.city);
  const contact = cleanText(req.body.contact);
  const fullAddress = cleanText(req.body.fullAddress);
  const result = await pool.query(
    `UPDATE vendors
     SET vendor_name = $1, city = $2, contact = $3, full_address = $4
     WHERE id = $5 AND is_active = true
     RETURNING id, vendor_name AS "vendorName", city, contact, full_address AS "fullAddress",
       pan_card_url AS "panCardUrl", aadhar_card_url AS "aadharCardUrl",
       cancel_cheque_url AS "cancelChequeUrl", gst_url AS "gstUrl", other_doc_url AS "otherDocUrl"`,
    [vendorName, city, contact, fullAddress, req.params.id],
  );
  if (!result.rowCount) {
    const error = new Error("Vendor not found");
    error.status = 404;
    throw error;
  }
  res.json({ success: true, vendor: result.rows[0] });
}));

app.delete("/api/vendors/:id", asyncHandler(async (req, res) => {
  const vendor = await pool.query("SELECT vendor_name FROM vendors WHERE id = $1", [req.params.id]);
  if (vendor.rowCount) {
    const used = await pool.query(
      "SELECT 1 FROM product_masters WHERE vendor_name = $1 AND is_active = true LIMIT 1",
      [vendor.rows[0].vendor_name],
    );
    if (used.rowCount) {
      const error = new Error("Cannot delete vendor because it is used in Product Master");
      error.status = 409;
      throw error;
    }
  }
  await pool.query("UPDATE vendors SET is_active = false WHERE id = $1", [req.params.id]);
  res.json({ success: true });
}));

app.delete("/api/customers/:id", asyncHandler(async (req, res) => {
  const customer = await pool.query("SELECT customer_name FROM customers WHERE id = $1", [req.params.id]);
  if (customer.rowCount) {
    const used = await pool.query(
      `
      SELECT 1 FROM customer_schedules WHERE customer = $1
      UNION ALL SELECT 1 FROM customer_sales WHERE customer = $1
      LIMIT 1
      `,
      [customer.rows[0].customer_name],
    );
    if (used.rowCount) {
      const error = new Error("Cannot delete customer because it has schedules or sales");
      error.status = 409;
      throw error;
    }
  }
  await pool.query("UPDATE customers SET is_active = false WHERE id = $1", [req.params.id]);
  res.json({ success: true });
}));

app.delete("/api/products/:id", asyncHandler(async (req, res) => {
  const product = await pool.query("SELECT bpcs_no FROM product_masters WHERE id = $1", [req.params.id]);
  if (product.rowCount) {
    const bpcsNo = product.rows[0].bpcs_no;
    const used = await pool.query(
      `
      SELECT 1 FROM bos_grns WHERE component_code = $1
      UNION ALL SELECT 1 FROM job_work_lots WHERE component_code = $1
      UNION ALL SELECT 1 FROM vendor_productions WHERE component_code = $1
      UNION ALL SELECT 1 FROM customer_schedules WHERE component_code = $1
      UNION ALL SELECT 1 FROM customer_sales WHERE component_code = $1
      LIMIT 1
      `,
      [bpcsNo],
    );
    if (used.rowCount) {
      const error = new Error("Cannot delete product because it is used in transactions or schedules");
      error.status = 409;
      throw error;
    }
  }
  await pool.query("UPDATE product_masters SET is_active = false WHERE id = $1", [req.params.id]);
  res.json({ success: true });
}));

app.delete("/api/bos-grns/:id", asyncHandler(async (req, res) => {
  await withTransaction(async (client) => {
    const current = await client.query("SELECT component_code, qty_mt FROM bos_grns WHERE id = $1", [req.params.id]);
    if (!current.rowCount) return;

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [req.params.id]);
    const used = await client.query("SELECT 1 FROM job_work_lots WHERE bos_grn_id = $1 LIMIT 1", [req.params.id]);
    if (used.rowCount) {
      const error = new Error("Cannot delete BOS GRN because Job Work assignment already uses this material");
      error.status = 409;
      throw error;
    }

    await client.query("DELETE FROM bos_grns WHERE id = $1", [req.params.id]);
  });
  res.json({ success: true });
}));

app.delete("/api/vendor-end-grns/:id", asyncHandler(async (req, res) => {
  const grn = await pool.query("SELECT lot_no FROM vendor_end_grns WHERE id = $1", [req.params.id]);
  if (grn.rowCount) {
    const lotNo = grn.rows[0].lot_no;
    const used = await pool.query(
      `
      SELECT 1 FROM job_work_lots
      WHERE lot_no = $1 AND receipt_date IS NOT NULL
      UNION ALL SELECT 1 FROM vendor_productions WHERE lot_no = $1
      LIMIT 1
      `,
      [lotNo],
    );
    if (used.rowCount) {
      const error = new Error("Cannot delete Vendor GRN because Components Ready progress exists for this lot");
      error.status = 409;
      throw error;
    }
  }
  await pool.query("DELETE FROM vendor_end_grns WHERE id = $1", [req.params.id]);
  res.json({ success: true });
}));

app.delete("/api/job-work-lots/:lotNo", asyncHandler(async (req, res) => {
  await withTransaction(async (client) => {
    const lotNo = upperText(req.params.lotNo);
    const lot = await client.query(
      "SELECT component_code, produced_qty FROM job_work_lots WHERE lot_no = $1",
      [lotNo],
    );
    if (lot.rowCount) {
      const componentCode = lot.rows[0].component_code;
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [componentCode]);
      const produced = await client.query(
        `
        SELECT COALESCE(SUM(produced_qty), 0) AS total
        FROM job_work_lots
        WHERE component_code = $1 AND receipt_date IS NOT NULL AND lot_no <> $2
        `,
        [componentCode, lotNo],
      );
      const sold = await client.query(
        "SELECT COALESCE(SUM(sold_qty), 0) AS total FROM customer_sales WHERE component_code = $1",
        [componentCode],
      );
      if (Number(sold.rows[0].total || 0) > Number(produced.rows[0].total || 0)) {
        const error = new Error("Cannot delete job work lot because finished pieces from this component are already sold");
        error.status = 409;
        throw error;
      }
    }
    await client.query("DELETE FROM vendor_end_grns WHERE lot_no = $1", [lotNo]);
    await client.query("DELETE FROM vendor_productions WHERE lot_no = $1", [lotNo]);
    await client.query("DELETE FROM job_work_lots WHERE lot_no = $1", [lotNo]);
  });
  res.json({ success: true });
}));

app.delete("/api/vendor-productions/:id", asyncHandler(async (req, res) => {
  const entry = await pool.query("SELECT lot_no FROM vendor_productions WHERE id = $1", [req.params.id]);
  if (entry.rowCount) {
    const lot = await pool.query(
      "SELECT produced_qty FROM job_work_lots WHERE lot_no = $1 AND receipt_date IS NOT NULL",
      [entry.rows[0].lot_no],
    );
    if (lot.rowCount && Number(lot.rows[0].produced_qty || 0) > 0) {
      const error = new Error("Cannot delete semi finished progress after finished components are ready");
      error.status = 409;
      throw error;
    }
  }
  await pool.query("DELETE FROM vendor_productions WHERE id = $1", [req.params.id]);
  res.json({ success: true });
}));

app.delete("/api/schedules/:id", asyncHandler(async (req, res) => {
  await pool.query("DELETE FROM customer_schedules WHERE id = $1", [req.params.id]);
  res.json({ success: true });
}));

app.delete("/api/sales/:id", asyncHandler(async (req, res) => {
  await pool.query("DELETE FROM customer_sales WHERE id = $1", [req.params.id]);
  res.json({ success: true });
}));

app.use(express.static(publicDir));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  return res.sendFile(path.join(publicDir, "index.html"));
});

const PORT = process.env.PORT || 5000;

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Job Work Backend running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Backend schema check failed", error);
    process.exit(1);
  });
