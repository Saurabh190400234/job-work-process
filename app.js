const IST_TIME_ZONE = "Asia/Kolkata";
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port === "8080"
  ? `http://${window.location.hostname}:5000/api`
  : "/api";
const API_ORIGIN = API_BASE.endsWith("/api") ? API_BASE.slice(0, -4) : "";
let currentUser = null;
let pageDefinitions = [];
let accessUsers = [];

function clearApiToken() {
  sessionStorage.removeItem("jobWorkApiToken");
}

function getCookieValue(name) {
  return document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
}

function csrfHeaders(method = "GET", headers = {}) {
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(String(method || "GET").toUpperCase())) {
    return { ...headers };
  }

  const csrfToken = getCookieValue("jobwork_csrf");
  return {
    ...headers,
    ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
  };
}

function authHeaders(headers = {}, method = "GET") {
  return csrfHeaders(method, headers);
}

function showLogin(message = "") {
  currentUser = null;
  document.body.classList.remove("auth-loading", "auth-ready");
  document.body.classList.add("auth-login");
  showAuthCard("login");
  const error = document.getElementById("loginError");
  if (error) error.textContent = message;
}

function showAuthCard(card) {
  const loginCard = elements.loginForm;
  const forgotCard = elements.forgotPasswordForm;
  const resetCard = elements.resetPasswordForm;

  if (loginCard) loginCard.hidden = card !== "login";
  if (forgotCard) forgotCard.hidden = card !== "forgot";
  if (resetCard) resetCard.hidden = card !== "reset";

  ["loginError", "forgotPasswordMessage", "resetPasswordMessage"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });

  refreshIcons();
}

function showApp() {
  document.body.classList.remove("auth-loading", "auth-login");
  document.body.classList.add("auth-ready");
}

function canAccessView(viewKey) {
  if (!currentUser) return false;
  if (viewKey === "access") return currentUser.isAdmin;
  return currentUser.isAdmin || currentUser.permissions.includes(viewKey);
}

function currentCustomerName() {
  return String(currentUser?.customerName || "").trim().toUpperCase();
}

function activateView(viewKey) {
  if (!canAccessView(viewKey)) {
    showToast("Is page ka access allowed nahi hai", "warn");
    return;
  }

  elements.navItems.forEach((navItem) => navItem.classList.toggle("active", navItem.dataset.view === viewKey));
  elements.views.forEach((view) => view.classList.toggle("active", view.id === viewKey));

  if (viewKey === "access") {
    loadAccessUsers();
  }
}

function applyUserAccess() {
  elements.navItems.forEach((item) => {
    item.hidden = !canAccessView(item.dataset.view);
  });

  const activeView = document.querySelector(".view.active")?.id;
  if (!activeView || !canAccessView(activeView)) {
    const firstAllowed = [...elements.navItems].find((item) => !item.hidden)?.dataset.view;
    if (firstAllowed) activateView(firstAllowed);
  }

  const userName = document.getElementById("currentUserName");
  if (userName) {
    userName.textContent = `${currentUser.fullName || currentUser.username}${currentUser.isAdmin ? " (Admin)" : ""}`;
  }
}

async function loginUser(username, password) {
  const response = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      username: String(username || "").trim(),
      password: String(password || "").trim(),
    }),
  });

  const rawBody = await response.text();
  let data = {};
  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    data = {};
  }
  if (!response.ok || !data.user) {
    const detail = rawBody && !data.message ? rawBody.slice(0, 120) : "";
    throw new Error(data.message || `Login failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }

  clearApiToken();
  currentUser = data.user;
  pageDefinitions = data.pages || [];
  return data;
}

async function loadCurrentUser() {
  const response = await fetch(`${API_BASE}/me`, {
    credentials: "include",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.user) {
    throw new Error(data.message || "Login required");
  }

  currentUser = data.user;
  pageDefinitions = data.pages || [];
  return data;
}

// ── Toast ──────────────────────────────────────────────────────────────
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const el = document.createElement("div");
  el.className = `toast${type !== "success" ? ` ${type}` : ""}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3100);
}

function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}

// ── Confirm dialog ─────────────────────────────────────────────────────
function showConfirm(title, body, confirmLabel = "Delete") {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>${h(title)}</h3>
        <p>${h(body)}</p>
        <div class="modal-actions">
          <button class="modal-cancel">Cancel</button>
          <button class="modal-confirm-btn">${h(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector(".modal-cancel").addEventListener("click", () => { overlay.remove(); resolve(false); });
    overlay.querySelector(".modal-confirm-btn").addEventListener("click", () => { overlay.remove(); resolve(true); });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
  });
}

// ── Search filter helper ───────────────────────────────────────────────
function addTableSearch(wrapperId, tbodyId, placeholder = "Search...") {
  const wrapper = document.getElementById(wrapperId)?.closest(".panel");
  if (!wrapper) return;
  const header = wrapper.querySelector(".panel-header");
  if (!header || wrapper.querySelector(".table-search")) return;
  const input = document.createElement("input");
  input.type = "search";
  input.className = "table-search";
  input.placeholder = placeholder;
  const div = document.createElement("div");
  div.className = "table-search-wrap";
  div.appendChild(input);
  wrapper.querySelector(".table-wrap")?.before(div);
  input.addEventListener("input", () => {
    const q = input.value.toLowerCase();
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.querySelectorAll("tr").forEach((row) => {
      row.style.display = row.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  });
}

// ── Empty state helper ─────────────────────────────────────────────────
function emptyState(message) {
  return `<tr><td colspan="20"><div class="empty-state"><strong>${message}</strong></div></td></tr>`;
}

// ── Priority from due date ─────────────────────────────────────────────
function schedulePriority(componentCode) {
  const allocations = scheduleSaleAllocations();
  const upcoming = state.schedules
    .filter((s) => s.componentCode === componentCode && (allocations.get(s.id)?.pending ?? s.requiredQty) > 0)
    .map((s) => s.dueDate)
    .sort();
  if (!upcoming.length) return { label: "-", tone: "" };
  const days = Math.ceil((new Date(upcoming[0]) - new Date(today)) / 86400000);
  if (days < 0)  return { label: "Overdue", tone: "urgent" };
  if (days <= 7) return { label: "Urgent", tone: "urgent" };
  if (days <= 30) return { label: "Soon", tone: "soon" };
  return { label: "OK", tone: "ok" };
}

let state = normalizeState({});

const elements = {
  navItems: document.querySelectorAll(".nav-item"),
  views: document.querySelectorAll(".view"),
  masterNavItems: document.querySelectorAll("[data-master-view]"),
  masterPages: document.querySelectorAll(".master-page"),
  grnNavItems: document.querySelectorAll("[data-grn-view]"),
  grnPages: document.querySelectorAll(".grn-page"),
  vendorNavItems: document.querySelectorAll("[data-vendor-view]"),
  vendorPages: document.querySelectorAll(".vendor-page"),
  vendorMasterForm: document.querySelector("#vendorMasterForm"),
  productMasterForm: document.querySelector("#productMasterForm"),
  customerMasterForm: document.querySelector("#customerMasterForm"),
  issueForm: document.querySelector("#issueForm"),
  receiptForm: document.querySelector("#receiptForm"),
  ourEndGrnForm: document.querySelector("#ourEndGrnForm"),
  vendorEndGrnForm: document.querySelector("#vendorEndGrnForm"),
  scheduleForm: document.querySelector("#scheduleForm"),
  salesForm: document.querySelector("#salesForm"),
  issueComponentSelect: document.querySelector("#issueComponentSelect"),
  productVendorSelect: document.querySelector("#productVendorSelect"),
  scheduleCustomerSelect: document.querySelector("#scheduleCustomerSelect"),
  salesCustomerSelect: document.querySelector("#salesCustomerSelect"),
  bosPartSelect: document.querySelector("#bosPartSelect"),
  bosVendorName: document.querySelector("#bosVendorName"),
  vendorBosInvoiceSelect: document.querySelector("#vendorBosInvoiceSelect"),
  receiptLotSelect: document.querySelector("#receiptLotSelect"),
  scheduleComponentSelect: document.querySelector("#scheduleComponentSelect"),
  salesComponentSelect: document.querySelector("#salesComponentSelect"),
  loginForm: document.querySelector("#loginForm"),
forgotPasswordForm: document.querySelector("#forgotPasswordForm"),
resetPasswordForm: document.querySelector("#resetPasswordForm"),
forgotPasswordLink: document.querySelector("#forgotPasswordLink"),
backToLoginFromForgot: document.querySelector("#backToLoginFromForgot"),
backToLoginFromReset: document.querySelector("#backToLoginFromReset"),
logoutButton: document.querySelector("#logoutButton"),
  accessUserForm: document.querySelector("#accessUserForm"),
  accessPermissions: document.querySelector("#accessPermissions"),
  accessUserTable: document.querySelector("#accessUserTable"),
  accessCustomerSelect: document.querySelector("#accessCustomerSelect"),
  customerSummaryGrid: document.querySelector("#customerSummaryGrid"),
  customerPriorityTable: document.querySelector("#customerPriorityTable"),
  customerMaterialTable: document.querySelector("#customerMaterialTable"),
  customerSalesSummary: document.querySelector("#customerSalesSummary"),
  customerSalesHistoryTable: document.querySelector("#customerSalesHistoryTable"),
  cancelUserEdit: document.querySelector("#cancelUserEdit"),
};

async function loadStateFromApi() {
  try {
    const data = await apiRequest("/state");

    state = normalizeState(data);
    renderAll();

    const el = document.getElementById("lastSaved");
    if (el) el.textContent = "Loaded from PostgreSQL";
    return true;
  } catch (error) {
    console.error(error);

    if (String(error.message || "").toLowerCase().includes("unauthorized")) {
      clearApiToken();
      showLogin("Session expire ho gaya. Please login again.");
      return false;
    }

    showToast(error.message || "Database load failed. PostgreSQL connection check karein.", "error");

    state = normalizeState({});
    renderAll();
    return false;
  }
}

function normalizeState(nextState) {
  nextState.vendors ||= [];
  nextState.customers ||= [];
  nextState.rawMaterials ||= [];
  nextState.productMasters ||= [];
  nextState.components = [];
  nextState.lots ||= [];
  nextState.schedules ||= [];
  nextState.sales ||= [];
  nextState.bosGrns ||= nextState.ourEndGrns || [];
  delete nextState.ourEndGrns;
  nextState.vendorEndGrns ||= [];
  nextState.vendorProductions ||= [];
  migrateInternalIds(nextState);
  ensureVendors(nextState);
  ensureCustomers(nextState);
  ensureProductRawMaterials(nextState);
  return nextState;
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function migrateInternalIds(nextState) {
  nextState.vendors.forEach((vendor) => {
    vendor.id ||= vendor.vendorCode || makeId("vendor");
    delete vendor.vendorCode;
    vendor.vendorName = vendor.vendorName?.trim().toUpperCase() || "";
  });
  nextState.customers.forEach((customer) => {
    customer.id ||= customer.customerCode || makeId("customer");
    delete customer.customerCode;
    customer.customerName = customer.customerName?.trim().toUpperCase() || "";
  });
  nextState.productMasters.forEach((product) => {
    product.id ||= makeId("product");
  });
  nextState.lots.forEach((lot) => {
    lot.id ||= makeId("lot");
    lot.outputStage ||= "finished";
    lot.endCutKg = Number(lot.endCutKg || 0);
  });
  nextState.schedules.forEach((schedule) => {
    schedule.id ||= makeId("schedule");
    schedule.customer = schedule.customer?.trim().toUpperCase() || "";
  });
  nextState.sales.forEach((sale) => {
    sale.id ||= makeId("sale");
    sale.customer = sale.customer?.trim().toUpperCase() || "";
    sale.componentCode = sale.componentCode?.trim().toUpperCase() || "";
    sale.soldQty = Number(sale.soldQty || 0);
    sale.ratePerPiece = Number(sale.ratePerPiece || 0);
  });
  nextState.bosGrns.forEach((grn) => {
    grn.id ||= makeId("bos-grn");
  });
  nextState.vendorEndGrns.forEach((grn) => {
    grn.id ||= makeId("vendor-grn");
    grn.grnDate ||= grn.receivedDate || "";
    grn.lotNo ||= grn.bosGrnId && !String(grn.bosGrnId).includes("-") ? grn.bosGrnId : grn.lotNo;
  });
  nextState.vendorProductions.forEach((entry) => {
    entry.id ||= makeId("vendor-production");
  });
}

function ensureCustomers(nextState) {
  nextState.schedules.forEach((schedule) => {
    const customerName = schedule.customer?.trim().toUpperCase();
    if (!customerName) return;

    const exists = nextState.customers.some((customer) => customer.customerName === customerName);
    if (!exists) {
      nextState.customers.push({
        id: makeId("customer"),
        customerName,
        city: "",
        contact: "",
      });
    }
  });
  nextState.sales.forEach((sale) => {
    const customerName = sale.customer?.trim().toUpperCase();
    if (!customerName) return;

    const exists = nextState.customers.some((customer) => customer.customerName === customerName);
    if (!exists) {
      nextState.customers.push({
        id: makeId("customer"),
        customerName,
        city: "",
        contact: "",
      });
    }
  });
}

function ensureVendors(nextState) {
  nextState.productMasters.forEach((product) => {
    const vendorName = product.vendorName?.trim().toUpperCase();
    if (!vendorName) return;

    const exists = nextState.vendors.some((vendor) => vendor.vendorName === vendorName);
    if (!exists) {
      nextState.vendors.push({
        id: makeId("vendor"),
        vendorName,
        city: "",
        contact: "",
      });
    }
  });
}

function ensureProductRawMaterials(nextState) {
  nextState.productMasters.forEach((product) => {
    const rawCode = rawKeyFromProduct(product);
    const exists = nextState.rawMaterials.some((raw) => raw.code === rawCode);
    if (!exists) {
      nextState.rawMaterials.push({
        code: rawCode,
        description: `${product.shape} ${product.grade} ${compactNumber(product.sizeMm)}mm`,
        stockKg: 0,
        fixedKg: 0,
      });
    }
  });
}

function saveState() {
  const el = document.getElementById("lastSaved");
  if (el) {
    el.textContent = `Synced ${formatIstDateTime(new Date())}`;
  }
}

function number(value, digits = 0) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatIstDateTime(value) {
  if (!value) return "-";
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T00:00:00+05:30`)
    : new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).format(date).replace(",", "").replace(" at ", " ");
}

function h(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function mtToKg(value) {
  return Number(value || 0) * 1000;
}

function kgToMt(value) {
  return Number(value || 0) / 1000;
}

function formatMt(valueKg, digits = 3) {
  return `${number(kgToMt(valueKg), digits)} MT`;
}

function formatKg(valueKg, digits = 3) {
  return `${number(valueKg, digits)} KG`;
}

function stageLabel(stage) {
  return stage === "semi" ? "Semi Finished" : "Finished";
}

function compactNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? String(numberValue).replace(/\.0+$/, "") : String(value || "");
}

function getComponent(code) {
  return state.components.find((component) => component.code === code);
}

function rawKeyFromProduct(product) {
  return `${product.shape}-${product.grade}-${compactNumber(product.sizeMm)}`.toUpperCase();
}

function salesQty(componentCode, customer = "") {
  const targetCustomer = customer ? customer.trim().toUpperCase() : "";
  return state.sales
    .filter((sale) => sale.componentCode === componentCode && (!targetCustomer || sale.customer === targetCustomer))
    .reduce((sum, sale) => sum + Number(sale.soldQty || 0), 0);
}

function pendingScheduleQtyForSale(customer, componentCode) {
  const targetCustomer = String(customer || "").trim().toUpperCase();
  const targetComponent = String(componentCode || "").trim().toUpperCase();

  if (!targetCustomer || !targetComponent) return 0;

  const required = state.schedules
    .filter((schedule) => schedule.customer === targetCustomer && schedule.componentCode === targetComponent)
    .reduce((sum, schedule) => sum + Number(schedule.requiredQty || 0), 0);

  const alreadySold = salesQty(targetComponent, targetCustomer);

  return Math.max(required - alreadySold, 0);
}

function finishedAvailableQty(componentCode) {
  return Math.max(productionQty(componentCode, "finished") - salesQty(componentCode), 0);
}

function productToWorkItem(product) {
  const netInputWeightKg = Number(product.netInputWeightKg);
  const inputWeightKg = Number(product.inputWeightKg);
  const producedFinished = productionQty(product.bpcsNo, "finished");
  const soldFinished = salesQty(product.bpcsNo);
  const availableFinished = Math.max(producedFinished - soldFinished, 0);
  return {
    code: product.bpcsNo,
    name: `${product.grade} ${compactNumber(product.sizeMm)}mm ${product.shape}`,
    rawCode: rawKeyFromProduct(product),
    rawPerPieceKg: netInputWeightKg,
    inputWeightKg,
    netInputWeightKg,
    yieldPercent: inputWeightKg > 0 && netInputWeightKg > 0 ? (inputWeightKg / netInputWeightKg) * 100 : 100,
    readyStock: availableFinished,
    finishedStock: availableFinished,
    producedStock: producedFinished,
    soldStock: soldFinished,
    semiFinishedStock: productionQty(product.bpcsNo, "semi"),
    vendorName: product.vendorName,
    isProductMaster: true,
  };
}

function productionQty(componentCode, stage) {
  if (stage === "semi") {
    return state.lots
      .filter((lot) => lot.componentCode === componentCode)
      .reduce((sum, lot) => sum + semiFinishedForLot(lot.lotNo), 0);
  }

  return state.lots
    .filter((lot) => lot.componentCode === componentCode && lot.receiptDate)
    .reduce((sum, lot) => sum + Number(lot.producedQty || 0), 0);
}

function getProductMaster(code, vendorName = "") {
  const targetCode = String(code || "").trim().toUpperCase();
  const targetVendor = String(vendorName || "").trim().toUpperCase();

  if (targetVendor) {
    const exactProduct = state.productMasters.find((product) =>
      product.bpcsNo === targetCode && product.vendorName === targetVendor
    );
    if (exactProduct) return exactProduct;
  }

  return state.productMasters.find((product) => product.bpcsNo === targetCode);
}

function getProductById(id) {
  return state.productMasters.find((product) => product.id === id);
}

function productOptionLabel(product) {
  return `${product.bpcsNo} | ${product.vendorName} | ${product.grade} ${compactNumber(product.sizeMm)}mm ${product.shape}`;
}

function getWorkItem(code, vendorName = "") {
  const product = getProductMaster(code, vendorName);
  if (product) return productToWorkItem(product);
  return getComponent(code);
}

function allWorkItems() {
  const byCode = new Map();
  state.productMasters.forEach((product) => {
    if (!byCode.has(product.bpcsNo)) byCode.set(product.bpcsNo, productToWorkItem(product));
  });
  state.components.forEach((component) => {
    if (!byCode.has(component.code)) byCode.set(component.code, component);
  });
  return [...byCode.values()];
}

function getRaw(code) {
  return state.rawMaterials.find((raw) => raw.code === code);
}

function rawMaterialLabel(component) {
  if (!component) return "-";
  const raw = getRaw(component.rawCode);
  const description = raw?.description || component.rawCode;
  return `${description} | Net ${number(component.netInputWeightKg || component.rawPerPieceKg, 3)} kg/pc`;
}

function expectedPieces(lot) {
  const component = getWorkItem(lot.componentCode, lot.vendor);
  if (!component) return 0;
  return Math.floor(Number(lot.rawIssuedKg) / Number(component.rawPerPieceKg));
}

function pendingPieces(lot) {
  return Math.max(expectedPieces(lot) - Number(lot.producedQty || 0) - semiFinishedForLot(lot.lotNo), 0);
}

function endCutKgForLot(lot) {
  return Number(lot.endCutKg || 0);
}

function lotStatus(lot) {
  if (!lot.receiptDate) return { label: "Open", tone: "warn" };
  const expected = expectedPieces(lot);
  if (lot.producedQty >= expected) return { label: "Complete", tone: "ok" };
  return { label: "Short", tone: "danger" };
}

function openQuantity(componentCode) {
  return state.lots
    .filter((lot) => lot.componentCode === componentCode && !lot.receiptDate)
    .reduce((sum, lot) => sum + pendingPieces(lot), 0);
}

function scheduleSaleAllocations() {
  const salesPool = new Map();
  state.sales.forEach((sale) => {
    const key = `${sale.customer}|${sale.componentCode}`;
    salesPool.set(key, (salesPool.get(key) || 0) + Number(sale.soldQty || 0));
  });

  const allocations = new Map();
  [...state.schedules]
    .sort((a, b) => {
      const dateCompare = String(a.dueDate || "").localeCompare(String(b.dueDate || ""));
      return dateCompare || String(a.id || "").localeCompare(String(b.id || ""));
    })
    .forEach((schedule) => {
      const key = `${schedule.customer}|${schedule.componentCode}`;
      const availableSold = salesPool.get(key) || 0;
      const required = Number(schedule.requiredQty || 0);
      const soldAgainstSchedule = Math.min(required, availableSold);
      salesPool.set(key, Math.max(availableSold - soldAgainstSchedule, 0));
      allocations.set(schedule.id, {
        sold: soldAgainstSchedule,
        pending: Math.max(required - soldAgainstSchedule, 0),
      });
    });
  return allocations;
}

function demandQuantity(componentCode) {
  const allocations = scheduleSaleAllocations();
  return state.schedules
    .filter((schedule) => schedule.componentCode === componentCode)
    .reduce((sum, schedule) => sum + Number(allocations.get(schedule.id)?.pending ?? schedule.requiredQty), 0);
}

function bosReceivedByCode(rawCode) {
  return state.bosGrns.reduce((sum, grn) => {
    const component = getWorkItem(grn.componentCode);
    return component?.rawCode === rawCode ? sum + mtToKg(grn.qtyMt) : sum;
  }, 0);
}

function rawIssuedByCode(rawCode) {
  return state.lots.reduce((sum, lot) => {
    const component = getWorkItem(lot.componentCode);
    return component?.rawCode === rawCode ? sum + Number(lot.rawIssuedKg || 0) : sum;
  }, 0);
}

function bosReceivedByComponent(componentCode) {
  return state.bosGrns
    .filter((grn) => grn.componentCode === componentCode)
    .reduce((sum, grn) => sum + mtToKg(grn.qtyMt), 0);
}

function rawIssuedByComponent(componentCode) {
  return state.lots
    .filter((lot) => lot.componentCode === componentCode)
    .reduce((sum, lot) => sum + Number(lot.rawIssuedKg || 0), 0);
}

function rawAssignedByBosGrn(grn) {
  return state.lots
    .filter((lot) => lot.bosGrnId === grn.id || (!lot.bosGrnId && lot.componentCode === grn.componentCode && lot.vendor === grn.vendorName))
    .reduce((sum, lot) => sum + Number(lot.rawIssuedKg || 0), 0);
}

function lotsForBosGrn(grn) {
  return state.lots.filter((lot) => lot.bosGrnId === grn.id || (!lot.bosGrnId && lot.componentCode === grn.componentCode && lot.vendor === grn.vendorName));
}

function rawAssignableByComponent(componentCode) {
  return Math.max(bosReceivedByComponent(componentCode) - rawIssuedByComponent(componentCode), 0);
}

function rawAvailableByCode(rawCode) {
  const raw = getRaw(rawCode);
  return Math.max(Number(raw?.fixedKg || 0) + bosReceivedByCode(rawCode) - rawIssuedByCode(rawCode), 0);
}

function nextJobWorkRef() {
  const maxNo = state.lots.reduce((max, lot) => {
    const match = String(lot.lotNo || "").match(/^JW-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `JW-${String(maxNo + 1).padStart(5, "0")}`;
}

function lotLabel(lot) {
  const component = getWorkItem(lot.componentCode);
  return `${lot.vendor} | ${component?.code || lot.componentCode} | ${formatIstDateTime(lot.issueDate)}`;
}

function vendorGrnReceivedByLot(lotNo) {
  return state.vendorEndGrns
    .filter((grn) => grn.lotNo === lotNo)
    .reduce((sum, grn) => sum + Number(grn.receivedMt || 0), 0);
}

function vendorReceivedKgForLot(lotNo) {
  return mtToKg(vendorGrnReceivedByLot(lotNo));
}

function readyExpectedPieces(lot) {
  const component = getWorkItem(lot.componentCode);
  if (!component) return 0;
  const rawPerPieceKg = Number(component.rawPerPieceKg || 0);
  if (rawPerPieceKg <= 0) return 0;
  const usableRawKg = Math.min(Number(lot.rawIssuedKg || 0), vendorReceivedKgForLot(lot.lotNo));
  return Math.floor(usableRawKg / rawPerPieceKg);
}

function remainingReadyPieces(lot) {
  return Math.max(readyExpectedPieces(lot) - Number(lot.producedQty || 0), 0);
}

function remainingSemiInfoPieces(lot) {
  return Math.max(readyExpectedPieces(lot) - semiFinishedProducedForLot(lot.lotNo), 0);
}

function canUpdateComponentsReady(lot) {
  return vendorGrnReceivedByLot(lot.lotNo) > 0
    && (remainingReadyPieces(lot) > 0 || remainingSemiInfoPieces(lot) > 0);
}

function fillProductDetails(prefix, productOrCode) {
  const product = typeof productOrCode === "object" ? productOrCode : getProductMaster(productOrCode);
  const vendorInput = document.querySelector(`#${prefix}VendorName`);
  const partInput = document.querySelector(`#${prefix}PartNo`);
  const gradeInput = document.querySelector(`#${prefix}Grade`);
  const sizeInput = document.querySelector(`#${prefix}Size`);
  const shapeInput = document.querySelector(`#${prefix}Shape`);

  if (!product) {
    [vendorInput, partInput, gradeInput, sizeInput, shapeInput].forEach((input) => {
      if (input && input.tagName !== "SELECT") input.value = "";
    });
    return;
  }

  if (vendorInput && vendorInput.tagName !== "SELECT") vendorInput.value = product.vendorName;
  if (partInput) partInput.value = product.bpcsNo;
  if (gradeInput) gradeInput.value = product.grade;
  if (sizeInput) sizeInput.value = `${compactNumber(product.sizeMm)} mm`;
  if (shapeInput) shapeInput.value = product.shape;
}

function fillVendorGrnDetails() {
  const lot = state.lots.find((item) => item.lotNo === elements.vendorBosInvoiceSelect.value);
  if (!lot) {
    fillProductDetails("vendor", null);
    return;
  }
  fillProductDetails("vendor", lot.componentCode);
}

function updateReceiptCalculations() {
  const form = elements.receiptForm;
  const lot = state.lots.find((item) => item.lotNo === elements.receiptLotSelect.value);
  if (!form) return;
  if (!lot) {
    form.elements.expectedFinishedPieces.value = "";
    form.elements.finishedPieces.removeAttribute("max");
    form.elements.semiFinishedPieces.removeAttribute("max");
    return;
  }

  const remainingReady = remainingReadyPieces(lot);
  form.elements.expectedFinishedPieces.value = remainingReady;
  form.elements.finishedPieces.max = remainingReady;
  form.elements.semiFinishedPieces.max = remainingSemiInfoPieces(lot);
}

function updateSalesAvailability() {
  const form = elements.salesForm;
  if (!form) return;
  const componentCode = elements.salesComponentSelect.value;
  const available = componentCode ? finishedAvailableQty(componentCode) : 0;
  form.elements.availableFinishedPieces.value = componentCode ? Math.floor(available) : "";
  if (componentCode) {
    form.elements.soldQty.max = Math.floor(available);
  } else {
    form.elements.soldQty.removeAttribute("max");
  }
}

function updateIssueRemainingHint() {
  const componentCode = elements.issueComponentSelect.value;
  const input = elements.issueForm.elements.rawIssuedKg;
  const hint = document.getElementById("issueRemainingHint");
  if (!input || !hint) return;
  if (!componentCode) {
    input.removeAttribute("max");
    hint.textContent = "";
    return;
  }

  const received = bosReceivedByComponent(componentCode);
  const assigned = rawIssuedByComponent(componentCode);
  const remaining = rawAssignableByComponent(componentCode);
  input.max = kgToMt(remaining).toFixed(3);
  hint.textContent = `GRN ${formatMt(received)} | Assigned ${formatMt(assigned)} | Balance ${formatMt(remaining)}`;
}

function fillBosVendorOptions() {
  const selectedProduct = getProductById(elements.bosPartSelect.value);
  if (!selectedProduct) {
    elements.bosVendorName.innerHTML = `<option value="">Select vendor</option>`;
    fillProductDetails("bos", null);
    return;
  }
  const matchingProducts = state.productMasters.filter((product) => product.bpcsNo === selectedProduct.bpcsNo);
  elements.bosVendorName.innerHTML = `<option value="">Select vendor</option>` + matchingProducts
    .map((product) => `<option value="${h(product.vendorName)}" data-product-id="${h(product.id)}">${h(product.vendorName)}</option>`)
    .join("");
  elements.bosVendorName.value = selectedProduct.vendorName;
  fillProductDetails("bos", selectedProduct);
}

function selectedBosProduct() {
  const selectedProduct = getProductById(elements.bosPartSelect.value);
  if (!selectedProduct || !elements.bosVendorName.value) return null;
  return (
    state.productMasters.find(
      (product) => product.bpcsNo === selectedProduct.bpcsNo && product.vendorName === elements.bosVendorName.value,
    ) || selectedProduct
  );
}

function renderSelects() {
  const vendorPlaceholder = `<option value="">Select vendor</option>`;
  const customerPlaceholder = `<option value="">Select customer</option>`;
  const componentPlaceholder = `<option value="">Select component</option>`;
  const productPlaceholder = `<option value="">Select part no.</option>`;
  const assignmentPlaceholder = `<option value="">Select job work assignment</option>`;
  const invoicePlaceholder = `<option value="">Select product assignment</option>`;

  elements.productVendorSelect.innerHTML = vendorPlaceholder + state.vendors
    .map((vendor) => `<option value="${h(vendor.vendorName)}">${h(vendor.vendorName)}</option>`)
    .join("");

  elements.scheduleCustomerSelect.innerHTML = customerPlaceholder + state.customers
    .map((customer) => `<option value="${h(customer.customerName)}">${h(customer.customerName)}</option>`)
    .join("");
  const customerName = currentCustomerName();
  if (customerName && !currentUser?.isAdmin) {
    const hasCustomerOption = [...elements.scheduleCustomerSelect.options].some((option) => option.value === customerName);
    if (!hasCustomerOption) {
      elements.scheduleCustomerSelect.insertAdjacentHTML("beforeend", `<option value="${h(customerName)}">${h(customerName)}</option>`);
    }
    elements.scheduleCustomerSelect.value = customerName;
    elements.scheduleCustomerSelect.disabled = true;
  } else {
    elements.scheduleCustomerSelect.disabled = false;
  }

  elements.salesCustomerSelect.innerHTML = customerPlaceholder + state.customers
    .map((customer) => `<option value="${h(customer.customerName)}">${h(customer.customerName)}</option>`)
    .join("");
  if (elements.accessCustomerSelect) {
    elements.accessCustomerSelect.innerHTML = `<option value="">No customer link</option>` + state.customers
      .map((customer) => `<option value="${h(customer.customerName)}">${h(customer.customerName)}</option>`)
      .join("");
  }

  const componentOptions = allWorkItems()
    .map((component) => `<option value="${h(component.code)}">${h(component.code)} - ${h(component.name)}</option>`)
    .join("");
  const productOptions = state.productMasters
    .map((product) => `<option value="${h(product.id)}">${h(productOptionLabel(product))}</option>`)
    .join("");

  elements.issueComponentSelect.innerHTML = componentPlaceholder + componentOptions;
  elements.scheduleComponentSelect.innerHTML = componentPlaceholder + componentOptions;
  elements.salesComponentSelect.innerHTML = componentPlaceholder + componentOptions;
  elements.bosPartSelect.innerHTML = productPlaceholder + productOptions;

  const assignmentLots = state.lots.filter((lot) => canUpdateComponentsReady(lot));
  elements.receiptLotSelect.innerHTML = assignmentPlaceholder + assignmentLots
    .map((lot) => `<option value="${h(lot.lotNo)}">${h(lotLabel(lot))}</option>`)
    .join("");

  const bosInvoiceOptions = state.lots
    .map((lot) => {
      const component = getWorkItem(lot.componentCode);
      const balanceMt = kgToMt(Number(lot.rawIssuedKg || 0)) - vendorGrnReceivedByLot(lot.lotNo);
      return `<option value="${h(lot.lotNo)}">${h(component?.code || lot.componentCode)} - ${h(lot.vendor)} - Balance ${number(Math.max(balanceMt, 0), 3)} MT</option>`;
    })
    .join("");
  elements.vendorBosInvoiceSelect.innerHTML = invoicePlaceholder + bosInvoiceOptions;
  fillBosVendorOptions();
  fillVendorGrnDetails();
  const issueItem = getWorkItem(elements.issueComponentSelect.value);
  if (issueItem?.vendorName && !elements.issueForm.elements.vendor.value) {
    elements.issueForm.elements.vendor.value = issueItem.vendorName;
  } else if (!issueItem) {
    elements.issueForm.elements.vendor.value = "";
  }
  updateIssueRemainingHint();
  updateReceiptCalculations();
  updateSalesAvailability();
}

function renderActionLaunchers() {
  document.querySelectorAll("[data-open-form='issueForm'], [data-open-form='vendorEndGrnForm'], [data-open-form='receiptForm'], [data-open-form='salesForm']").forEach((button) => {
    button.closest(".form-launcher")?.remove();
  });
}


function renderDashboard() {
  const dashboard = document.querySelector("#dashboard");
  if (!dashboard) return;

  const sum = (items, getter) => items.reduce((total, item) => total + Number(getter(item) || 0), 0);

  const bosGrnKg = sum(state.bosGrns, (grn) => mtToKg(grn.qtyMt));
  const issuedToVendorKg = sum(state.lots, (lot) => lot.rawIssuedKg);
  const vendorEndGrnKg = sum(state.vendorEndGrns, (grn) => mtToKg(grn.receivedMt));

  const semiFinishedPieces = sum(state.vendorProductions, (entry) => entry.semiFinishedPieces);
  const finishedPieces = sum(state.lots, (lot) => lot.receiptDate ? lot.producedQty : 0);
  const soldPieces = sum(state.sales, (sale) => sale.soldQty);
  const availableFinishedPieces = Math.max(finishedPieces - soldPieces, 0);
  const schedulePieces = sum(state.schedules, (schedule) => schedule.requiredQty);
  const scheduleAllocations = scheduleSaleAllocations();
  const pendingSchedulePieces = sum(state.schedules, (schedule) => scheduleAllocations.get(schedule.id)?.pending ?? schedule.requiredQty);

  function piecesToKg(componentCode, pieces) {
    const item = getWorkItem(componentCode);
    return Number(pieces || 0) * Number(item?.netInputWeightKg || item?.rawPerPieceKg || 0);
  }

  const semiFinishedKg = sum(state.vendorProductions, (entry) => piecesToKg(entry.componentCode, entry.semiFinishedPieces));
  const finishedKg = sum(state.lots, (lot) => lot.receiptDate ? piecesToKg(lot.componentCode, lot.producedQty) : 0);
  const soldKg = sum(state.sales, (sale) => piecesToKg(sale.componentCode, sale.soldQty));
  const availableFinishedKg = Math.max(finishedKg - soldKg, 0);
  const scheduleKg = sum(state.schedules, (schedule) => piecesToKg(schedule.componentCode, schedule.requiredQty));

  const openLots = state.lots.filter((lot) => !lot.receiptDate).length;
  const openSchedules = state.schedules.filter((schedule) => (scheduleAllocations.get(schedule.id)?.pending ?? schedule.requiredQty) > 0).length;

  const shortageRows = state.schedules
    .map((schedule) => {
      const item = getWorkItem(schedule.componentCode);
      const readyQty = Number(item?.readyStock || 0);
      const requiredQty = Number(scheduleAllocations.get(schedule.id)?.pending ?? schedule.requiredQty);
      const shortage = Math.max(requiredQty - readyQty, 0);
      const daysLeft = Math.ceil((new Date(schedule.dueDate) - new Date(today)) / 86400000);

      return {
        schedule,
        item,
        readyQty,
        requiredQty,
        shortage,
        daysLeft,
      };
    })
    .filter((row) => row.shortage > 0)
    .sort((a, b) => {
      if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
      return b.shortage - a.shortage;
    });

  const overdueShortage = shortageRows.filter((row) => row.daysLeft < 0).length;
  const atRiskShortage = shortageRows.filter((row) => row.daysLeft >= 0 && row.daysLeft <= 7).length;

  const purchaseRequirementKg = shortageRows.reduce((total, row) => {
    const perPieceKg = Number(row.item?.netInputWeightKg || row.item?.rawPerPieceKg || 0);
    return total + (row.shortage * perPieceKg);
  }, 0);

  const todayLabel = document.querySelector("#dashboardToday");
  if (todayLabel) todayLabel.textContent = formatIstDateTime(today).replace("00:00:00", "").trim();

  const kpis = [
    {
      title: "BOS GRN Received",
      value: number(kgToMt(bosGrnKg), 3),
      unit: "MT",
      icon: "truck",
      tone: "teal",
      foot: `${number(state.bosGrns.length)} GRN records`,
      footTone: "good",
      nav: "grn",
    },
    {
      title: "Vendor End GRN Pending",
      value: number(kgToMt(Math.max(issuedToVendorKg - vendorEndGrnKg, 0)), 3),
      unit: "MT",
      icon: "hourglass",
      tone: "orange",
      foot: `${number(openLots)} open job work lots`,
      footTone: openLots > 0 ? "warn" : "good",
      nav: "grn",
      target: "jobWorkAssignmentPage",
    },
    {
      title: "Semi Finished at Vendors",
      value: number(kgToMt(semiFinishedKg), 3),
      unit: "MT",
      icon: "factory",
      tone: "teal",
      foot: `${number(semiFinishedPieces)} semi finished pcs`,
      footTone: "good",
      nav: "vendor",
      vendorTarget: "vendorComponentReadyPage",
    },
    {
      title: "Finished Components Inward",
      value: number(finishedPieces),
      unit: "PCS",
      icon: "clipboard-check",
      tone: "blue",
      foot: `${number(availableFinishedPieces)} pcs available after sales`,
      footTone: "good",
      nav: "vendor",
      vendorTarget: "vendorComponentReadyPage",
    },
    {
      title: "Customer Sales Done",
      value: number(soldPieces),
      unit: "PCS",
      icon: "receipt-indian-rupee",
      tone: "teal",
      foot: `${formatMt(soldKg)} dispatched value qty`,
      footTone: "good",
      nav: "sales",
    },
    {
      title: "Customer Dispatch Pending",
      value: number(pendingSchedulePieces),
      unit: "PCS",
      icon: "calendar-clock",
      tone: "indigo",
      foot: `${number(openSchedules)} open schedules of ${number(schedulePieces)} pcs`,
      footTone: atRiskShortage > 0 ? "warn" : "good",
      nav: "schedule",
    },
    {
      title: "Purchase Requirement",
      value: number(kgToMt(purchaseRequirementKg), 3),
      unit: "MT",
      icon: "shopping-cart",
      tone: "orange",
      foot: `${number(shortageRows.length)} shortage items`,
      footTone: shortageRows.length > 0 ? "warn" : "good",
      nav: "planning",
    },
  ];

  const kpiGrid = document.querySelector("#opsKpiGrid");
  if (kpiGrid) {
    kpiGrid.innerHTML = kpis.map((kpi) => `
      <article class="ops-kpi-card"
        ${kpi.nav ? `data-nav="${h(kpi.nav)}"` : ""}
        ${kpi.target ? `data-grn-target="${h(kpi.target)}"` : ""}
        ${kpi.vendorTarget ? `data-vendor-target="${h(kpi.vendorTarget)}"` : ""}>
        <div class="ops-kpi-head">
          <div class="ops-kpi-icon ${h(kpi.tone)}">
            <i data-lucide="${h(kpi.icon)}"></i>
          </div>
          <div class="ops-kpi-title">${h(kpi.title)}</div>
        </div>
        <div class="ops-kpi-value">${h(kpi.value)} <small>${h(kpi.unit)}</small></div>
        <div class="ops-kpi-foot ${h(kpi.footTone)}">${h(kpi.foot)}</div>
      </article>
    `).join("");
  }

  const pipelineItems = [
    {
      title: "BOS Raw Stock",
      value: formatMt(bosGrnKg),
      orders: state.bosGrns.length,
      components: new Set(state.bosGrns.map((grn) => grn.componentCode)).size,
      status: "On Track",
      tone: "ok",
      icon: "warehouse",
      nav: "grn",
    },
    {
      title: "Issued To Vendor",
      value: formatMt(issuedToVendorKg),
      orders: state.lots.length,
      components: new Set(state.lots.map((lot) => lot.componentCode)).size,
      status: openLots > 0 ? "At Risk" : "On Track",
      tone: openLots > 0 ? "warn" : "ok",
      icon: "send",
      nav: "grn",
      target: "jobWorkAssignmentPage",
    },
    {
      title: "Semi Finished",
      value: formatMt(semiFinishedKg),
      orders: state.vendorProductions.length,
      components: new Set(state.vendorProductions.map((entry) => entry.componentCode)).size,
      status: semiFinishedPieces > 0 ? "On Track" : "At Risk",
      tone: semiFinishedPieces > 0 ? "ok" : "warn",
      icon: "settings",
      nav: "vendor",
      vendorTarget: "vendorComponentReadyPage",
    },
{
  title: "Finished Ready at Vendor",
  value: `${number(finishedPieces)} PCS`,
  orders: state.lots.filter((lot) => lot.receiptDate).length,
  components: new Set(state.lots.filter((lot) => lot.receiptDate).map((lot) => lot.componentCode)).size,
  status: finishedPieces > 0 ? "On Track" : "At Risk",
  tone: finishedPieces > 0 ? "ok" : "warn",
  icon: "package-check",
  nav: "vendor",
  vendorTarget: "vendorComponentReadyPage",
},
{
  title: "Received at BOS",
  value: `${number(availableFinishedPieces)} PCS`,
  orders: state.lots.filter((lot) => lot.receiptDate).length,
  components: new Set(state.lots.filter((lot) => lot.receiptDate).map((lot) => lot.componentCode)).size,
  status: finishedPieces > 0 ? "On Track" : "At Risk",
  tone: finishedPieces > 0 ? "ok" : "warn",
  icon: "warehouse",
  nav: "vendor",
  vendorTarget: "vendorComponentReadyPage",
},
{
  title: "Sold / Dispatch to Customer",
  value: `${number(soldPieces)} PCS`,
  orders: state.sales.length,
  components: new Set(state.sales.map((sale) => sale.componentCode)).size,
  status: overdueShortage > 0 ? "Delayed" : atRiskShortage > 0 ? "At Risk" : "On Track",
  tone: overdueShortage > 0 ? "danger" : atRiskShortage > 0 ? "warn" : "ok",
  icon: "receipt-indian-rupee",
  nav: "sales",
},
  ];

  const pipelineBoard = document.querySelector("#pipelineBoard");
  if (pipelineBoard) {
    pipelineBoard.innerHTML = pipelineItems.map((item) => `
      <article class="pipeline-card"
        ${item.nav ? `data-nav="${h(item.nav)}"` : ""}
        ${item.target ? `data-grn-target="${h(item.target)}"` : ""}
        ${item.vendorTarget ? `data-vendor-target="${h(item.vendorTarget)}"` : ""}>
        <div class="pipeline-title">${h(item.title)}</div>
        <div class="pipeline-main">
          <strong>${h(item.value)}</strong>
          <small>Current position</small>
        </div>
        <div class="pipeline-metrics">
          <div class="pipeline-metric"><span>Work Orders</span><strong>${number(item.orders)}</strong></div>
          <div class="pipeline-metric"><span>Components</span><strong>${number(item.components)}</strong></div>
          <div class="pipeline-metric"><span>Status</span><strong>${h(item.status)}</strong></div>
        </div>
        <div class="pipeline-footer">
          <span class="pipeline-status ${h(item.tone)}">${h(item.status)}</span>
          <span class="pipeline-card-icon"><i data-lucide="${h(item.icon)}"></i></span>
        </div>
      </article>
    `).join("");
  }

  function dateKeyFromOffset(offset) {
    const date = new Date(`${today}T00:00:00+05:30`);
    date.setDate(date.getDate() - offset);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: IST_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  const trendDays = Array.from({ length: 7 }, (_, index) => dateKeyFromOffset(6 - index));
  const trend = trendDays.map((day) => {
    const received = sum(state.bosGrns.filter((grn) => grn.grnDate === day), (grn) => mtToKg(grn.qtyMt));
    const inward = sum(state.lots.filter((lot) => lot.receiptDate === day), (lot) => piecesToKg(lot.componentCode, lot.producedQty));
    const dispatch = sum(state.sales.filter((sale) => sale.saleDate === day), (sale) => piecesToKg(sale.componentCode, sale.soldQty));
    return { day, received, inward, dispatch };
  });

  const maxTrendKg = Math.max(...trend.flatMap((row) => [row.received, row.inward, row.dispatch]), 1);

  const productionTrend = document.querySelector("#productionTrend");
  if (productionTrend) {
    productionTrend.innerHTML = trend.map((row) => {
      const label = new Date(`${row.day}T00:00:00+05:30`).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
      });

      return `
        <div class="trend-day">
          <div class="trend-bars">
            <span class="trend-bar received" title="Received ${formatMt(row.received)}" style="height:${Math.max((row.received / maxTrendKg) * 100, row.received ? 6 : 2)}%"></span>
            <span class="trend-bar inward" title="Inward ${formatMt(row.inward)}" style="height:${Math.max((row.inward / maxTrendKg) * 100, row.inward ? 6 : 2)}%"></span>
            <span class="trend-bar dispatch" title="Dispatch ${formatMt(row.dispatch)}" style="height:${Math.max((row.dispatch / maxTrendKg) * 100, row.dispatch ? 6 : 2)}%"></span>
          </div>
          <span class="trend-label">${h(label)}</span>
        </div>
      `;
    }).join("");
  }

  const trendSummary = document.querySelector("#trendSummary");
  if (trendSummary) {
    trendSummary.innerHTML = `
      <div class="trend-summary-card">
        <span>Total Received</span>
        <strong>${formatMt(sum(trend, (row) => row.received))}</strong>
      </div>
      <div class="trend-summary-card">
        <span>Total Inward</span>
        <strong>${formatMt(sum(trend, (row) => row.inward))}</strong>
      </div>
      <div class="trend-summary-card">
        <span>Total Dispatch</span>
        <strong>${formatMt(sum(trend, (row) => row.dispatch))}</strong>
      </div>
      <div class="trend-summary-card">
        <span>Efficiency</span>
        <strong>${finishedKg > 0 ? `${number((soldKg / finishedKg) * 100, 1)}%` : "0%"}</strong>
      </div>
    `;
  }

  const totalSchedules = Math.max(state.schedules.length, 1);
  const riskCounts = state.schedules.reduce((acc, schedule) => {
    const item = getWorkItem(schedule.componentCode);
    const readyQty = Number(item?.readyStock || 0);
    const pendingQty = Number(scheduleAllocations.get(schedule.id)?.pending ?? schedule.requiredQty);
    const shortage = Math.max(pendingQty - readyQty, 0);
    const daysLeft = Math.ceil((new Date(schedule.dueDate) - new Date(today)) / 86400000);

    if (shortage <= 0) acc.onTrack += 1;
    else if (daysLeft < 0) acc.delayed += 1;
    else if (daysLeft <= 7) acc.atRisk += 1;
    else acc.blocked += 1;

    return acc;
  }, { onTrack: 0, atRisk: 0, delayed: 0, blocked: 0 });

  const onDeg = (riskCounts.onTrack / totalSchedules) * 360;
  const riskDeg = (riskCounts.atRisk / totalSchedules) * 360;
  const delayDeg = (riskCounts.delayed / totalSchedules) * 360;

  const riskDonut = document.querySelector("#riskDonut");
  if (riskDonut) {
    riskDonut.style.setProperty("--on", `${onDeg}deg`);
    riskDonut.style.setProperty("--risk", `${riskDeg}deg`);
    riskDonut.style.setProperty("--delay", `${delayDeg}deg`);
    riskDonut.innerHTML = `<strong>${number(state.schedules.length)}</strong><span>Schedules</span>`;
  }

  const riskList = document.querySelector("#riskList");
  if (riskList) {
    riskList.innerHTML = `
      <div class="risk-row"><span><i class="dot ok-dot"></i> On Track</span><strong>${number(riskCounts.onTrack)}</strong></div>
      <div class="risk-row"><span><i class="dot warn-dot"></i> At Risk</span><strong>${number(riskCounts.atRisk)}</strong></div>
      <div class="risk-row"><span><i class="dot danger-dot"></i> Delayed</span><strong>${number(riskCounts.delayed)}</strong></div>
      <div class="risk-row"><span><i class="dot"></i> Blocked</span><strong>${number(riskCounts.blocked)}</strong></div>
    `;
  }

  const riskNote = document.querySelector("#riskNote");
  if (riskNote) {
    const topRisk = shortageRows[0];
    riskNote.textContent = topRisk
      ? `Top Risk: ${topRisk.schedule.componentCode} has ${number(topRisk.shortage)} pcs shortage for ${topRisk.schedule.customer}.`
      : "No active shortage risk found in current schedule data.";
  }

  const priorityTable = document.querySelector("#priorityComponentsTable");
  if (priorityTable) {
    priorityTable.innerHTML = shortageRows.length === 0
      ? emptyState("No priority shortage found")
      : shortageRows.slice(0, 8).map((row) => {
          const product = getProductMaster(row.schedule.componentCode);
          return `
            <tr>
              <td>${h(row.schedule.componentCode)}</td>
              <td>${h(product?.grade || "-")}</td>
              <td>${product ? `${h(compactNumber(product.sizeMm))} mm` : "-"}</td>
              <td>${number(row.requiredQty)}</td>
              <td>${number(row.readyQty)}</td>
              <td class="shortage-cell">${number(row.shortage)}</td>
              <td>${h(formatIstDateTime(row.schedule.dueDate).replace("00:00:00", "").trim())}</td>
            </tr>
          `;
        }).join("");
  }

  if (window.lucide) lucide.createIcons();
}
function renderMasters() {
  document.querySelector("#vendorMasterTable").innerHTML = state.vendors.length === 0
    ? emptyState("No vendors added yet")
    : state.vendors.map((vendor) => {
        const docs = [
          { label: "PAN", url: vendor.panCardUrl },
          { label: "Aadhar", url: vendor.aadharCardUrl },
          { label: "Cheque", url: vendor.cancelChequeUrl },
          { label: "GST", url: vendor.gstUrl },
          { label: "Other", url: vendor.otherDocUrl },
        ];
        const docBadges = docs
          .filter((d) => d.url)
          .map((d) => `<a href="${h(`${API_ORIGIN}${d.url}`)}" target="_blank" rel="noopener" class="doc-badge" title="View ${d.label}">${h(d.label)}</a>`)
          .join("");
        return `
        <tr>
          <td>
            <strong>${h(vendor.vendorName)}</strong>
            ${vendor.fullAddress ? `<br><small style="color:var(--text-secondary)">${h(vendor.fullAddress)}</small>` : ""}
          </td>
          <td>${h(vendor.city || "-")}</td>
          <td>${h(vendor.contact || "-")}</td>
          <td>${docBadges || '<span style="color:var(--muted);font-size:0.75rem">-</span>'}</td>
          <td style="display:flex;gap:6px;align-items:center;">
            <button class="row-action edit-action" data-edit-vendor="${h(vendor.id)}" title="Edit vendor"><i data-lucide="pencil"></i></button>
            <button class="row-action" data-delete-vendor="${h(vendor.id)}" title="Delete vendor"><i data-lucide="trash-2"></i></button>
          </td>
        </tr>`;
      }).join("");

  document.querySelector("#customerMasterTable").innerHTML = state.customers.length === 0
    ? emptyState("No customers added yet")
    : state.customers.map((customer) => `
        <tr>
          <td>${h(customer.customerName)}</td>
          <td>${h(customer.city || "-")}</td>
          <td>${h(customer.contact || "-")}</td>
          <td><button class="row-action" data-delete-customer="${h(customer.id)}" title="Delete customer"><i data-lucide="trash-2"></i></button></td>
        </tr>`).join("");

  document.querySelector("#productMasterTable").innerHTML = state.productMasters.length === 0
    ? emptyState("No products added yet")
    : state.productMasters.map((product) => `
        <tr>
          <td>${h(product.bpcsNo)}</td>
          <td>${h(product.vendorName)}</td>
          <td>${h(product.shape)}</td>
          <td>${h(product.grade)}</td>
          <td>${number(product.sizeMm, 2)} mm</td>
          <td>${number(product.inputWeightKg, 3)} kg</td>
          <td>${number(product.netInputWeightKg, 3)} kg</td>
          <td>PCS</td>
          <td><button class="row-action" data-delete-product="${h(product.id)}" title="Delete product"><i data-lucide="trash-2"></i></button></td>
        </tr>`).join("");

  addTableSearch("vendorMasterTable", "vendorMasterTable", "Vendor name search...");
  addTableSearch("productMasterTable", "productMasterTable", "BPCS / grade / vendor search...");
  addTableSearch("customerMasterTable", "customerMasterTable", "Customer name search...");
}

function renderLots() {
  const sortedGrns = [...state.bosGrns].sort((a, b) => b.grnDate.localeCompare(a.grnDate));
  const pendingGrns = sortedGrns.filter((grn) => Math.max(mtToKg(grn.qtyMt) - rawAssignedByBosGrn(grn), 0) > 0);
  document.querySelector("#lotTable").innerHTML = pendingGrns.length === 0
    ? emptyState("No BOS GRN rows available for assignment")
    : pendingGrns.map((grn) => {
        const product = getProductById(grn.productId) || getProductMaster(grn.componentCode, grn.vendorName);
        const receivedKg = mtToKg(grn.qtyMt);
        const assignedKg = rawAssignedByBosGrn(grn);
        const balanceKg = Math.max(receivedKg - assignedKg, 0);
        return `
          <tr>
            <td>${h(formatIstDateTime(grn.grnDate))}</td>
            <td>${h(grn.supplierInvoice)}</td>
            <td>${h(product?.bpcsNo || grn.componentCode)}</td>
            <td>${h(grn.vendorName || product?.vendorName || "-")}</td>
            <td>${formatMt(receivedKg)}</td>
            <td>${formatMt(assignedKg)}</td>
            <td>${formatMt(balanceKg)}</td>
            <td>
              <button class="action-btn" data-assign-grn="${h(grn.id)}" title="Job Work assign karein" ${balanceKg <= 0 ? "disabled" : ""}>
                <i data-lucide="send"></i> Assign JW
              </button>
            </td>
          </tr>`;
      }).join("");

  addTableSearch("lotTable", "lotTable", "Invoice / component / vendor search...");
}

function renderSchedules() {
  const sortedSchedules = [...state.schedules].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const allocations = scheduleSaleAllocations();
  document.querySelector("#scheduleTable").innerHTML = sortedSchedules.length === 0
    ? emptyState("No schedules added yet")
    : sortedSchedules.map((schedule) => {
        const component = getWorkItem(schedule.componentCode);
        const ready = Number(component?.readyStock || 0);
        const semiReady = Number(component?.semiFinishedStock || 0);
        const soldAgainstSchedule = Number(allocations.get(schedule.id)?.sold || 0);
        const salePending = Number(allocations.get(schedule.id)?.pending ?? schedule.requiredQty);
        const shortage = Math.max(salePending - ready, 0);
        const isOverdue = schedule.dueDate < today;
        return `
          <tr${isOverdue ? ' style="background:#fff5f5;"' : ""}>
            <td>${h(schedule.customer)}</td>
            <td>${h(component?.name || schedule.componentCode)}</td>
            <td><span class="raw-chip">${h(rawMaterialLabel(component))}</span></td>
            <td${isOverdue ? ' style="color:var(--danger);font-weight:700;"' : ""}>${h(formatIstDateTime(schedule.dueDate))}${isOverdue ? " ⚠" : ""}</td>
            <td>${number(schedule.requiredQty)} pcs</td>
            <td>${number(soldAgainstSchedule)} pcs</td>
            <td>${number(salePending)} pcs</td>
            <td>${number(semiReady)} pcs</td>
            <td>${number(ready)} pcs</td>
            <td${shortage > 0 ? ' style="color:var(--danger);font-weight:700;"' : ""}>${number(shortage)} pcs</td>
            <td><button class="row-action" data-delete-schedule="${h(schedule.id)}" title="Delete schedule"><i data-lucide="trash-2"></i></button></td>
          </tr>`;
      }).join("");

  addTableSearch("scheduleTable", "scheduleTable", "Customer / component / date search...");

  const dispatchItems = allWorkItems().filter((c) => demandQuantity(c.code) > 0);
  document.querySelector("#readinessList").innerHTML = dispatchItems.length === 0
    ? `<div class="empty-state"><strong>No schedules to show readiness for</strong></div>`
    : dispatchItems.map((component) => {
        const demand = demandQuantity(component.code);
        const ready = Number(component.readyStock);
        const percentage = demand ? Math.min((ready / demand) * 100, 100) : 100;
        return `
          <div class="ready-item">
            <strong>${h(component.code)} - ${h(component.name)}</strong>
            <span>${number(component.producedStock || 0)} produced / ${number(component.soldStock || 0)} sold / ${number(component.finishedStock || 0)} available / ${number(demand)} pending</span>
            <div class="progress"><div style="width:${percentage}%"></div></div>
          </div>`;
      }).join("");
}

function renderSales() {
  const stockItems = allWorkItems().filter((component) =>
    Number(component.finishedStock || 0) > 0
  );
  document.querySelector("#salesStockList").innerHTML = stockItems.length === 0
    ? emptyState("No finished stock available for sale")
    : stockItems.map((component) => {
        const produced = Number(component.producedStock || 0);
        const sold = Number(component.soldStock || 0);
        const available = Number(component.finishedStock || 0);
        const pending = demandQuantity(component.code);
        return `
          <tr>
            <td>${h(component.code)}<br><small style="color:var(--text-secondary)">${h(component.name)}</small></td>
            <td>${number(produced)} pcs</td>
            <td>${number(sold)} pcs</td>
            <td><strong>${number(available)} pcs</strong></td>
            <td>${number(pending)} pcs</td>
            <td>
              <button class="action-btn" data-sale-component="${h(component.code)}" title="Sale details fill karein">
                <i data-lucide="receipt-indian-rupee"></i> Sale
              </button>
            </td>
          </tr>`;
      }).join("");

  const sortedSales = [...state.sales].sort((a, b) => String(b.saleDate || "").localeCompare(String(a.saleDate || "")));
  document.querySelector("#salesTable").innerHTML = sortedSales.length === 0
    ? emptyState("No sales records yet")
    : sortedSales.map((sale) => {
        const component = getWorkItem(sale.componentCode);
        const rate = Number(sale.ratePerPiece || 0);
        const amount = Number(sale.soldQty || 0) * rate;
        return `
          <tr>
            <td>${h(formatIstDateTime(sale.saleDate))}</td>
            <td>${h(sale.invoiceNo)}</td>
            <td>${h(sale.customer)}</td>
            <td>${h(component?.code || sale.componentCode)}${component ? `<br><small style="color:var(--text-secondary)">${h(component.name)}</small>` : ""}</td>
            <td>${number(sale.soldQty)} pcs</td>
            <td>${rate ? number(rate, 2) : "-"}</td>
            <td>${rate ? number(amount, 2) : "-"}</td>
            <td>${h(sale.remarks || "-")}</td>
            <td><button class="row-action" data-delete-sale="${h(sale.id)}" title="Delete sale"><i data-lucide="trash-2"></i></button></td>
          </tr>`;
      }).join("");

  addTableSearch("salesTable", "salesTable", "Invoice / customer / component search...");
}

function renderPlanning() {
  const items = allWorkItems().filter((c) => demandQuantity(c.code) > 0 || openQuantity(c.code) > 0);
  const rows = items.map((component) => {
    const demand = demandQuantity(component.code);
    const ready = Number(component.readyStock);
    const semiReady = Number(component.semiFinishedStock || 0);
    const open = openQuantity(component.code);
    const dispatchShortage = Math.max(demand - ready, 0);
    const rawGapQty = Math.max(demand - ready - semiReady - open, 0);
    const rawNeeded = rawGapQty > 0 ? rawGapQty * component.rawPerPieceKg : 0;
    const rawAvailable = rawAvailableByCode(component.rawCode);
    const rawNeededMt = kgToMt(rawNeeded);
    const rawAvailableMt = kgToMt(rawAvailable);
    const priority = schedulePriority(component.code);
    const allocations = scheduleSaleAllocations();
    const nearestDue = state.schedules
      .filter((s) => s.componentCode === component.code && (allocations.get(s.id)?.pending ?? s.requiredQty) > 0)
      .map((s) => s.dueDate)
      .sort()[0] || "-";
    const action =
      rawGapQty === 0
        ? `<span class="badge ok">Covered</span>`
        : rawAvailable >= rawNeeded
          ? `<span class="badge warn">Issue ${number(rawNeededMt, 3)} MT to vendor</span>`
          : `<span class="badge danger">Purchase ${number(kgToMt(rawNeeded - rawAvailable), 3)} MT</span>`;

    return { component, priority, nearestDue, demand, semiReady, ready, open, dispatchShortage, rawGapQty, rawNeededMt, rawAvailableMt, action };
  });

  const priorityOrder = { urgent: 0, soon: 1, ok: 2, "": 3 };
  rows.sort((a, b) => (priorityOrder[a.priority.tone] ?? 3) - (priorityOrder[b.priority.tone] ?? 3));

  document.querySelector("#planningTable").innerHTML = rows.length === 0
    ? emptyState("No pending planning items")
    : rows.map(({ component, priority, nearestDue, demand, semiReady, ready, open, dispatchShortage, rawGapQty, rawNeededMt, rawAvailableMt, action }) => `
        <tr>
          <td>${priority.tone ? `<span class="badge ${priority.tone}">${priority.label}</span>` : "-"}</td>
          <td>${h(component.code)} - ${h(component.name)}</td>
          <td><span class="raw-chip strong">${h(rawMaterialLabel(component))}</span></td>
          <td>${h(formatIstDateTime(nearestDue))}</td>
          <td>${number(demand)}</td>
          <td>${number(semiReady)}</td>
          <td>${number(ready)}</td>
          <td>${number(open)}</td>
          <td${dispatchShortage > 0 ? ' style="color:var(--danger);font-weight:700;"' : ""}>${number(dispatchShortage)}</td>
          <td${rawGapQty > 0 ? ' style="color:var(--danger);font-weight:700;"' : ""}>${number(rawGapQty)}</td>
          <td>${number(rawNeededMt, 3)} MT</td>
          <td>${number(rawAvailableMt, 3)} MT</td>
          <td>${action}</td>
        </tr>`).join("");
}

function renderGrns() {
  const sortedBosGrns = [...state.bosGrns].sort((a, b) => b.grnDate.localeCompare(a.grnDate));
  document.querySelector("#ourEndGrnTable").innerHTML = sortedBosGrns.length === 0
    ? emptyState("No BOS GRN records yet")
    : sortedBosGrns.map((grn) => {
        const product = getProductById(grn.productId) || getProductMaster(grn.componentCode);
        return `
          <tr>
            <td>${h(formatIstDateTime(grn.grnDate))}</td>
            <td>${h(grn.supplierInvoice)}</td>
            <td>${h(grn.componentCode)}</td>
            <td>${h(grn.vendorName || product?.vendorName || "-")}</td>
            <td>${h(product?.grade || "-")}</td>
          <td>${product ? `${compactNumber(product.sizeMm)} mm` : "-"}</td>
            <td>${h(product?.shape || "-")}</td>
            <td>${number(grn.qtyMt, 3)} MT</td>
            <td><button class="row-action" data-delete-our-grn="${h(grn.id)}" title="Delete GRN"><i data-lucide="trash-2"></i></button></td>
          </tr>`;
      }).join("");

  const sortedLots = [...state.lots].sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  const pendingVendorLots = sortedLots.filter((lot) => kgToMt(lot.rawIssuedKg) - vendorGrnReceivedByLot(lot.lotNo) > 0);
  document.querySelector("#vendorEndGrnTable").innerHTML = pendingVendorLots.length === 0
    ? emptyState("No pending vendor GRN - all assignments confirmed")
    : pendingVendorLots.map((lot) => {
        const componentCode = lot.componentCode;
        const product = getProductMaster(componentCode, lot.vendor);
        const workItem = getWorkItem(componentCode);
        const receivedMt = vendorGrnReceivedByLot(lot.lotNo);
        const balanceMt = Math.max(kgToMt(lot.rawIssuedKg) - receivedMt, 0);
        return `
          <tr>
            <td>${h(formatIstDateTime(lot.issueDate))}</td>
            <td>${workItem ? h(workItem.name) : h(componentCode)}</td>
            <td>${h(lot.vendor || "-")}</td>
            <td>${h(componentCode || "-")}</td>
            <td>${h(product?.grade || "-")}</td>
            <td>${product ? `${compactNumber(product.sizeMm)} mm` : "-"}</td>
            <td>${h(product?.shape || "-")}</td>
            <td>${formatMt(lot.rawIssuedKg)}</td>
            <td>${number(receivedMt, 3)} MT</td>
            <td>
              <button class="action-btn" data-vendor-grn-lot="${h(lot.lotNo)}" title="Vendor GRN confirm karein" ${balanceMt <= 0 ? "disabled" : ""}>
                <i data-lucide="clipboard-check"></i> Confirm GRN
              </button>
            </td>
          </tr>`;
      }).join("");

  const sortedVendorGrns = [...state.vendorEndGrns].sort((a, b) =>
    String(b.grnDate || "").localeCompare(String(a.grnDate || ""))
  );
  document.querySelector("#confirmedVendorGrnTable").innerHTML = sortedVendorGrns.length === 0
    ? emptyState("No confirmed vendor GRN records yet")
    : sortedVendorGrns.map((grn) => {
        const lot = state.lots.find((l) => l.lotNo === grn.lotNo);
        const product = lot ? getProductMaster(lot.componentCode, lot.vendor) : null;
        return `
          <tr>
            <td>${h(formatIstDateTime(grn.grnDate))}</td>
            <td>${h(grn.lotNo || "-")}</td>
            <td>${h(lot?.componentCode || "-")}</td>
            <td>${h(lot?.vendor || "-")}</td>
            <td>${h(product?.grade || "-")}</td>
            <td>${product ? `${compactNumber(product.sizeMm)} mm` : "-"}</td>
            <td>${lot ? formatMt(lot.rawIssuedKg) : "-"}</td>
            <td>${number(grn.receivedMt, 3)} MT</td>
            <td>${h(grn.remarks || "-")}</td>
            <td><button class="row-action" data-delete-vendor-grn="${h(grn.id)}" title="Delete vendor GRN"><i data-lucide="trash-2"></i></button></td>
          </tr>`;
      }).join("");

  addTableSearch("ourEndGrnTable", "ourEndGrnTable", "Invoice / BPCS search...");
  addTableSearch("vendorEndGrnTable", "vendorEndGrnTable", "Assignment / product / vendor search...");
  addTableSearch("confirmedVendorGrnTable", "confirmedVendorGrnTable", "Lot / vendor / part search...");
}

function semiFinishedForLot(lotNo) {
  const semiProduced = semiFinishedProducedForLot(lotNo);
  const lot = state.lots.find((item) => item.lotNo === lotNo);
  return Math.max(semiProduced - Number(lot?.producedQty || 0), 0);
}

function semiFinishedProducedForLot(lotNo) {
  return state.vendorProductions
    .filter((entry) => entry.lotNo === lotNo)
    .reduce((sum, entry) => sum + Number(entry.semiFinishedPieces || 0), 0);
}

function renderComponentsReady() {
  const readyLots = state.lots
    .filter((lot) => vendorGrnReceivedByLot(lot.lotNo) > 0 && (remainingReadyPieces(lot) > 0 || Number(lot.producedQty || 0) > 0 || semiFinishedForLot(lot.lotNo) > 0))
    .sort((a, b) => String(b.receiptDate || b.issueDate).localeCompare(String(a.receiptDate || a.issueDate)));

  document.querySelector("#componentsReadyTable").innerHTML = readyLots.length === 0
    ? emptyState("No components ready updates yet")
    : readyLots.map((lot) => {
        const component = getWorkItem(lot.componentCode);
        const canUpdate = canUpdateComponentsReady(lot);
        return `
          <tr>
            <td>${h(formatIstDateTime(lot.receiptDate))}</td>
            <td>${h(lot.lotNo)}</td>
            <td>${h(lot.vendor)}</td>
            <td>${h(component?.code || lot.componentCode)}</td>
            <td>${number(vendorGrnReceivedByLot(lot.lotNo), 3)} MT</td>
            <td>${number(semiFinishedForLot(lot.lotNo))} pcs</td>
            <td>${number(lot.producedQty)} pcs</td>
            <td>${formatKg(endCutKgForLot(lot))}</td>
            <td>
              <button class="action-btn" data-components-ready-lot="${h(lot.lotNo)}" title="Components ready update karein" ${canUpdate ? "" : "disabled"}>
                <i data-lucide="package-check"></i> Update Ready
              </button>
            </td>
          </tr>`;
      }).join("");

  addTableSearch("componentsReadyTable", "componentsReadyTable", "Assignment / vendor / part search...");
}

function flowStatusLabel(grn, lot) {
  if (!lot) return { label: "Pending JW Assignment", tone: "warn" };
  const receivedMt = vendorGrnReceivedByLot(lot.lotNo);
  if (receivedMt <= 0) return { label: "Pending Vendor GRN", tone: "warn" };
  if (!lot.receiptDate) return { label: "Pending Components Ready", tone: "warn" };
  const produced = Number(lot.producedQty || 0);
  if (produced === 0) return { label: "No Output - Verify", tone: "danger" };
  const totalProduced = productionQty(lot.componentCode, "finished");
  const totalSold = salesQty(lot.componentCode);
  const available = Math.max(totalProduced - totalSold, 0);
  if (totalSold === 0) return { label: "Ready for Sale", tone: "ok" };
  if (available > 0) return { label: "Partially Sold", tone: "warn" };
  return { label: "Sold / Complete", tone: "ok" };
}

function renderFlowStatus() {
  const rows = [];
  state.bosGrns.forEach((grn) => {
    const relatedLots = lotsForBosGrn(grn);
    if (!relatedLots.length) {
      rows.push({ grn, lot: null });
      return;
    }
    relatedLots.forEach((lot) => rows.push({ grn, lot }));
  });

  document.querySelector("#flowStatusTable").innerHTML = rows.length === 0
    ? emptyState("No flow status available yet")
    : rows.map(({ grn, lot }) => {
      const product = getProductById(grn.productId) || getProductMaster(grn.componentCode);
      const expected = lot ? expectedPieces(lot) : 0;
      const sold = lot ? salesQty(lot.componentCode) : 0;
      const available = lot ? finishedAvailableQty(lot.componentCode) : 0;
      const status = flowStatusLabel(grn, lot);
      return `
        <tr>
          <td>${h(formatIstDateTime(grn.grnDate))}</td>
          <td>${h(product?.bpcsNo || grn.componentCode)}</td>
          <td>${h(lot?.vendor || grn.vendorName || product?.vendorName || "-")}</td>
          <td>${number(grn.qtyMt, 3)} MT</td>
          <td>${h(lot?.lotNo || "-")}</td>
          <td>${lot ? formatMt(lot.rawIssuedKg) : "0.000 MT"}</td>
          <td>${lot ? `${number(vendorGrnReceivedByLot(lot.lotNo), 3)} MT` : "0.000 MT"}</td>
          <td>${lot ? `${number(expected)} pcs` : "-"}</td>
          <td>${lot ? `${number(semiFinishedForLot(lot.lotNo))} pcs` : "-"}</td>
          <td>${lot ? `${number(lot.producedQty)} pcs` : "-"}</td>
          <td>${lot ? `${number(sold)} pcs` : "-"}</td>
          <td>${lot ? `${number(available)} pcs` : "-"}</td>
          <td>${lot ? `${number(pendingPieces(lot))} pcs` : "-"}</td>
          <td>${lot ? formatKg(endCutKgForLot(lot)) : "0.000 KG"}</td>
          <td><span class="badge ${status.tone}">${status.label}</span></td>
        </tr>`;
    }).join("");

  addTableSearch("flowStatusTable", "flowStatusTable", "Product / vendor / status search...");
}

function renderCustomerDashboard() {
  if (!elements.customerSummaryGrid || !elements.customerMaterialTable) return;
  const rows = allWorkItems().map((component) => {
    const rawPerPieceKg = Number(component.rawPerPieceKg || component.netInputWeightKg || 0);
    const bosRawKg = rawAssignableByComponent(component.code);
    const vendorRawKg = state.lots
      .filter((lot) => lot.componentCode === component.code)
      .reduce((total, lot) => {
        const receivedKg = vendorReceivedKgForLot(lot.lotNo);
        const consumedKg = Number(lot.producedQty || 0) * rawPerPieceKg + Number(lot.endCutKg || 0);
        return total + Math.max(receivedKg - consumedKg, 0);
      }, 0);
    const possibleFromBos = rawPerPieceKg > 0 ? Math.floor(bosRawKg / rawPerPieceKg) : 0;
    const possibleAtVendor = rawPerPieceKg > 0 ? Math.floor(vendorRawKg / rawPerPieceKg) : 0;
    const ready = Number(component.readyStock || 0);
    const semi = Number(component.semiFinishedStock || 0);
    const pending = demandQuantity(component.code);
    const totalPossible = ready + possibleAtVendor + possibleFromBos;
    const gap = Math.max(pending - totalPossible, 0);
    const readyGap = Math.max(pending - ready, 0);
    const decision = pending <= 0
      ? { label: "Plan as needed", tone: "ok", rank: 4 }
      : ready >= pending
        ? { label: "Schedule safe", tone: "ok", rank: 3 }
        : ready + possibleAtVendor >= pending
          ? { label: "Wait for vendor output", tone: "warn", rank: 2 }
          : totalPossible >= pending
            ? { label: "BOS raw available", tone: "warn", rank: 1 }
            : { label: "Raw shortage", tone: "danger", rank: 0 };

    return { component, bosRawKg, vendorRawKg, possibleFromBos, possibleAtVendor, totalPossible, ready, semi, pending, readyGap, gap, decision };
  });

  const totals = rows.reduce((summary, row) => {
    summary.possibleFromBos += row.possibleFromBos;
    summary.possibleAtVendor += row.possibleAtVendor;
    summary.ready += row.ready;
    summary.pending += row.pending;
    summary.gap += row.gap;
    return summary;
  }, { possibleFromBos: 0, possibleAtVendor: 0, ready: 0, pending: 0, gap: 0 });

  elements.customerSummaryGrid.innerHTML = `
    <div class="customer-summary-card ok">
      <span>Ready Now</span>
      <strong>${number(totals.ready)} pcs</strong>
    </div>
    <div class="customer-summary-card warn">
      <span>Vendor Can Make</span>
      <strong>${number(totals.possibleAtVendor)} pcs</strong>
    </div>
    <div class="customer-summary-card warn">
      <span>BOS Raw Can Make</span>
      <strong>${number(totals.possibleFromBos)} pcs</strong>
    </div>
    <div class="customer-summary-card">
      <span>Pending Schedule</span>
      <strong>${number(totals.pending)} pcs</strong>
    </div>
    <div class="customer-summary-card ${totals.gap > 0 ? "danger" : "ok"}">
      <span>Shortage Gap</span>
      <strong>${number(totals.gap)} pcs</strong>
    </div>
  `;

  const priorityRows = rows
    .filter((row) => row.pending > 0)
    .sort((a, b) => (b.gap - a.gap) || (a.decision.rank - b.decision.rank) || (b.pending - a.pending));

  if (elements.customerPriorityTable) {
    elements.customerPriorityTable.innerHTML = priorityRows.length === 0
      ? emptyState("No pending customer schedule")
      : priorityRows.map((row) => `
          <tr>
            <td>${h(row.component.code)} - ${h(row.component.name)}</td>
            <td>${number(row.pending)} pcs</td>
            <td>${number(row.ready)} pcs</td>
            <td>${number(row.totalPossible)} pcs</td>
            <td class="${row.gap > 0 ? "text-danger" : "text-ok"}">${number(row.gap)} pcs</td>
            <td><span class="badge ${row.decision.tone}">${h(row.decision.label)}</span></td>
          </tr>
        `).join("");
  }

  const sortedRows = [...rows].sort((a, b) => (b.pending - a.pending) || (b.gap - a.gap) || a.component.code.localeCompare(b.component.code));

  elements.customerMaterialTable.innerHTML = sortedRows.length === 0
    ? emptyState("No product availability found")
    : sortedRows.map((row) => `
        <tr>
          <td>${h(row.component.code)} - ${h(row.component.name)}</td>
          <td>${number(kgToMt(row.bosRawKg), 3)} MT</td>
          <td>${number(kgToMt(row.vendorRawKg), 3)} MT</td>
          <td>${number(row.possibleFromBos)} pcs</td>
          <td>${number(row.possibleAtVendor)} pcs</td>
          <td>${number(row.semi)} pcs</td>
          <td>${number(row.ready)} pcs</td>
          <td>${number(row.pending)} pcs</td>
          <td class="${row.gap > 0 ? "text-danger" : "text-ok"}">${number(row.gap)} pcs</td>
          <td><span class="badge ${row.decision.tone}">${h(row.decision.label)}</span></td>
        </tr>
      `).join("");

  const sortedSales = [...state.sales].sort((a, b) => String(b.saleDate || "").localeCompare(String(a.saleDate || "")));
  const totalSoldQty = sortedSales.reduce((sum, sale) => sum + Number(sale.soldQty || 0), 0);
  const totalAmount = sortedSales.reduce((sum, sale) => sum + Number(sale.soldQty || 0) * Number(sale.ratePerPiece || 0), 0);
  const lastSaleDate = sortedSales[0]?.saleDate ? formatIstDateTime(sortedSales[0].saleDate) : "-";
  const productSales = new Map();
  sortedSales.forEach((sale) => {
    const current = productSales.get(sale.componentCode) || 0;
    productSales.set(sale.componentCode, current + Number(sale.soldQty || 0));
  });
  const topProduct = [...productSales.entries()].sort((a, b) => b[1] - a[1])[0];

  if (elements.customerSalesSummary) {
    elements.customerSalesSummary.innerHTML = `
      <div class="customer-sales-card">
        <span>Total Sold</span>
        <strong>${number(totalSoldQty)} pcs</strong>
      </div>
      <div class="customer-sales-card">
        <span>Total Amount</span>
        <strong>Rs ${number(totalAmount, 2)}</strong>
      </div>
      <div class="customer-sales-card">
        <span>Last Sale</span>
        <strong>${h(lastSaleDate)}</strong>
      </div>
      <div class="customer-sales-card">
        <span>Top Product</span>
        <strong>${topProduct ? `${h(topProduct[0])} (${number(topProduct[1])} pcs)` : "-"}</strong>
      </div>
    `;
  }

  if (elements.customerSalesHistoryTable) {
    elements.customerSalesHistoryTable.innerHTML = sortedSales.length === 0
      ? emptyState("No sales history yet")
      : sortedSales.map((sale) => {
          const qty = Number(sale.soldQty || 0);
          const rate = Number(sale.ratePerPiece || 0);
          const amount = qty * rate;
          const product = getWorkItem(sale.componentCode);
          return `
            <tr>
              <td>${h(formatIstDateTime(sale.saleDate))}</td>
              <td>${h(sale.invoiceNo)}</td>
              <td>${h(product ? `${product.code} - ${product.name}` : sale.componentCode)}</td>
              <td>${number(qty)} pcs</td>
              <td>${rate ? `Rs ${number(rate, 2)}` : "-"}</td>
              <td>${amount ? `Rs ${number(amount, 2)}` : "-"}</td>
              <td>${h(sale.remarks || "-")}</td>
            </tr>
          `;
        }).join("");
  }
}

function renderAll() {
  renderSelects();
  renderDashboard();
  renderCustomerDashboard();
  renderMasters();
  renderLots();
  renderGrns();
  renderComponentsReady();
  renderSchedules();
  renderSales();
  renderPlanning();
  renderFlowStatus();
  renderActionLaunchers();
  if (window.lucide) lucide.createIcons();
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

const formModalConfig = {
  vendorMasterForm: { label: "Vendor Master", target: "#vendorMasterTable" },
  productMasterForm: { label: "Product Master", target: "#productMasterTable" },
  customerMasterForm: { label: "Customer Master", target: "#customerMasterTable" },
  ourEndGrnForm: { label: "BOS GRN", target: "#ourEndGrnTable" },
  issueForm: { label: "Job Work Assignment", target: "#lotTable" },
  vendorEndGrnForm: { label: "Vendor GRN", target: "#vendorEndGrnTable" },
  receiptForm: { label: "Components Ready", target: "#componentsReadyTable" },
  scheduleForm: { label: "Customer Schedule", target: "#scheduleTable" },
  salesForm: { label: "Customer Sale", target: "#salesTable" },
};

let activeFormModal = null;
let vendorEditId = null;

function updateUploadCardStatus(card, file, existingUrl) {
  const statusEl = card.querySelector(".upload-card-status");
  const optEl = card.querySelector(".upload-card-opt");
  if (file) {
    card.classList.add("has-file");
    statusEl.textContent = file.name;
    optEl.textContent = "Ready to upload";
  } else if (existingUrl) {
    card.classList.add("has-file");
    statusEl.textContent = "Uploaded - Click to replace";
    optEl.textContent = "Uploaded";
  } else {
    card.classList.remove("has-file");
    statusEl.textContent = "Click to upload";
    optEl.textContent = "Optional";
  }
}

function resetUploadCards(form) {
  form.querySelectorAll(".upload-card").forEach((card) => {
    delete card.dataset.existingUrl;
    updateUploadCardStatus(card, null, null);
  });
}

function editVendor(vendor) {
  vendorEditId = vendor.id;
  const form = elements.vendorMasterForm;
  form.reset();
  form.elements.vendorName.value = vendor.vendorName || "";
  form.elements.city.value = vendor.city || "";
  form.elements.contact.value = vendor.contact || "";
  form.elements.fullAddress.value = vendor.fullAddress || "";

  const docMap = {
    panCard: vendor.panCardUrl,
    aadharCard: vendor.aadharCardUrl,
    cancelCheque: vendor.cancelChequeUrl,
    gstDoc: vendor.gstUrl,
    otherDoc: vendor.otherDocUrl,
  };
  Object.entries(docMap).forEach(([fieldName, url]) => {
    const card = form.querySelector(`[data-field="${fieldName}"]`);
    if (!card) return;
    if (url) card.dataset.existingUrl = url;
    updateUploadCardStatus(card, null, url || null);
  });

  const btn = form.querySelector("[type='submit']");
  btn.innerHTML = `<i data-lucide="save"></i> Update Vendor`;
  openFormModal("vendorMasterForm");
  if (window.lucide) lucide.createIcons();
}

function initFormLaunchers() {
  Object.entries(formModalConfig).forEach(([formId, config]) => {
    const form = document.getElementById(formId);
    if (!form || form.dataset.launcherReady) return;

    form.dataset.launcherReady = "true";
    form.dataset.targetSelector = config.target;
    const launcher = document.createElement("div");
    launcher.className = "panel form-launcher";
    launcher.innerHTML = `
      <button type="button" class="add-form-button" data-open-form="${h(formId)}">
        <i data-lucide="plus"></i>
        ${h(config.label)}
      </button>`;
    form.before(launcher);
  });
}

function openFormModal(formId) {
  const form = document.getElementById(formId);
  const config = formModalConfig[formId];
  if (!form || !config) return;
  closeActiveFormModal();

  const marker = document.createComment(`form:${formId}`);
  form.before(marker);

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay form-modal-overlay";
  overlay.innerHTML = `
    <div class="modal-box form-modal-box">
      <div class="form-modal-head">
        <strong>${h(config.label)}</strong>
        <button type="button" class="modal-close" title="Close">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="form-modal-body"></div>
    </div>`;
  overlay.querySelector(".form-modal-body").appendChild(form);
  document.body.appendChild(overlay);
  activeFormModal = { overlay, form, marker };
  setDefaultDates();

  overlay.querySelector(".modal-close").addEventListener("click", closeActiveFormModal);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeActiveFormModal();
  });
  if (window.lucide) lucide.createIcons();
  form.querySelector("input, select, textarea")?.focus();
}

function closeActiveFormModal() {
  if (!activeFormModal) return;
  const { overlay, form, marker } = activeFormModal;
  form.querySelectorAll("[data-flow-locked]").forEach((field) => {
    field.removeAttribute("data-flow-locked");
    field.readOnly = false;
  });
  if (form.id === "vendorMasterForm" && vendorEditId) {
    vendorEditId = null;
    form.reset();
    resetUploadCards(form);
    form.querySelector("[type='submit']").innerHTML = `<i data-lucide="plus"></i> Add Vendor`;
  }
  marker.replaceWith(form);
  overlay.remove();
  activeFormModal = null;
}

function scrollToFormData(form) {
  const target = document.querySelector(form?.dataset.targetSelector);
  const panel = target?.closest(".panel") || target;
  panel?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function startJobWorkFromGrn(grnId) {
  const grn = state.bosGrns.find((item) => item.id === grnId);
  if (!grn) return;
  const product = getProductById(grn.productId) || getProductMaster(grn.componentCode);
  const form = elements.issueForm;
  form.reset();
  form.elements.bosGrnId.value = grn.id;
  form.elements.componentCode.value = grn.componentCode;
  form.elements.vendor.value = grn.vendorName || product?.vendorName || "";
  form.elements.issueDate.value = today;
  form.elements.rawIssuedKg.value = "";
  updateIssueRemainingHint();
  openFormModal("issueForm");
  form.elements.componentCode.dataset.flowLocked = "true";
  form.elements.vendor.readOnly = true;
  form.elements.vendor.dataset.flowLocked = "true";
}

function startVendorGrnFromLot(lotNo) {
  const lot = state.lots.find((item) => item.lotNo === lotNo);
  if (!lot) return;
  const form = elements.vendorEndGrnForm;
  form.reset();
  form.elements.bosGrnId.value = lot.lotNo;
  form.elements.grnDate.value = today;
  form.elements.receivedMt.value = "";
  fillVendorGrnDetails();
  openFormModal("vendorEndGrnForm");
  form.elements.bosGrnId.dataset.flowLocked = "true";
}

function startComponentsReadyFromLot(lotNo) {
  const lot = state.lots.find((item) => item.lotNo === lotNo);
  if (!lot) return;
  if (vendorGrnReceivedByLot(lot.lotNo) <= 0) {
    showToast("Vendor GRN confirm hone ke baad hi Components Ready update karein", "warn");
    return;
  }
  if (!canUpdateComponentsReady(lot)) {
    showToast("Is assignment me remaining ready quantity nahi hai", "warn");
    return;
  }

  const form = elements.receiptForm;
  form.reset();

  form.elements.lotNo.value = lot.lotNo;
  form.elements.receiptDate.value = lot.receiptDate || today;
  form.elements.semiFinishedPieces.value = "";
  form.elements.finishedPieces.value = "";
  form.elements.endCutKg.value = "";

  updateReceiptCalculations();
  openFormModal("receiptForm");
  form.elements.lotNo.dataset.flowLocked = "true";
}

function startSaleFromStock(componentCode) {
  const component = getWorkItem(componentCode);
  if (!component) return;
  const available = finishedAvailableQty(component.code);
  if (available <= 0) {
    showToast("Is component ka finished stock available nahi hai", "warn");
    return;
  }

  const form = elements.salesForm;
  form.reset();
  form.elements.componentCode.value = component.code;
  form.elements.saleDate.value = today;
  form.elements.soldQty.value = "";
  updateSalesAvailability();
  openFormModal("salesForm");
  form.elements.componentCode.dataset.flowLocked = "true";
  form.elements.customer.focus();
}

async function publicApiRequest(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body || {}),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Request failed: ${response.status}`);
  }

  return data;
}

async function apiRequest(path, options = {}) {
const method = options.method || "GET";

const response = await fetch(`${API_BASE}${path}`, {
  credentials: "include",
  ...options,
  headers: authHeaders({
    "Content-Type": "application/json",
    ...(options.headers || {}),
  }, method),
});

  let result = null;
  try {
    result = await response.json();
  } catch {
    result = {};
  }
if (response.status === 401) {
  clearApiToken();
  showLogin("Session expired. Dobara login karein.");
  throw new Error("Session expired. Dobara login karein.");
}

if (!response.ok || result.success === false) {
  throw new Error(result.message || `Request failed: ${response.status}`);
}
  return result;
}

async function saveViaApi(path, body, successMessage, form) {
  await apiRequest(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  form?.reset();
  setDefaultDates();
  await loadStateFromApi();
  showToast(successMessage);
  closeActiveFormModal();
  scrollToFormData(form);
}

async function deleteViaApi(path, successMessage) {
  try {
    await apiRequest(path, { method: "DELETE" });
    await loadStateFromApi();
    showToast(successMessage);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Delete failed", "error");
  }
}

function renderPermissionChecks(selectedPermissions = []) {
  const selected = new Set(selectedPermissions);
  const isAdmin = elements.accessUserForm?.elements.isAdmin.checked;
  if (!elements.accessPermissions) return;

  elements.accessPermissions.innerHTML = pageDefinitions
    .map((page) => `
      <label class="permission-item">
        <input type="checkbox" name="permissions" value="${h(page.key)}"
          ${selected.has(page.key) || isAdmin ? "checked" : ""}
          ${isAdmin ? "disabled" : ""} />
        ${h(page.label)}
      </label>
    `).join("");
}

function resetAccessForm() {
  if (!elements.accessUserForm) return;
  elements.accessUserForm.reset();
  elements.accessUserForm.elements.userId.value = "";
  elements.accessUserForm.elements.customerName.value = "";
  elements.accessUserForm.elements.isActive.checked = true;
  renderPermissionChecks([]);
}

function renderAccessUsers() {
  if (!elements.accessUserTable) return;
  elements.accessUserTable.innerHTML = accessUsers.length === 0
    ? emptyState("No users created yet")
    : accessUsers.map((user) => {
      const pages = user.isAdmin
        ? "All pages"
        : (user.permissions || [])
          .map((key) => pageDefinitions.find((page) => page.key === key)?.label || key)
          .join(", ") || "-";
      return `
        <tr>
          <td>${h(user.username)}</td>
          <td>${h(user.fullName || "-")}</td>
          <td><span class="badge ${user.isAdmin ? "ok" : "warn"}">${user.isAdmin ? "Admin" : "User"}</span></td>
          <td>${h(user.customerName || "-")}</td>
          <td>${h(pages)}</td>
          <td><span class="badge ${user.isActive ? "ok" : "danger"}">${user.isActive ? "Active" : "Inactive"}</span></td>
          <td>
            <button class="row-action" data-edit-user="${h(user.id)}" title="Edit user"><i data-lucide="pencil"></i></button>
            <button class="row-action" data-delete-user="${h(user.id)}" title="Deactivate user" ${user.id === currentUser?.id ? "disabled" : ""}><i data-lucide="user-x"></i></button>
          </td>
        </tr>
      `;
    }).join("");
  refreshIcons();
}

async function loadAccessUsers() {
  if (!currentUser?.isAdmin) return;
  try {
    const data = await apiRequest("/users");
    accessUsers = data.users || [];
    pageDefinitions = data.pages || pageDefinitions;
    renderPermissionChecks([...elements.accessUserForm?.querySelectorAll("[name='permissions']:checked")].map((input) => input.value));
    renderAccessUsers();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Users load failed", "error");
  }
}

function editAccessUser(userId) {
  const user = accessUsers.find((item) => item.id === userId);
  if (!user || !elements.accessUserForm) return;
  const form = elements.accessUserForm;
  form.elements.userId.value = user.id;
  form.elements.username.value = user.username || "";
  form.elements.fullName.value = user.fullName || "";
  form.elements.password.value = "";
  form.elements.customerName.value = user.customerName || "";
  form.elements.isAdmin.checked = Boolean(user.isAdmin);
  form.elements.isActive.checked = Boolean(user.isActive);
  renderPermissionChecks(user.permissions || []);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setDefaultDates() {
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    input.value = today;
  });
}

elements.navItems.forEach((item) => {
  item.addEventListener("click", () => {
    activateView(item.dataset.view);
  });
});

elements.masterNavItems.forEach((item) => {
  item.addEventListener("click", () => {
    elements.masterNavItems.forEach((navItem) => navItem.classList.remove("active"));
    elements.masterPages.forEach((page) => page.classList.remove("active"));
    item.classList.add("active");
    document.querySelector(`#${item.dataset.masterView}`).classList.add("active");
  });
});

elements.grnNavItems.forEach((item) => {
  item.addEventListener("click", () => {
    elements.grnNavItems.forEach((navItem) => navItem.classList.remove("active"));
    elements.grnPages.forEach((page) => page.classList.remove("active"));
    item.classList.add("active");
    document.querySelector(`#${item.dataset.grnView}`).classList.add("active");
  });
});

elements.vendorNavItems.forEach((item) => {
  item.addEventListener("click", () => {
    elements.vendorNavItems.forEach((navItem) => navItem.classList.remove("active"));
    elements.vendorPages.forEach((page) => page.classList.remove("active"));
    item.classList.add("active");
    document.querySelector(`#${item.dataset.vendorView}`).classList.add("active");
  });
});

elements.loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector("button[type='submit']");
  const error = document.getElementById("loginError");

  if (error) error.textContent = "";
  if (submitButton) submitButton.disabled = true;

  try {
    await loginUser(form.elements.username.value, form.elements.password.value);
    form.reset();
    showApp();
    applyUserAccess();
    renderPermissionChecks([]);
    await loadStateFromApi();
    if (currentUser?.isAdmin) await loadAccessUsers();
  } catch (err) {
    console.error(err);
    if (error) error.textContent = err.message || "Login failed";
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

elements.logoutButton?.addEventListener("click", async () => {
  try {
    await apiRequest("/logout", { method: "POST" });
  } catch (error) {
    console.error(error);
  }

  clearApiToken();
  currentUser = null;
  pageDefinitions = [];
  accessUsers = [];
  state = normalizeState({});
  showLogin("Logged out successfully.");
});

elements.accessUserForm?.elements.isAdmin.addEventListener("change", () => {
  const selected = [...elements.accessUserForm.querySelectorAll("[name='permissions']:checked")].map((input) => input.value);
  renderPermissionChecks(selected);
});

document.body.addEventListener("click", (event) => {
  const button = event.target.closest("[data-toggle-password]");
  if (!button) return;

  const input = document.getElementById(button.dataset.togglePassword);
  if (!input) return;

  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  button.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
  button.innerHTML = `<i data-lucide="${isPassword ? "eye-off" : "eye"}"></i>`;
  refreshIcons();
});

elements.forgotPasswordLink?.addEventListener("click", () => {
  elements.forgotPasswordForm?.reset();
  showAuthCard("forgot");
});

elements.backToLoginFromForgot?.addEventListener("click", () => {
  showLogin("");
});

elements.backToLoginFromReset?.addEventListener("click", () => {
  window.history.replaceState({}, "", window.location.pathname);
  showLogin("");
});

elements.forgotPasswordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.getElementById("forgotPasswordMessage");

  try {
    const data = formData(form);
    const result = await publicApiRequest("/forgot-password", {
      username: data.username,
    });

    if (message) {
      message.style.color = "var(--ok)";
      message.textContent = result.message || "If this login exists, reset instructions have been sent.";
    }
    form.reset();
  } catch (error) {
    console.error(error);
    if (message) {
      message.style.color = "var(--danger)";
      message.textContent = error.message || "Password reset request failed";
    }
  }
});

elements.resetPasswordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.getElementById("resetPasswordMessage");

  try {
    const data = formData(form);
    const result = await publicApiRequest("/reset-password", {
      token: data.token,
      password: data.password,
      confirmPassword: data.confirmPassword,
    });

    if (message) {
      message.style.color = "var(--ok)";
      message.textContent = result.message || "Password reset successfully.";
    }

    form.reset();
    window.history.replaceState({}, "", window.location.pathname);

    setTimeout(() => {
      showLogin("Password reset successfully. Please login.");
    }, 1200);
  } catch (error) {
    console.error(error);
    if (message) {
      message.style.color = "var(--danger)";
      message.textContent = error.message || "Password reset failed";
    }
  }
});

elements.cancelUserEdit?.addEventListener("click", resetAccessForm);

elements.accessUserForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formData(form);
  const userId = data.userId;
  const permissions = [...form.querySelectorAll("[name='permissions']:checked")].map((input) => input.value);
  const body = {
    username: data.username,
    fullName: data.fullName || "",
    password: data.password || "",
    customerName: data.customerName || "",
    isAdmin: form.elements.isAdmin.checked,
    isActive: form.elements.isActive.checked,
    permissions,
  };

  try {
    await apiRequest(userId ? `/users/${userId}` : "/users", {
      method: userId ? "PATCH" : "POST",
      body: JSON.stringify(body),
    });
    resetAccessForm();
    await loadAccessUsers();
    showToast(userId ? "User updated" : "User created");
  } catch (error) {
    console.error(error);
    showToast(error.message || "User save failed", "error");
  }
});

elements.bosPartSelect.addEventListener("change", () => {
  fillBosVendorOptions();
});

elements.bosVendorName.addEventListener("change", () => {
  const product = selectedBosProduct();
  if (product) fillProductDetails("bos", product);
  else fillProductDetails("bos", null);
});

elements.vendorBosInvoiceSelect.addEventListener("change", fillVendorGrnDetails);
elements.receiptLotSelect.addEventListener("change", updateReceiptCalculations);
elements.salesComponentSelect.addEventListener("change", updateSalesAvailability);
elements.receiptForm.elements.semiFinishedPieces.addEventListener("input", updateReceiptCalculations);
elements.receiptForm.elements.finishedPieces.addEventListener("input", updateReceiptCalculations);

elements.vendorMasterForm.addEventListener("change", (event) => {
  const input = event.target;
  if (input.type !== "file") return;
  const card = input.closest(".upload-card");
  if (!card) return;
  updateUploadCardStatus(card, input.files[0] || null, input.files.length === 0 ? (card.dataset.existingUrl || null) : null);
});

elements.vendorMasterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formData(form);
  const isEdit = !!vendorEditId;
  try {
    const result = await apiRequest(isEdit ? `/vendors/${vendorEditId}` : "/vendors", {
      method: isEdit ? "PATCH" : "POST",
      body: JSON.stringify({
        vendorName: data.vendorName,
        city: data.city || "",
        contact: data.contact || "",
        fullAddress: data.fullAddress || "",
      }),
    });

    const targetId = isEdit ? vendorEditId : result.vendor?.id;
    const hasFiles = ["panCard", "aadharCard", "cancelCheque", "gstDoc", "otherDoc"]
      .some((name) => form.elements[name]?.files?.length > 0);

    if (hasFiles && targetId) {
      const fd = new FormData();
      ["panCard", "aadharCard", "cancelCheque", "gstDoc", "otherDoc"].forEach((name) => {
        const input = form.elements[name];
        if (input?.files?.length > 0) fd.append(name, input.files[0]);
      });
const docRes = await fetch(`${API_BASE}/vendors/${targetId}/documents`, {
  method: "POST",
  credentials: "include",
  headers: authHeaders({}, "POST"),
  body: fd,
});
      const docJson = await docRes.json().catch(() => ({}));
      if (!docRes.ok || docJson.success === false) throw new Error(docJson.message || "Document upload failed");
    }

    vendorEditId = null;
    form.reset();
    resetUploadCards(form);
    form.querySelector("[type='submit']").innerHTML = `<i data-lucide="plus"></i> Add Vendor`;
    setDefaultDates();
    await loadStateFromApi();
    showToast(isEdit ? "Vendor updated successfully" : "Vendor saved in PostgreSQL");
    closeActiveFormModal();
    scrollToFormData(form);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Vendor save failed", "error");
  }
});

elements.customerMasterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formData(form);
  try {
    await saveViaApi("/customers", {
      customerName: data.customerName,
      city: data.city || "",
      contact: data.contact || "",
    }, "Customer saved in PostgreSQL", form);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Customer save failed", "error");
  }
});

elements.productMasterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formData(form);
  try {
    await saveViaApi("/products", {
      bpcsNo: data.bpcsNo,
      vendorName: data.vendorName,
      shape: data.shape,
      grade: data.grade,
      sizeMm: Number(data.sizeMm),
      inputWeightKg: Number(data.inputWeightKg),
      netInputWeightKg: Number(data.netInputWeightKg),
    }, "Product saved in PostgreSQL", form);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Product save failed", "error");
  }
});

elements.issueForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formData(form);
  const rawIssuedKg = mtToKg(data.rawIssuedKg);
  const grn = state.bosGrns.find((item) => item.id === data.bosGrnId);
  if (!grn) {
    showToast("BOS GRN row select karein.", "error");
    return;
  }
  const remainingKg = Math.max(mtToKg(grn.qtyMt) - rawAssignedByBosGrn(grn), 0);
  if (rawIssuedKg > remainingKg + 0.001) {
    showToast(`Job Work issue GRN balance se jyada nahi ho sakta. Balance ${formatMt(remainingKg)} hai.`, "error");
    return;
  }
  if (rawIssuedKg <= 0) {
    showToast("Raw Issue MT enter karein.", "error");
    return;
  }
  const lotNo = nextJobWorkRef();
  try {
    await saveViaApi("/job-work-lots", {
      lotNo,
      bosGrnId: data.bosGrnId,
      vendor: data.vendor,
      componentCode: data.componentCode,
      issueDate: data.issueDate,
      rawIssuedKg,
      outputStage: "finished",
    }, `Job Work lot ${lotNo} created`, form);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Job Work lot save failed", "error");
  }
});

elements.receiptForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formData(form);
  const lot = state.lots.find((item) => item.lotNo === data.lotNo);
  if (!lot) {
    showToast("Pehle GRN > Job Work Assignment me raw material assign karein", "warn");
    return;
  }
  const semiFinishedPieces = Number(data.semiFinishedPieces || 0);
  const finishedPieces = Number(data.finishedPieces || 0);
  const endCutKg = Number(data.endCutKg || 0);
  if (vendorGrnReceivedByLot(lot.lotNo) <= 0) {
    showToast("Vendor GRN confirm hone ke baad hi Components Ready update karein", "warn");
    return;
  }

  const expected = readyExpectedPieces(lot);
  const remainingReady = remainingReadyPieces(lot);
  if (finishedPieces > remainingReady) {
    showToast(`Additional finished qty remaining ${number(remainingReady)} pcs se jyada nahi ho sakti.`, "error");
    return;
  }

  const maxSemiAllowed = Math.max(expected - semiFinishedProducedForLot(lot.lotNo), 0);

  if (semiFinishedPieces > maxSemiAllowed) {
    showToast(`Additional semi finished qty ${number(maxSemiAllowed)} pcs se zyada nahi ho sakti.`, "error");
    return;
  }
  updateReceiptCalculations();
  try {
    await apiRequest(`/job-work-lots/${encodeURIComponent(data.lotNo)}/receipt`, {
      method: "PUT",
      body: JSON.stringify({
        receiptDate: data.receiptDate,
        producedQty: finishedPieces,
        outputStage: "finished",
        endCutKg,
        balanceRawKg: 0,
      }),
    });
    if (semiFinishedPieces > 0) {
      await apiRequest("/vendor-productions", {
        method: "POST",
        body: JSON.stringify({
          lotNo: data.lotNo,
          componentCode: lot.componentCode,
          productionDate: data.receiptDate,
          semiFinishedPieces,
          remarks: "",
        }),
      });
    }
    form.reset();
    setDefaultDates();
    await loadStateFromApi();
    showToast(`Components ready updated for ${lot.lotNo}`);
    closeActiveFormModal();
    scrollToFormData(form);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Receipt update failed", "error");
  }
});

elements.ourEndGrnForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formData(form);
  const product = selectedBosProduct();
  if (!product) return;
  try {
    await saveViaApi("/bos-grns", {
      supplierInvoice: data.supplierInvoice,
      productId: product.id,
      componentCode: product.bpcsNo,
      vendorName: product.vendorName,
      grnDate: data.grnDate,
      qtyMt: Number(data.qtyMt),
    }, `BOS GRN saved: ${data.supplierInvoice}`, form);
  } catch (error) {
    console.error(error);
    showToast(error.message || "BOS GRN save failed", "error");
  }
});

elements.vendorEndGrnForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formData(form);
  const lot = state.lots.find((item) => item.lotNo === data.bosGrnId);
  if (!lot) return;

  const receivedMt = Number(data.receivedMt);
  if (receivedMt <= 0) {
    showToast("Qty Received MT enter karein.", "error");
    return;
  }
  const alreadyReceivedMt = vendorGrnReceivedByLot(lot.lotNo);
  const issuedMt = kgToMt(lot.rawIssuedKg);

  if (alreadyReceivedMt + receivedMt > issuedMt) {
    showToast("Vendor GRN received MT assigned material MT se zyada nahi ho sakta.", "error");
    return;
  }
  try {
    await saveViaApi("/vendor-end-grns", {
      lotNo: lot.lotNo,
      bosGrnId: lot.lotNo,
      grnDate: data.grnDate,
      receivedMt,
    }, "Vendor GRN saved", form);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Vendor GRN save failed", "error");
  }
});

elements.scheduleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formData(form);
  try {
    await saveViaApi("/schedules", {
      customer: currentCustomerName() || data.customer,
      componentCode: data.componentCode,
      dueDate: data.dueDate,
      requiredQty: Number(data.requiredQty),
    }, `Schedule added for ${data.componentCode}`, form);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Schedule save failed", "error");
  }
});

elements.salesForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formData(form);
  const available = finishedAvailableQty(data.componentCode);
  const soldQty = Number(data.soldQty || 0);
  if (soldQty <= 0) {
    showToast("Sold qty enter karein.", "error");
    return;
  }
  if (soldQty > available) {
    showToast(`Sale qty available finished stock ${number(available)} pcs se zyada nahi ho sakti.`, "error");
    return;
  }

  const pendingScheduleQty = pendingScheduleQtyForSale(data.customer, data.componentCode);
  if (pendingScheduleQty <= 0) {
    showToast("Is customer aur component ke liye koi pending schedule nahi hai.", "error");
    return;
  }

  if (soldQty > pendingScheduleQty) {
    showToast(`Sale qty pending customer schedule ${number(pendingScheduleQty)} pcs se zyada nahi ho sakti.`, "error");
    return;
  }
  try {
    await saveViaApi("/sales", {
      customer: data.customer,
      componentCode: data.componentCode,
      saleDate: data.saleDate,
      invoiceNo: data.invoiceNo,
      soldQty,
      ratePerPiece: Number(data.ratePerPiece || 0),
      remarks: data.remarks || "",
    }, `Sale saved for ${data.componentCode}`, form);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Sale save failed", "error");
  }
});

document.body.addEventListener("click", async (event) => {
  const assignGrn = event.target.closest("[data-assign-grn]")?.dataset.assignGrn;
  if (assignGrn) {
    startJobWorkFromGrn(assignGrn);
    return;
  }

  const vendorGrnLot = event.target.closest("[data-vendor-grn-lot]")?.dataset.vendorGrnLot;
  if (vendorGrnLot) {
    startVendorGrnFromLot(vendorGrnLot);
    return;
  }

  const componentsReadyLot = event.target.closest("[data-components-ready-lot]")?.dataset.componentsReadyLot;
  if (componentsReadyLot) {
    startComponentsReadyFromLot(componentsReadyLot);
    return;
  }

  const saleComponent = event.target.closest("[data-sale-component]")?.dataset.saleComponent;
  if (saleComponent) {
    startSaleFromStock(saleComponent);
    return;
  }

  const openForm = event.target.closest("[data-open-form]")?.dataset.openForm;
  if (openForm) {
    openFormModal(openForm);
    return;
  }

  const editUserId = event.target.closest("[data-edit-user]")?.dataset.editUser;
  if (editUserId) {
    editAccessUser(editUserId);
    return;
  }

  const deleteUserId = event.target.closest("[data-delete-user]")?.dataset.deleteUser;
  if (deleteUserId) {
    const user = accessUsers.find((item) => item.id === deleteUserId);
    if (!await showConfirm("Deactivate User", `"${user?.username || deleteUserId}" ka login deactivate karein?`, "Deactivate")) return;
    try {
      await apiRequest(`/users/${deleteUserId}`, { method: "DELETE" });
      await loadAccessUsers();
      showToast("User deactivated");
    } catch (error) {
      console.error(error);
      showToast(error.message || "User deactivate failed", "error");
    }
    return;
  }

  const editVendorId = event.target.closest("[data-edit-vendor]")?.dataset.editVendor;
  if (editVendorId) {
    const vendor = state.vendors.find((v) => v.id === editVendorId);
    if (vendor) editVendor(vendor);
    return;
  }

  const deleteVendor   = event.target.closest("[data-delete-vendor]")?.dataset.deleteVendor;
  const deleteCustomer = event.target.closest("[data-delete-customer]")?.dataset.deleteCustomer;
  const deleteProduct  = event.target.closest("[data-delete-product]")?.dataset.deleteProduct;
  const deleteLot      = event.target.closest("[data-delete-lot]")?.dataset.deleteLot;
  const deleteOurGrn   = event.target.closest("[data-delete-our-grn]")?.dataset.deleteOurGrn;
  const deleteVendorGrn  = event.target.closest("[data-delete-vendor-grn]")?.dataset.deleteVendorGrn;
  const deleteProduction = event.target.closest("[data-delete-production]")?.dataset.deleteProduction;
  const deleteSchedule   = event.target.closest("[data-delete-schedule]")?.dataset.deleteSchedule;
  const deleteSale       = event.target.closest("[data-delete-sale]")?.dataset.deleteSale;

  const navTarget = event.target.closest("[data-nav]")?.dataset.nav;
  if (navTarget) {
    const navEl = event.target.closest("[data-nav]");
    const navBtn = document.querySelector(`.nav-item[data-view="${navTarget}"]`);
    if (navBtn) navBtn.click();
    const grnTarget = navEl?.dataset.grnTarget;
    if (grnTarget) document.querySelector(`[data-grn-view="${grnTarget}"]`)?.click();
    const vendorTarget = navEl?.dataset.vendorTarget;
    if (vendorTarget) document.querySelector(`[data-vendor-view="${vendorTarget}"]`)?.click();
    return;
  }

  if (deleteVendor) {
    const vendor = state.vendors.find((item) => item.id === deleteVendor);
    const isUsed = state.productMasters.some((product) => product.vendorName === vendor?.vendorName);
    if (isUsed) { showToast(`Cannot delete - vendor is used in Product Master`, "warn"); return; }
    if (!await showConfirm("Delete Vendor", `"${vendor?.vendorName}" ko permanently delete karein?`)) return;
    await deleteViaApi(`/vendors/${deleteVendor}`, "Vendor deleted");
    return;
  }
  if (deleteCustomer) {
    const customer = state.customers.find((item) => item.id === deleteCustomer);
    const isUsed = state.schedules.some((schedule) => schedule.customer === customer?.customerName)
      || state.sales.some((sale) => sale.customer === customer?.customerName);
    if (isUsed) { showToast(`Cannot delete - customer has schedules or sales`, "warn"); return; }
    if (!await showConfirm("Delete Customer", `"${customer?.customerName}" ko permanently delete karein?`)) return;
    await deleteViaApi(`/customers/${deleteCustomer}`, "Customer deleted");
    return;
  }
  if (deleteProduct) {
    const product = getProductById(deleteProduct);
    const isUsed = state.sales.some((sale) => sale.componentCode === product?.bpcsNo);
    if (isUsed) { showToast(`Cannot delete - product has sales records`, "warn"); return; }
    if (!await showConfirm("Delete Product", `BPCS "${product?.bpcsNo || deleteProduct}" ko permanently delete karein?`)) return;
    await deleteViaApi(`/products/${deleteProduct}`, "Product deleted");
    return;
  }
  if (deleteLot) {
    if (!await showConfirm("Delete Job Work Lot", `Lot "${deleteLot}" delete karein? Yeh action reverse nahi hoga.`)) return;
    await deleteViaApi(`/job-work-lots/${encodeURIComponent(deleteLot)}`, "Lot deleted");
    return;
  }
  if (deleteOurGrn) {
    if (!await showConfirm("Delete BOS GRN", "Is GRN aur usse linked vendor GRN records bhi delete ho jayenge.")) return;
    await deleteViaApi(`/bos-grns/${deleteOurGrn}`, "BOS GRN deleted");
    return;
  }
  if (deleteVendorGrn) {
    if (!await showConfirm("Delete Vendor GRN", "Is vendor GRN record ko delete karein?")) return;
    await deleteViaApi(`/vendor-end-grns/${deleteVendorGrn}`, "Vendor GRN deleted");
    return;
  }
  if (deleteProduction) {
    if (!await showConfirm("Delete Production Entry", "Is production record ko delete karein?")) return;
    await deleteViaApi(`/vendor-productions/${deleteProduction}`, "Production entry deleted");
    return;
  }
  if (deleteSchedule) {
    if (!await showConfirm("Delete Schedule", "Is customer schedule ko delete karein?")) return;
    await deleteViaApi(`/schedules/${deleteSchedule}`, "Schedule deleted");
    return;
  }
  if (deleteSale) {
    if (!await showConfirm("Delete Sale", "Is customer sale record ko delete karein?")) return;
    await deleteViaApi(`/sales/${deleteSale}`, "Sale deleted");
    return;
  }

});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeActiveFormModal();
});

elements.issueComponentSelect.addEventListener("change", () => {
  const item = getWorkItem(elements.issueComponentSelect.value);
  if (item?.vendorName) {
    elements.issueForm.elements.vendor.value = item.vendorName;
  } else {
    elements.issueForm.elements.vendor.value = "";
  }
  updateIssueRemainingHint();
});

elements.issueForm.elements.rawIssuedKg.addEventListener("input", updateIssueRemainingHint);

initFormLaunchers();
setDefaultDates();

(async function initAuth() {
  const resetToken = new URLSearchParams(window.location.search).get("resetToken");

  if (resetToken) {
    clearApiToken();
    currentUser = null;
    document.body.classList.remove("auth-loading", "auth-ready");
    document.body.classList.add("auth-login");
    showAuthCard("reset");
    if (elements.resetPasswordForm) {
      elements.resetPasswordForm.elements.token.value = resetToken;
    }
    return;
  }

  try {
    await loadCurrentUser();
    showApp();
    applyUserAccess();
    renderPermissionChecks([]);
    await loadStateFromApi();
    if (currentUser?.isAdmin) await loadAccessUsers();
  } catch (error) {
    console.error(error);
    clearApiToken();
    showLogin("");
  }
})();
