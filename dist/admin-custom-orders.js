import { supabase } from "./js/supabase.js";
import { esc, money, datetime, date } from "./admin.js";
import { createDesignUrl, saveImageToDevice } from "./js/design-image.js";

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

const $ = (id) => document.getElementById(id);

let currentUser = null;
let authorized = false;
let customOrders = [];
let selectedId = null;
let loading = false;
let mutating = false;
let loadVersion = 0;
let modalFocus = null;
let savedOverflow = null;

function notifyError(message) {
    if (typeof window.showError === "function") window.showError(message || "خطایی رخ داد.", "Custom Orders");
    else window.alert(message || "خطایی رخ داد.");
}

function notifySuccess(message) {
    if (typeof window.showSuccess === "function") window.showSuccess(message, "Custom Orders");
}

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

function normalizeSearch(value) {
    return String(value ?? "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
        .trim();
}

async function getUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data?.user || null;
}

async function isAdmin(user) {
    if (!user) return false;
    const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (error) throw error;
    return data?.role === "admin";
}

function syncControls() {
    const disabled = !authorized || loading || mutating;
    const refresh = $("refreshCustomOrdersBtn");
    if (refresh) refresh.disabled = disabled;
    const update = $("updateCustomStatusBtn");
    const select = $("customStatusSelect");
    const note = $("customModalNote");
    if (update) update.disabled = disabled || selectedId == null;
    if (select) select.disabled = disabled || selectedId == null;
    if (note) note.disabled = disabled || selectedId == null;
    const list = $("customOrdersList");
    if (list) list.setAttribute("aria-busy", String(loading));
}

function setLoadState(message) {
    const el = $("customOrdersLoadState");
    if (el) el.textContent = message || "";
}

function filteredOrders() {
    const statusFilter = $("customStatusFilter")?.value || "all";
    const typeFilter = $("customTypeFilter")?.value || "all";
    const query = normalizeSearch($("customOrdersSearch")?.value);
    const phoneQuery = query.replace(/[\s()+.-]/g, "");

    return customOrders.filter((order) => {
        if (statusFilter !== "all" && normalizeStatus(order.status) !== statusFilter) return false;
        if (typeFilter !== "all" && String(order.custom_type || "") !== typeFilter) return false;
        if (!query) return true;
        if (normalizeSearch(`#${order.id}`).includes(query)) return true;
        if (normalizeSearch(order.contact_name || "").includes(query)) return true;
        if (phoneQuery && normalizeSearch(order.contact_phone || "").replace(/[\s()+.-]/g, "").includes(phoneQuery)) return true;
        return false;
    });
}

function renderList() {
    const list = $("customOrdersList");
    const empty = $("customOrdersEmpty");
    if (!list) return;

    const rows = filteredOrders();
    const count = $("visibleCustomCount");
    if (count) count.textContent = new Intl.NumberFormat("fa-IR").format(rows.length);

    list.innerHTML = "";
    if (empty) empty.hidden = rows.length > 0;

    rows.forEach((order) => {
        const status = normalizeStatus(order.status);
        const element = document.createElement("article");
        element.className = "admin-order-item";
        element.innerHTML = `
            <div class="admin-order-main">
                <strong class="admin-order-id">CUSTOM #${esc(order.id)}${order.order_id ? ` · ORDER #${esc(order.order_id)}` : ""}</strong>
                <span class="admin-customer">${esc(order.contact_name || "بدون نام")}${order.contact_phone ? ` · ${esc(order.contact_phone)}` : ""}</span>
                <span class="admin-custom-item-meta">
                    <span class="admin-custom-type">${esc(typeLabel(order.custom_type))}</span>
                    <span class="admin-custom-price">${esc(money(order.price))}</span>
                    ${order.image_path ? '<span class="admin-custom-has-image">📷 تصویر دارد</span>' : ""}
                </span>
                <span class="admin-order-date">${date(order.created_at)}</span>
            </div>
            <div class="admin-order-right">
                <span class="admin-status ${esc(status)}">${esc(statusLabel(status))}</span>
                <button type="button" class="admin-view-button" data-custom-id="${esc(order.id)}" aria-label="View custom order ${esc(order.id)}">VIEW</button>
            </div>
        `;
        list.appendChild(element);
    });
}

function syncModalState() {
    const modal = $("customOrderModal");
    if (!modal) return;
    const open = !modal.hidden;
    const page = document.querySelector(".admin-page");
    const header = document.querySelector(".shop-header");
    if (page) page.inert = open;
    if (header) header.inert = open;
    if (open) {
        if (savedOverflow === null) savedOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
    } else if (savedOverflow !== null) {
        document.body.style.overflow = savedOverflow;
        savedOverflow = null;
    }
}

function hideModal() {
    const modal = $("customOrderModal");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    selectedId = null;
    syncModalState();
    if (modalFocus?.isConnected) modalFocus.focus();
    else $("refreshCustomOrdersBtn")?.focus();
}

async function loadDesignImage(order) {
    const area = $("customModalImageArea");
    if (!area) return;

    if (!order.image_path) {
        area.innerHTML = '<span class="admin-custom-no-image">تصویری ارسال نشده است.</span>';
        return;
    }

    area.innerHTML = '<span class="admin-custom-image-loading">در حال بارگذاری تصویر…</span>';

    try {
        const url = await createDesignUrl(order.image_path, 3600);
        area.innerHTML = `
            <div class="admin-custom-image-frame">
                <img src="${esc(url)}" alt="تصویر طرح سفارش ${esc(order.id)}">
                <div class="admin-custom-image-actions">
                    <a class="admin-custom-image-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">OPEN FULL SIZE ↗</a>
                    <button type="button" class="admin-custom-image-save" data-save-design>ذخیره تصویر ⬇</button>
                </div>
            </div>
        `;
        area.querySelector("img")?.addEventListener(
            "error",
            () => {
                area.innerHTML = '<span class="admin-custom-no-image">تصویر قابل نمایش نیست.</span>';
            },
            { once: true }
        );
        area.querySelector("[data-save-design]")?.addEventListener("click", async (event) => {
            const button = event.currentTarget;
            if (button.disabled) return;
            button.disabled = true;
            const original = button.textContent;
            button.textContent = "در حال ذخیره…";
            try {
                const freshUrl = await createDesignUrl(order.image_path, 3600);
                await saveImageToDevice(freshUrl, `custom-order-${order.id}`);
            } catch (error) {
                console.error("Save design image failed:", error);
                notifyError("ذخیره تصویر انجام نشد. لینک OPEN FULL SIZE را باز کنید.");
            } finally {
                button.disabled = false;
                button.textContent = original;
            }
        });
    } catch {
        area.innerHTML = '<span class="admin-custom-no-image">امکان دریافت تصویر وجود ندارد.</span>';
    }
}

async function showModal(id, focus = true) {
    const order = customOrders.find((item) => String(item.id) === String(id));
    if (!order) return;

    if (focus) {
        modalFocus = document.activeElement;
    }
    selectedId = order.id;

    const status = normalizeStatus(order.status);
    const title = $("customModalTitle");
    if (title) title.textContent = `سفارش #${order.id}`;
    const statusEl = $("customModalStatus");
    if (statusEl) {
        statusEl.className = `admin-status ${status}`;
        statusEl.textContent = statusLabel(status);
    }

    const set = (id2, value) => {
        const el = $(id2);
        if (el) el.textContent = value;
    };

    set("customModalName", order.contact_name || "—");
    set("customModalPhone", order.contact_phone || "—");
    set("customModalType", typeLabel(order.custom_type));
    set("customModalPrice", money(order.price));
    set("customModalCreatedAt", datetime(order.created_at));
    set("customModalOrder", order.order_id ? `#${order.order_id}` : "—");

    const albumBox = $("customModalAlbumBox");
    const hasAlbum = Boolean(order.artist_name || order.album_name);
    if (albumBox) albumBox.hidden = !hasAlbum;
    set("customModalAlbum", [order.artist_name, order.album_name].filter(Boolean).join(" — ") || "—");

    const designBox = $("customModalDesignBox");
    const hasDesign = Boolean(order.design_title);
    if (designBox) designBox.hidden = !hasDesign;
    set("customModalDesign", order.design_title || "—");

    set("customModalDescription", order.description || "—");

    const select = $("customStatusSelect");
    if (select) select.value = status;
    const note = $("customModalNote");
    if (note) note.value = order.admin_note || "";

    const modal = $("customOrderModal");
    if (modal) modal.hidden = false;
    syncModalState();
    syncControls();
    $("closeCustomModal")?.focus();

    await loadDesignImage(order);
}

async function refresh() {
    if (!authorized || loading) return false;
    const version = ++loadVersion;
    loading = true;
    syncControls();
    setLoadState("در حال بارگذاری سفارش‌های اختصاصی…");

    try {
        const { data, error } = await supabase
            .from("custom_orders")
            .select(
                "id,user_id,order_id,custom_type,product_label,price,status,contact_name,contact_phone,artist_name,album_name,design_title,description,image_path,admin_note,created_at,updated_at"
            )
            .order("created_at", { ascending: false });

        if (error) throw error;
        if (version !== loadVersion || !authorized) return false;

        customOrders = data || [];
        renderList();
        setLoadState(
            `${new Intl.NumberFormat("fa-IR").format(customOrders.length)} سفارش اختصاصی بارگذاری شد. فیلترها روی همین داده‌ها اعمال می‌شوند.`
        );

        if (selectedId != null) {
            if (customOrders.some((item) => String(item.id) === String(selectedId))) {
                await showModal(selectedId, false);
            } else {
                hideModal();
            }
        }

        return true;
    } catch (error) {
        if (version === loadVersion && authorized) {
            console.error("Failed to load custom orders:", error);
            const missing =
                String(error?.code || "") === "PGRST205" ||
                /custom_orders/i.test(String(error?.message || ""));
            setLoadState(
                missing
                    ? "جدول custom_orders پیدا نشد. ابتدا فایل custom-orders.sql را در Supabase SQL Editor اجرا کنید."
                    : "خطا در بارگذاری سفارش‌های اختصاصی. دوباره تلاش کنید."
            );
            if (missing) {
                renderList();
            }
        }
        return false;
    } finally {
        if (version === loadVersion) {
            loading = false;
            syncControls();
        }
    }
}

async function updateStatus() {
    if (!authorized || mutating || selectedId == null) return;

    const status = $("customStatusSelect")?.value;
    if (!STATUSES.includes(status)) {
        notifyError("وضعیت نامعتبر است.");
        return;
    }

    const order = customOrders.find((item) => String(item.id) === String(selectedId));
    if (!order) return;

    const note = $("customModalNote")?.value.trim() || null;
    const statusChanged = normalizeStatus(order.status) !== status;
    const noteChanged = (order.admin_note || null) !== note;

    if (!statusChanged && !noteChanged) {
        notifySuccess("تغییری برای ذخیره وجود ندارد.");
        return;
    }

    mutating = true;
    syncControls();

    try {
        const payload = { status };
        if (noteChanged) payload.admin_note = note;

        const { error } = await supabase.from("custom_orders").update(payload).eq("id", order.id);
        if (error) throw error;

        const ok = await refresh();
        if (!ok) {
            notifyError("وضعیت ذخیره شد اما بارگذاری مجدد ناموفق بود. دوباره Refresh بزنید.");
            return;
        }
        notifySuccess(`سفارش اختصاصی #${order.id} بروزرسانی شد.`);
    } catch (error) {
        console.error("Custom order update failed:", error);
        notifyError(error?.message || "بروزرسانی سفارش اختصاصی انجام نشد.");
    } finally {
        mutating = false;
        syncControls();
    }
}

function setup() {
    $("refreshCustomOrdersBtn")?.addEventListener("click", () => refresh());
    $("customStatusFilter")?.addEventListener("change", renderList);
    $("customTypeFilter")?.addEventListener("change", renderList);
    $("customOrdersSearch")?.addEventListener("input", renderList);

    $("customOrdersList")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-custom-id]");
        if (button) showModal(button.dataset.customId).catch((error) => notifyError(error?.message));
    });

    $("closeCustomModal")?.addEventListener("click", hideModal);
    document.querySelector("[data-close-custom-modal]")?.addEventListener("click", hideModal);
    $("updateCustomStatusBtn")?.addEventListener("click", updateStatus);

    document.addEventListener("keydown", (event) => {
        const modal = $("customOrderModal");
        if (!modal || modal.hidden) return;
        if (event.key === "Escape") {
            event.preventDefault();
            hideModal();
            return;
        }
        if (event.key !== "Tab") return;
        const controls = Array.from(
            modal.querySelectorAll('button:not(:disabled), a[href], select:not(:disabled), textarea:not(:disabled), input:not(:disabled)')
        ).filter((el) => !el.closest("[hidden], [inert]"));
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) {
            event.preventDefault();
            modal.focus();
            return;
        }
        if (!modal.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
        }
    });

    supabase.auth.onAuthStateChange(() => {
        guardedInit();
    });
}

async function init() {
    const card = $("customOrdersCard");
    if (!card) return;

    try {
        currentUser = await getUser();
        if (!currentUser) {
            authorized = false;
            card.hidden = true;
            return;
        }
        const admin = await isAdmin(currentUser);
        authorized = admin;
        card.hidden = !admin;
        if (admin) {
            await refresh();
        }
    } catch (error) {
        console.error("Custom orders access check failed:", error);
        authorized = false;
        card.hidden = true;
    }
}

let initToken = 0;

async function guardedInit() {
    const token = ++initToken;
    await init();
    if (token !== initToken) return;
}

setup();
guardedInit();
