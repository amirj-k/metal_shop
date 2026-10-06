import { supabase } from "./js/supabase.js";
import { formatPrice, formatDate, escapeHtml, getCurrentUser } from "./orders.js";
import { createDesignUrl } from "./js/design-image.js";

const STATUSES = ["pending", "approved", "rejected", "completed"];

const STATUS_LABELS = {
  pending: "در انتظار بررسی",
  approved: "تایید شده",
  rejected: "رد شده",
  completed: "تکمیل شده"
};

const TYPE_LABELS = {
  plaque: "پلاک با طرح دلخواه",
  album: "آلبوم با طرح دلخواه"
};

const card = document.getElementById("customOrdersCard");
const listEl = document.getElementById("customOrdersList");
const emptyEl = document.getElementById("customOrdersEmpty");
const stateEl = document.getElementById("customOrdersLoadState");
const refreshBtn = document.getElementById("customOrdersRefreshBtn");

let loading = false;

function normalizeStatus(status) {
  const value = String(status || "pending").trim().toLowerCase();
  return STATUSES.includes(value) ? value : "pending";
}

function statusLabel(status) {
  return STATUS_LABELS[normalizeStatus(status)] || status || "—";
}

function typeLabel(type) {
  return TYPE_LABELS[type] || type || "—";
}

function setState(message) {
  if (stateEl) stateEl.textContent = message || "";
}

function detailLine(order) {
  const parts = [typeLabel(order.custom_type), formatPrice(order.price)];
  if (order.custom_type === "album" && (order.artist_name || order.album_name)) {
    parts.push([order.artist_name, order.album_name].filter(Boolean).join(" — "));
  } else if (order.design_title) {
    parts.push(order.design_title);
  }
  if (order.image_path) parts.push("📷 طرح پیوست شده");
  if (order.order_id) parts.push(`سفارش #${order.order_id}`);
  return parts.join(" · ");
}

async function loadDesignPreview(holder, order) {
  try {
    const url = await createDesignUrl(order.image_path, 600);
    holder.innerHTML = `
      <a class="order-card-design-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
        <img src="${escapeHtml(url)}" alt="تصویر طرح سفارش اختصاصی ${escapeHtml(order.id)}" loading="lazy">
      </a>
      <span class="order-card-design-caption">برای مشاهده تمام‌سایز بزنید</span>
    `;
    holder.querySelector("img")?.addEventListener(
      "error",
      () => {
        holder.innerHTML = '<span class="order-card-design-error">تصویر قابل نمایش نیست.</span>';
      },
      { once: true }
    );
  } catch {
    holder.innerHTML = '<span class="order-card-design-error">تصویر در دسترس نیست.</span>';
  }
}

function render(orders) {
  if (!listEl) return;
  listEl.innerHTML = "";

  if (emptyEl) emptyEl.hidden = orders.length > 0;
  if (!orders.length) {
    setState("سفارش اختصاصی‌ای برای نمایش وجود ندارد.");
    return;
  }

  orders.forEach((order) => {
    const status = normalizeStatus(order.status);
    const element = document.createElement("article");
    element.className = "order-card";
    element.dir = "rtl";
    element.lang = "fa";
    element.innerHTML = `
      <div class="order-card-main">
        <div class="order-card-top">
          <div>
            <div class="order-card-number" dir="ltr">CUSTOM #${escapeHtml(order.id)}${order.order_id ? ` · ORDER #${escapeHtml(order.order_id)}` : ""}</div>
            <div class="order-card-date">${escapeHtml(formatDate(order.created_at))}</div>
            <div class="order-card-date" dir="rtl">${escapeHtml(detailLine(order))}</div>
          </div>
          <span class="order-status ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>
        </div>
      </div>
    `;
    listEl.appendChild(element);

    if (order.image_path) {
      const holder = document.createElement("div");
      holder.className = "order-card-design";
      holder.innerHTML = '<span class="order-card-design-loading">در حال بارگذاری تصویر طرح…</span>';
      element.querySelector(".order-card-main")?.appendChild(holder);
      loadDesignPreview(holder, order);
    }
  });

  setState(
    `${new Intl.NumberFormat("fa-IR").format(orders.length)} سفارش اختصاصی بارگذاری شد.`
  );
}

async function loadCustomOrders() {
  if (loading) return;
  if (!card) return;

  const user = await getCurrentUser();
  if (!user) {
    card.hidden = true;
    return;
  }

  loading = true;
  if (refreshBtn) refreshBtn.disabled = true;
  setState("در حال بارگذاری سفارش‌های اختصاصی…");

  try {
    const { data, error } = await supabase
      .from("custom_orders")
      .select(
        "id,order_id,custom_type,product_label,price,status,contact_name,contact_phone,artist_name,album_name,design_title,description,image_path,created_at,updated_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    card.hidden = false;
    render(data || []);
  } catch (error) {
    console.error("Failed to load custom orders:", error);
    const missing =
      String(error?.code || "") === "PGRST205" ||
      /custom_orders/i.test(String(error?.message || ""));
    card.hidden = false;
    if (listEl) listEl.innerHTML = "";
    if (emptyEl) emptyEl.hidden = true;
    setState(
      missing
        ? "سفارش‌های اختصاصی هنوز فعال نیستند. لطفاً بعداً دوباره بررسی کنید."
        : "خطا در بارگذاری سفارش‌های اختصاصی. دوباره تلاش کنید."
    );
  } finally {
    loading = false;
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

refreshBtn?.addEventListener("click", () => {
  loadCustomOrders();
});

loadCustomOrders();
