const REFRESH_INTERVAL_MS = 5000;
const TIMELINE_STEPS = [
  { label: "Order created", detail: "Saved in the order database" },
  { label: "Order event published", detail: "order-created-events" },
  { label: "Payment processed", detail: "Payment saved by the payment service" },
  { label: "Order status updated", detail: "payment-completed-events" },
];

const elements = {
  amount: document.querySelector("#amount"),
  attentionOrders: document.querySelector("#attention-orders"),
  closeDialogButton: document.querySelector("#close-dialog-button"),
  connectionLabel: document.querySelector("#connection-label"),
  customerName: document.querySelector("#customer-name"),
  eventTimeline: document.querySelector("#event-timeline"),
  form: document.querySelector("#order-form"),
  formError: document.querySelector("#form-error"),
  headerHealthDot: document.querySelector("#header-health-dot"),
  navOrderCount: document.querySelector("#nav-order-count"),
  openOrderButton: document.querySelector("#open-order-button"),
  orderDialog: document.querySelector("#order-dialog"),
  ordersBody: document.querySelector("#orders-body"),
  ordersSummary: document.querySelector("#orders-summary"),
  pageError: document.querySelector("#page-error"),
  orderSearch: document.querySelector("#order-search"),
  paymentNote: document.querySelector("#payment-note"),
  paymentVolume: document.querySelector("#payment-volume"),
  productName: document.querySelector("#product-name"),
  quantity: document.querySelector("#quantity"),
  refreshButton: document.querySelector("#refresh-button"),
  sidebarHealthDot: document.querySelector("#sidebar-health-dot"),
  submitOrderButton: document.querySelector("#submit-order-button"),
  successCaption: document.querySelector("#success-caption"),
  successfulOrders: document.querySelector("#successful-orders"),
  totalOrders: document.querySelector("#total-orders"),
  toast: document.querySelector("#toast"),
  trackingContent: document.querySelector("#tracking-content"),
  trackingOrderId: document.querySelector("#tracking-order-id"),
  trackingPlaceholder: document.querySelector("#tracking-placeholder"),
  trackingProduct: document.querySelector("#tracking-product"),
};

let orders = [];
let payments = [];
let selectedOrderId = null;
let isRefreshing = false;
let toastTimeout;

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function requestJson(path, options = {}) {
  let response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new ApiError("Cannot reach the services. Check that Docker Compose is running.");
  }

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError(`The service returned an unreadable response (HTTP ${response.status}).`, response.status);
    }
  }

  if (!response.ok) {
    const details = Array.isArray(body?.details) ? body.details.join(". ") : "";
    const message = [body?.message, details].filter(Boolean).join(": ");
    throw new ApiError(message || `Request failed with HTTP ${response.status}.`, response.status);
  }
  return body;
}

function money(value) {
  const amount = Number(value);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount);
}

function dateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function statusClass(status) {
  switch (status) {
    case "PAID": return "status-paid";
    case "FAILED": return "status-failed";
    case "PENDING": return "status-pending";
    case "PAYMENT_PROCESSING": return "status-processing";
    default: return "status-unknown";
  }
}

function displayStatus(status) {
  return ({
    PAID: "Paid",
    FAILED: "Failed",
    PENDING: "Pending",
    PAYMENT_PROCESSING: "Processing",
  })[status] || String(status || "Unknown").replaceAll("_", " ");
}

function showToast(message, isError = false) {
  clearTimeout(toastTimeout);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("toast-error", isError);
  elements.toast.classList.add("visible");
  toastTimeout = setTimeout(() => elements.toast.classList.remove("visible"), 4000);
}

function setServicesOnline(online) {
  for (const dot of [elements.headerHealthDot, elements.sidebarHealthDot]) {
    dot.classList.toggle("is-online", online);
    dot.classList.toggle("is-offline", !online);
  }
  elements.connectionLabel.textContent = online ? "Services connected" : "Services unavailable";
}

function renderMetrics() {
  const successful = orders.filter((order) => order.status === "PAID").length;
  const attention = orders.filter((order) => order.status === "FAILED" || order.status === "PENDING" || order.status === "PAYMENT_PROCESSING").length;
  const volume = orders.reduce((total, order) => total + Number(order.amount || 0), 0);
  elements.totalOrders.textContent = String(orders.length);
  elements.navOrderCount.textContent = String(orders.length);
  elements.paymentVolume.textContent = money(volume);
  elements.successfulOrders.textContent = String(successful);
  elements.successCaption.textContent = orders.length
    ? `${Math.round(successful / orders.length * 100)}% of all orders`
    : "Orders with a successful payment";
  elements.attentionOrders.textContent = String(attention);
}

function renderOrders() {
  const query = elements.orderSearch.value.trim().toLocaleLowerCase();
  const filteredOrders = orders.filter((order) => [
    order.id,
    order.customerName,
    order.productName,
    order.status,
  ].some((value) => String(value ?? "").toLocaleLowerCase().includes(query)));

  if (filteredOrders.length === 0) {
    const message = orders.length === 0
      ? "No orders yet. Create an order to get started."
      : "No orders match your search.";
    elements.ordersBody.innerHTML = `<tr><td colspan="6" class="table-message">${message}</td></tr>`;
  } else {
    elements.ordersBody.innerHTML = filteredOrders.slice(0, 8).map((order) => `
      <tr>
        <td><button class="order-id-button${String(order.id) === String(selectedOrderId) ? " is-selected" : ""}" type="button" data-order-id="${escapeHtml(order.id)}">#${escapeHtml(order.id)}</button></td>
        <td><div class="customer-cell" title="${escapeHtml(order.customerName)}">${escapeHtml(order.customerName)}</div><div class="product-subtitle" title="${escapeHtml(order.productName)}">${escapeHtml(order.productName)} · ${escapeHtml(order.quantity)} ${Number(order.quantity) === 1 ? "item" : "items"}</div></td>
        <td class="amount-cell">${escapeHtml(money(order.amount))}</td>
        <td><span class="status-badge ${statusClass(order.status)}">${escapeHtml(displayStatus(order.status))}</span></td>
        <td class="date-cell">${escapeHtml(dateTime(order.createdAt))}</td>
        <td><button class="order-id-button" type="button" data-order-id="${escapeHtml(order.id)}" aria-label="Track order ${escapeHtml(order.id)}">View</button></td>
      </tr>`).join("");
  }
  elements.ordersSummary.textContent = orders.length === 0
    ? "No orders"
    : query
      ? `${filteredOrders.length} of ${orders.length} orders`
      : `${orders.length} ${orders.length === 1 ? "order" : "orders"}`;
}

function renderTracking(order) {
  elements.trackingPlaceholder.hidden = Boolean(order);
  elements.trackingContent.hidden = !order;
  if (!order) return;

  elements.trackingOrderId.textContent = `#${order.id}`;
  elements.trackingProduct.textContent = `${order.productName} · ${money(order.amount)}`;

  const status = order.status;
  const settled = status === "PAID" || status === "FAILED";
  const payment = payments.find((entry) => String(entry.orderId) === String(order.id));
  const stage = settled ? 4 : payment ? 3 : status === "PAYMENT_PROCESSING" ? 2 : 1;
  elements.eventTimeline.innerHTML = TIMELINE_STEPS.map((step, index) => {
    const failed = settled && status === "FAILED" && index === 2;
    const complete = !failed && ((settled && status === "PAID") || index < stage);
    const current = !settled && index === stage;
    const classes = ["timeline-step", complete ? "complete" : "", current ? "current" : "", failed ? "failed" : "", !complete && !current ? "pending-step" : ""].filter(Boolean).join(" ");
    const detail = index === 0
      ? dateTime(order.createdAt)
      : index === 2 && payment
        ? `${dateTime(payment.processedAt)} · ${payment.status}`
        : index === 3 && settled
          ? `${dateTime(order.updatedAt)} · consumed by order service`
          : step.detail;
    const label = index === 2 && payment
      ? `Payment ${payment.status === "SUCCESS" ? "succeeded" : "failed"}`
      : step.label;
    return `<div class="${classes}"><span class="timeline-marker">${complete ? "✓" : failed ? "×" : ""}</span><div><strong>${label}</strong><small>${detail}</small></div></div>`;
  }).join("");

  elements.paymentNote.className = `payment-note${status === "FAILED" ? " note-failed" : ""}`;
  elements.paymentNote.textContent = status === "PAID"
    ? `${payment?.message || "Payment succeeded."} The order service has received the result event.`
    : status === "FAILED"
      ? `${payment?.message || "Payment failed."} The order service has received the failure event.`
      : status === "PAYMENT_PROCESSING"
        ? payment
          ? "Payment has been recorded. The order service is consuming the result event."
          : "The payment service is processing this order. Status updates automatically."
        : "Waiting for the payment service to consume the order event.";
}

function renderDashboard() {
  renderMetrics();
  renderOrders();
  const selected = orders.find((order) => String(order.id) === String(selectedOrderId));
  if (selected) {
    renderTracking(selected);
  } else if (selectedOrderId !== null) {
    selectedOrderId = null;
    renderTracking(null);
  }
}

async function refreshDashboard() {
  if (isRefreshing) return;
  isRefreshing = true;
  elements.refreshButton.disabled = true;
  elements.pageError.hidden = true;
  const [orderResult, paymentResult] = await Promise.allSettled([
    requestJson("/api/orders"),
    requestJson("/api/payments"),
  ]);
  const issues = [];

  if (orderResult.status === "fulfilled" && Array.isArray(orderResult.value)) {
    orders = orderResult.value;
    if (selectedOrderId === null && orders.length > 0) {
      selectedOrderId = orders[0].id;
    }
    renderDashboard();
  } else {
    const message = orderResult.status === "rejected"
      ? orderResult.reason.message
      : "The order service returned an unexpected response.";
    issues.push(`Order service unavailable: ${message}`);
    if (orders.length === 0) {
      elements.ordersBody.innerHTML = `<tr><td colspan="6" class="table-message">${escapeHtml(message)}</td></tr>`;
      elements.ordersSummary.textContent = "Order service unavailable";
    }
  }

  if (paymentResult.status === "rejected") {
    issues.push(`Payment service unavailable: ${paymentResult.reason.message}`);
  } else if (!Array.isArray(paymentResult.value)) {
    issues.push("Payment service returned an unexpected response.");
  } else {
    payments = paymentResult.value;
    renderDashboard();
  }

  setServicesOnline(issues.length === 0);
  if (issues.length > 0) {
    elements.pageError.textContent = issues.join(" ");
    elements.pageError.hidden = false;
  }
  isRefreshing = false;
  elements.refreshButton.disabled = false;
}

function openDialog() {
  elements.formError.hidden = true;
  elements.orderDialog.showModal();
  elements.customerName.focus();
}

async function submitOrder(event) {
  event.preventDefault();
  elements.formError.hidden = true;
  elements.submitOrderButton.disabled = true;
  elements.submitOrderButton.textContent = "Sending order…";

  const payload = {
    customerName: elements.customerName.value.trim(),
    productName: elements.productName.value.trim(),
    quantity: Number(elements.quantity.value),
    amount: Number(elements.amount.value),
  };

  try {
    const order = await requestJson("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!order || order.id === undefined) throw new ApiError("The order service accepted the request but returned no order ID.");
    selectedOrderId = order.id;
    elements.orderDialog.close();
    elements.form.reset();
    elements.quantity.value = "1";
    showToast(`Order #${order.id} created. Following its payment journey.`);
    await refreshDashboard();
    const latestOrder = orders.find((entry) => String(entry.id) === String(order.id));
    renderTracking(latestOrder || order);
    document.querySelector("#orders").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    elements.formError.textContent = error.message;
    elements.formError.hidden = false;
  } finally {
    elements.submitOrderButton.disabled = false;
    elements.submitOrderButton.innerHTML = 'Send order <span aria-hidden="true">→</span>';
  }
}

elements.openOrderButton.addEventListener("click", openDialog);
elements.closeDialogButton.addEventListener("click", () => elements.orderDialog.close());
elements.orderDialog.addEventListener("click", (event) => {
  if (event.target === elements.orderDialog) elements.orderDialog.close();
});
elements.form.addEventListener("submit", submitOrder);
elements.refreshButton.addEventListener("click", refreshDashboard);
elements.orderSearch.addEventListener("input", renderOrders);
elements.ordersBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-order-id]");
  if (!button) return;
  selectedOrderId = button.dataset.orderId;
  const selected = orders.find((order) => String(order.id) === String(selectedOrderId));
  renderTracking(selected);
  renderOrders();
});

refreshDashboard();
setInterval(refreshDashboard, REFRESH_INTERVAL_MS);
