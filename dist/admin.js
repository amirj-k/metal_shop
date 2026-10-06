import { supabase } from "./js/supabase.js";

let currentUser = null;
let orders = [];
let orderItems = [];
let payments = [];
let selectedOrderId = null;
let authorized = false;
let dataFresh = false;
let refreshing = false;
let mutating = false;
let loggingOut = false;
let refreshVersion = 0;
let paymentVersion = 0;
let selectionVersion = 0;
let sessionVersion = 0;
let orderFocus = null;
let successFocus = null;
let savedOverflow = null;

const $ = (id) => document.getElementById(id);
const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const number = (v) => new Intl.NumberFormat("fa-IR").format(v);
function money(v) { return `${number(Math.round(Number(v) || 0))} تومان`; }
function datetime(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}
function date(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric" }).format(d);
}
function esc(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function statusLabel(s) { return ({ pending: "PENDING", confirmed: "CONFIRMED", processing: "PROCESSING", shipped: "SHIPPED", delivered: "DELIVERED", cancelled: "CANCELLED" }[s] || String(s || "").toUpperCase()); }
function paymentLabel(s) { return ({ unpaid: "UNPAID", pending: "در انتظار بررسی", paid: "تأیید شده", failed: "رد شده", cancelled: "لغو شده", refunded: "مرجوع شده" }[s] || s || "—"); }
function adminError(message) {
    if (typeof window.showError === "function") window.showError(message || "خطایی رخ داد.", "Admin Error");
    else window.alert(message || "خطایی رخ داد.");
}
function syncModalState() {
    const orderOpen = !$("adminOrderModal").hidden;
    const successOpen = !$("adminSuccessModal").hidden;
    document.querySelector(".admin-page").inert = orderOpen || successOpen;
    document.querySelector(".shop-header").inert = orderOpen || successOpen;
    $("adminOrderModal").inert = successOpen;
    if (orderOpen || successOpen) {
        if (savedOverflow === null) savedOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
    } else if (savedOverflow !== null) {
        document.body.style.overflow = savedOverflow;
        savedOverflow = null;
    }
}
function restoreFocus(target, fallback) {
    if (target?.isConnected && !target.disabled && !target.closest("[hidden], [inert]")) target.focus();
    else $(fallback)?.focus();
}
function success(message) {
    successFocus = document.activeElement;
    $("adminSuccessMessage").textContent = message;
    $("adminSuccessModal").hidden = false;
    syncModalState();
    $("adminSuccessOk").focus();
}
function closeSuccess() {
    if ($("adminSuccessModal").hidden) return;
    $("adminSuccessModal").hidden = true;
    syncModalState();
    restoreFocus(successFocus, $("adminOrderModal").hidden ? "refreshOrdersBtn" : "closeAdminModal");
}
async function getUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data?.user || null;
}
async function isAdmin() {
    if (!currentUser) return false;
    const { data, error } = await supabase.from("profiles").select("role").eq("id", currentUser.id).maybeSingle();
    if (error) throw error;
    return data?.role === "admin";
}
async function loadOrders() {
    const { data, error } = await supabase.from("orders").select("id,user_id,status,payment_status,subtotal,shipping,tax,discount,total,currency,shipping_name,shipping_phone,shipping_address,postal_code,created_at,updated_at").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
}
async function loadItems(loadedOrders) {
    if (!loadedOrders.length) return [];
    const { data, error } = await supabase.from("order_items").select("id,order_id,product_variant_id,product_name,sku,quantity,unit_price,total_price,created_at").in("order_id", loadedOrders.map(o => o.id)).order("id", { ascending: true });
    if (error) throw error;
    return data || [];
}
async function loadPayments(loadedOrders) {
    if (!loadedOrders.length) return [];
    const { data, error } = await supabase.from("payments").select("id,order_id,user_id,amount,gateway,authority,transaction_id,status,receipt_path,admin_note,created_at,paid_at").in("order_id", loadedOrders.map(o => o.id)).order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
}
function paymentFor(id) { return payments.find(p => sameId(p.order_id, id)); }
function paymentStatus(order) { return String(paymentFor(order.id)?.status || order.payment_status || "unpaid").toLowerCase(); }
function normalizeSearch(value) {
    return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632)).trim();
}
function filteredOrders() {
    const status = $("statusFilter").value;
    const payment = $("paymentFilter").value;
    const query = normalizeSearch($("adminOrderSearch").value);
    const phoneQuery = query.replace(/[\s()+.-]/g, "");
    return orders.filter(o => {
        if (status !== "all" && String(o.status || "pending").toLowerCase() !== status) return false;
        if (payment !== "all" && paymentStatus(o) !== payment) return false;
        return !query || normalizeSearch(`#${o.id}`).includes(query) || normalizeSearch(o.shipping_name).includes(query) || normalizeSearch(o.postal_code || "").includes(query) ||
            (!!phoneQuery && normalizeSearch(o.shipping_phone).replace(/[\s()+.-]/g, "").includes(phoneQuery));
    });
}
function renderStats() {
    const n = s => orders.filter(o => String(o.status || "pending").toLowerCase() === s).length;
    $("totalOrders").textContent = number(orders.length);
    $("pendingOrders").textContent = number(n("pending"));
    $("processingOrders").textContent = number(n("processing"));
    $("deliveredOrders").textContent = number(n("delivered"));
}
function renderOrders() {
    const list = filteredOrders(), box = $("adminOrdersList");
    box.innerHTML = "";
    $("visibleOrderCount").textContent = number(list.length);
    $("adminOrdersEmpty").hidden = !!list.length;
    list.forEach(o => {
        const p = paymentFor(o.id), s = String(o.status || "pending").toLowerCase(), el = document.createElement("article");
        el.className = "admin-order-item";
        el.innerHTML = `<div class="admin-order-main"><strong class="admin-order-id">ORDER #${esc(o.id)}</strong><span class="admin-customer">${esc(o.shipping_name || "Unknown customer")}</span><span class="admin-order-date">${date(o.created_at)}</span></div><div class="admin-order-right"><strong class="admin-order-total">${money(o.total)}</strong><span class="admin-status ${esc(s)}">${esc(statusLabel(s))}</span>${p?.gateway === "card_to_card" && p.status === "pending" ? `<span class="admin-payment-pending">رسید در انتظار بررسی</span>` : `<span class="admin-payment-state">${esc(paymentLabel(paymentStatus(o)))}</span>`}<button type="button" class="admin-view-button" data-order-id="${esc(o.id)}" aria-label="View order ${esc(o.id)}">VIEW</button></div>`;
        box.appendChild(el);
    });
}
function syncControls() {
    const disabled = !authorized || !dataFresh || refreshing || mutating || loggingOut;
    ["updateStatusBtn", "adminStatusSelect", "approvePaymentBtn", "rejectPaymentBtn"].forEach(id => {
        if ($(id)) $(id).disabled = disabled;
    });
    $("refreshOrdersBtn").disabled = !authorized || refreshing || mutating || loggingOut;
    $("adminOrdersList").setAttribute("aria-busy", String(refreshing));
}
async function receiptUrl(path) {
    const { data, error } = await supabase.storage.from("payment_receipts").createSignedUrl(path, 600);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error("Receipt URL unavailable");
    return data.signedUrl;
}
async function renderPaymentSection(order) {
    const version = ++paymentVersion;
    $("adminPaymentSection")?.remove();
    const section = document.createElement("section");
    section.id = "adminPaymentSection";
    section.className = "admin-detail-section";
    const payment = paymentFor(order.id);
    const active = () => version === paymentVersion && sameId(selectedOrderId, order.id) && !$("adminOrderModal").hidden && section.isConnected;
    section.innerHTML = `<div class="admin-detail-title">PAYMENT REVIEW</div><div class="admin-payment-panel"></div>`;
    $("adminModalItems").closest("section").after(section);
    const panel = section.querySelector(".admin-payment-panel");
    if (!payment) {
        panel.innerHTML = `<div class="admin-payment-empty"><strong>NO LOADED PAYMENT</strong><span>No payment record was returned for this order.</span></div>`;
        return;
    }
    panel.innerHTML = `<div class="admin-payment-grid"><div><span>METHOD</span><strong>${esc(payment.gateway || "unknown")}</strong></div><div><span>AMOUNT</span><strong>${money(payment.amount)}</strong></div><div><span>STATUS</span><strong>${esc(paymentLabel(payment.status))}</strong></div><div><span>CREATED</span><strong>${datetime(payment.created_at)}</strong></div></div><div id="adminReceiptArea" class="admin-receipt-area"></div>`;
    const area = section.querySelector("#adminReceiptArea");
    if (payment.gateway !== "card_to_card") {
        area.innerHTML = `<div class="admin-payment-note">درگاه: ${esc(payment.gateway || "unknown")}</div>`;
        return;
    }
    if (payment.receipt_path) {
        area.textContent = "Loading receipt…";
        try {
            const url = await receiptUrl(payment.receipt_path);
            if (!active()) return;
            area.innerHTML = `<div class="admin-receipt-heading"><span>PAYMENT RECEIPT</span><a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="admin-receipt-link">OPEN FULL SIZE ↗</a></div><div class="admin-receipt-frame"><img src="${esc(url)}" alt="Payment receipt" class="admin-receipt-image"></div>`;
            area.querySelector("img").addEventListener("error", () => {
                if (active()) adminError("Receipt image could not be displayed. Try opening it full size or refresh.");
            }, { once: true });
        } catch {
            if (!active()) return;
            area.innerHTML = `<div class="admin-payment-note">امکان دریافت رسید وجود ندارد.</div>`;
            adminError("Receipt could not be loaded. Refresh to try again.");
        }
    } else {
        area.innerHTML = `<div class="admin-payment-note">کاربر هنوز رسیدی ارسال نکرده است.</div>`;
    }
    if (!active()) return;
    if (payment.admin_note) {
        const note = document.createElement("div");
        note.className = "admin-receipt-note";
        note.textContent = `ADMIN NOTE: ${payment.admin_note}`;
        area.appendChild(note);
    }
    if (payment.status === "pending") {
        const actions = document.createElement("div");
        actions.className = "admin-payment-actions";
        actions.innerHTML = `<button type="button" id="approvePaymentBtn" class="admin-payment-approve">تأیید پرداخت</button><button type="button" id="rejectPaymentBtn" class="admin-payment-reject">رد پرداخت</button>`;
        area.appendChild(actions);
        actions.querySelector("#approvePaymentBtn").addEventListener("click", () => { if (active()) approvePayment(payment.id); });
        actions.querySelector("#rejectPaymentBtn").addEventListener("click", () => { if (active()) rejectPayment(payment.id); });
        syncControls();
    }
}
async function showOrder(id, focus = true) {
    if (!authorized) return;
    const order = orders.find(o => sameId(o.id, id));
    if (!order) return;
    if (focus) {
        selectionVersion++;
        if ($("adminOrderModal").hidden) orderFocus = document.activeElement;
    }
    selectedOrderId = order.id;
    $("adminModalOrderTitle").textContent = `ORDER #${order.id}`;
    const s = String(order.status || "pending").toLowerCase();
    $("adminModalStatus").textContent = statusLabel(s);
    $("adminModalStatus").className = `admin-status ${s}`;
    $("adminStatusSelect").value = s;
    $("adminCustomerName").textContent = order.shipping_name || "—";
    $("adminCustomerPhone").textContent = order.shipping_phone || "—";
    $("adminCustomerPostalCode").textContent = order.postal_code || "—";
    $("adminCustomerAddress").textContent = order.shipping_address || "—";
    const items = orderItems.filter(i => sameId(i.order_id, order.id));
    $("adminModalItems").innerHTML = items.length ? items.map(i => `<div class="admin-modal-item"><div><div class="admin-modal-item-name">${esc(i.product_name)}</div><div class="admin-modal-item-meta">${i.sku ? `SKU: ${esc(i.sku)} · ` : ""}${money(i.unit_price)}</div></div><span class="admin-modal-item-quantity">×${number(i.quantity)}</span><strong class="admin-modal-item-total">${money(i.total_price)}</strong></div>`).join("") : "<p>NO LOADED ITEMS</p>";
    $("adminModalSubtotal").textContent = money(order.subtotal);
    $("adminModalShipping").textContent = money(order.shipping);
    $("adminModalTax").textContent = money(order.tax);
    $("adminModalDiscount").textContent = order.discount > 0 ? `-${money(order.discount)}` : money(0);
    $("adminModalTotal").textContent = money(order.total);
    $("adminModalCreatedAt").textContent = datetime(order.created_at);
    $("adminOrderModal").hidden = false;
    syncModalState();
    syncControls();
    if (focus) $("closeAdminModal").focus();
    await renderPaymentSection(order);
}
function hideOrder() {
    if ($("adminOrderModal").hidden) return;
    $("adminOrderModal").hidden = true;
    selectedOrderId = null;
    paymentVersion++;
    selectionVersion++;
    syncModalState();
    restoreFocus(orderFocus, "refreshOrdersBtn");
}
function canMutate() { return authorized && dataFresh && !mutating && !refreshing && !loggingOut && selectedOrderId != null; }
function reviewablePayment(id) {
    const payment = paymentFor(selectedOrderId);
    return canMutate() && payment && sameId(payment.id, id) && payment.gateway === "card_to_card" && payment.status === "pending";
}
async function approvePayment(id) {
    if (!reviewablePayment(id)) return;
    await mutate("admin_confirm_card_payment", { p_payment_id: id }, "Payment approved");
}
async function rejectPayment(id) {
    if (!reviewablePayment(id)) return;
    const note = window.prompt("دلیل رد پرداخت را وارد کنید (اختیاری):", "");
    if (note === null) return;
    await mutate("admin_reject_card_payment", { p_payment_id: id, p_admin_note: note || null }, "Payment rejected");
}
async function updateStatus() {
    if (!canMutate()) return;
    const status = $("adminStatusSelect").value;
    if (!["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"].includes(status)) {
        adminError("Choose a valid order status.");
        return;
    }
    const order = orders.find(o => sameId(o.id, selectedOrderId));
    if (order?.status === status) return;
    await mutate("admin_update_order_status", { p_order_id: selectedOrderId, p_status: status }, "Order status updated");
}
async function mutate(rpc, params, message) {
    if (!canMutate()) return;
    const selection = selectionVersion, session = sessionVersion, id = selectedOrderId;
    mutating = true;
    dataFresh = false;
    refreshVersion++;
    syncControls();
    try {
        const { data, error } = await supabase.rpc(rpc, params);
        if (session !== sessionVersion) return;
        if (error) throw error;
        if (data !== true) throw new Error("The update was not confirmed.");
        const refreshed = await refresh(true);
        if (session !== sessionVersion) return;
        if (!refreshed) {
            adminError(`${message} for order #${id}, but reloading failed. Refresh before making another change.`);
            return;
        }
        if (selection === selectionVersion && sameId(id, selectedOrderId)) success(`${message} for order #${id}.`);
        else if (typeof window.showSuccess === "function") window.showSuccess(`${message} for order #${id}.`, "Admin");
    } catch (e) {
        if (session === sessionVersion) {
            $("adminLoadState").textContent = "Update not confirmed. Refresh loaded data before trying again.";
            adminError(`${e?.message || "Update failed."} Refresh before trying again.`);
        }
    } finally {
        mutating = false;
        syncControls();
    }
}
async function refresh(afterMutation = false) {
    if (!authorized || loggingOut || (mutating && !afterMutation)) return false;
    const version = ++refreshVersion;
    refreshing = true;
    dataFresh = false;
    paymentVersion++;
    syncControls();
    $("adminLoadState").textContent = "Loading orders, items and payments…";
    try {
        const loadedOrders = await loadOrders();
        if (version !== refreshVersion || !authorized) return false;
        const [loadedItems, loadedPayments] = await Promise.all([loadItems(loadedOrders), loadPayments(loadedOrders)]);
        if (version !== refreshVersion || !authorized) return false;
        orders = loadedOrders;
        orderItems = loadedItems;
        payments = loadedPayments;
        dataFresh = true;
        renderStats();
        renderOrders();
        $("adminLoadState").textContent = `${number(orders.length)} orders loaded. Counts and filters cover loaded data only.`;
        if (selectedOrderId != null) {
            if (orders.some(o => sameId(o.id, selectedOrderId))) showOrder(selectedOrderId, false).catch(e => adminError(e?.message));
            else hideOrder();
        }
        return true;
    } catch (e) {
        if (version === refreshVersion && authorized) {
            $("adminLoadState").textContent = "Reload failed. Displayed data may be outdated. Use Refresh to retry; changes are disabled.";
            if (!afterMutation) adminError(e?.message || "Orders could not be loaded.");
        }
        return false;
    } finally {
        if (version === refreshVersion) {
            refreshing = false;
            syncControls();
        }
    }
}
async function logout() {
    if (loggingOut) return;
    loggingOut = true;
    $("adminLogoutBtn").disabled = true;
    syncControls();
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        sessionVersion++;
        refreshVersion++;
        paymentVersion++;
        authorized = false;
        currentUser = null;
        orders = [];
        orderItems = [];
        payments = [];
        $("adminContent").hidden = true;
        closeSuccess();
        hideOrder();
        location.href = "/shop";
    } catch (e) {
        adminError(e?.message || "خروج از حساب انجام نشد.");
    } finally {
        loggingOut = false;
        $("adminLogoutBtn").disabled = false;
        syncControls();
    }
}
function setup() {
    $("statusFilter").addEventListener("change", renderOrders);
    $("paymentFilter").addEventListener("change", renderOrders);
    $("adminOrderSearch").addEventListener("input", renderOrders);
    $("refreshOrdersBtn").addEventListener("click", () => refresh());
    $("adminOrdersList").addEventListener("click", e => {
        const b = e.target.closest(".admin-view-button");
        if (b) showOrder(b.dataset.orderId).catch(error => adminError(error?.message));
    });
    $("closeAdminModal").addEventListener("click", hideOrder);
    document.querySelector("[data-close-admin-modal]").addEventListener("click", hideOrder);
    $("updateStatusBtn").addEventListener("click", updateStatus);
    $("adminSuccessOk").addEventListener("click", closeSuccess);
    $("closeAdminSuccessModal").addEventListener("click", closeSuccess);
    document.querySelector("[data-close-success]").addEventListener("click", closeSuccess);
    $("adminLogoutBtn").addEventListener("click", logout);
    document.addEventListener("keydown", e => {
        const modal = !$("adminSuccessModal").hidden ? $("adminSuccessModal") : !$("adminOrderModal").hidden ? $("adminOrderModal") : null;
        if (!modal) return;
        if (e.key === "Escape") {
            e.preventDefault();
            if (modal.id === "adminSuccessModal") closeSuccess();
            else hideOrder();
        }
        if (e.key !== "Tab") return;
        const controls = Array.from(modal.querySelectorAll('button:not(:disabled), a[href], select:not(:disabled), input:not(:disabled), [tabindex="0"]')).filter(el => !el.closest("[hidden], [inert]"));
        const first = controls[0], last = controls[controls.length - 1];
        if (!first) { e.preventDefault(); modal.focus(); }
        else if (!modal.contains(document.activeElement) || (e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last)) {
            e.preventDefault();
            (e.shiftKey ? last : first).focus();
        }
    });
}
async function init() {
    const session = sessionVersion;
    $("adminContent").hidden = true;
    syncControls();
    try {
        currentUser = await getUser();
        if (session !== sessionVersion) return;
        if (!currentUser) { location.href = "/login?redirect=/admin"; return; }
        const admin = await isAdmin();
        if (session !== sessionVersion) return;
        if (!admin) {
            $("adminError").hidden = false;
            $("adminErrorText").textContent = "این صفحه فقط برای Admin قابل دسترسی است.";
            $("adminLoadState").textContent = "Admin access required.";
            return;
        }
        authorized = true;
        $("adminContent").hidden = false;
        await refresh();
    } catch (e) {
        if (session !== sessionVersion) return;
        $("adminContent").hidden = true;
        $("adminError").hidden = false;
        $("adminErrorText").textContent = "خطا در بررسی دسترسی پنل مدیریت.";
        $("adminLoadState").textContent = "Access check failed. Reload the page to retry.";
        adminError(e?.message || "Admin access check failed.");
    }
}
setup();
init();

export { esc, money, datetime, date };
