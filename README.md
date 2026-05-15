# Job Work Process Control

Web app for tracking steel bar raw material received from suppliers, issued to vendors, converted into semi-finished and finished components, matched with customer schedules, sold to customers, and converted into automatic purchase/vendor issue planning.

## Open

1. Apply `backend/schema.sql` to the PostgreSQL database if the tables are not already present.
2. Configure `backend/.env` with `DATABASE_URL`, `ADMIN_PASSWORD`, `AUTH_SECRET` and optional `DB_SSL=true`.
   `ADMIN_USERNAME` defaults to `admin`. `AUTH_SECRET` must be at least 32 characters. New/reset user passwords must be at least 12 characters.
   For production deployments where schema changes are applied manually after backup, set `SKIP_SCHEMA_CHECK=true`.
3. Start the backend:

```sh
cd backend
npm install
npm start
```

4. Serve the frontend from the project root:

```sh
node dev-server.js
```

5. Open `http://127.0.0.1:8080`.
6. Login with the bootstrap admin ID/password, then use `Access Control` to create user logins and assign page access.

## Main Flow

1. Add vendors, customers, and BPCS product-to-raw-material mapping in `Masters`.
2. In `GRN`, add BOS GRN when raw material is received from the supplier.
3. In `GRN > Job Work Assignment`, issue raw material to the vendor.
4. In `Vendor > Vendor GRN`, confirm raw material received by the vendor.
5. In `Vendor > Components Ready`, update semi-finished progress as information and finished-ready quantity as BOS-buyable output against the issued raw material.
6. Add customer schedules in pieces.
7. In `Sales`, capture actual customer invoice/sale quantity after components are ready.
8. Review `Purchase Plan` for pending dispatch shortage, raw gap quantity, BOS raw availability, vendor issue requirement, and supplier purchase requirement.

All business records are stored in PostgreSQL through the backend API. The frontend does not use browser local storage for app data, and vendor documents are stored in PostgreSQL instead of `backend/uploads`.
