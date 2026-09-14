import { supabase } from "./js/supabase.js";


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let orders = [];
let orderItems = [];

let selectedOrder = null;


/* =========================================================
   DOM
========================================================= */

const ordersLoading =
    document.getElementById(
        "ordersLoading"
    );

const ordersError =
    document.getElementById(
        "ordersError"
    );

const ordersErrorText =
    document.getElementById(
        "ordersErrorText"
    );

const ordersRetryBtn =
    document.getElementById(
        "ordersRetryBtn"
    );

const ordersContent =
    document.getElementById(
        "ordersContent"
    );

const ordersList =
    document.getElementById(
        "ordersList"
    );

const ordersEmpty =
    document.getElementById(
        "ordersEmpty"
    );

const ordersCartCount =
    document.getElementById(
        "ordersCartCount"
    );


/* =========================================================
   MODAL
========================================================= */

const orderDetailModal =
    document.getElementById(
        "orderDetailModal"
    );

const closeOrderModal =
    document.getElementById(
        "closeOrderModal"
    );

const modalOrderTitle =
    document.getElementById(
        "modalOrderTitle"
    );

const modalOrderStatus =
    document.getElementById(
        "modalOrderStatus"
    );

const modalOrderItems =
    document.getElementById(
        "modalOrderItems"
    );

const modalSubtotal =
    document.getElementById(
        "modalSubtotal"
    );

const modalShipping =
    document.getElementById(
        "modalShipping"
    );

const modalTax =
    document.getElementById(
        "modalTax"
    );

const modalDiscount =
    document.getElementById(
        "modalDiscount"
    );

const modalTotal =
    document.getElementById(
        "modalTotal"
    );

const modalShippingName =
    document.getElementById(
        "modalShippingName"
    );

const modalShippingPhone =
    document.getElementById(
        "modalShippingPhone"
    );

const modalShippingAddress =
    document.getElementById(
        "modalShippingAddress"
    );

const modalCreatedAt =
    document.getElementById(
        "modalCreatedAt"
    );


/* =========================================================
   HELPERS
========================================================= */

function formatPrice(value) {

    const price =
        Number(value) || 0;

    return `${new Intl.NumberFormat(
        "fa-IR"
    ).format(
        Math.round(price)
    )} تومان`;
}


function formatNumber(value) {

    return new Intl.NumberFormat(
        "fa-IR"
    ).format(
        Number(value) || 0
    );
}


function formatDate(value) {

    if (!value) {
        return "—";
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "—";
    }

    return new Intl.DateTimeFormat(
        "fa-IR",
        {
            year: "numeric",
            month: "long",
            day: "numeric"
        }
    ).format(date);
}


function formatDateTime(value) {

    if (!value) {
        return "—";
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "—";
    }

    return new Intl.DateTimeFormat(
        "fa-IR",
        {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }
    ).format(date);
}


function escapeHtml(value) {

    return String(
        value ?? ""
    )
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/* =========================================================
   STATUS
========================================================= */

function normalizeOrderStatus(status) {

    const value =
        String(
            status || "pending"
        )
            .trim()
            .toLowerCase();

    const allowed = [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled"
    ];

    return allowed.includes(value)
        ? value
        : "pending";
}


function getOrderStatusLabel(status) {

    const labels = {

        pending:
            "PENDING",

        confirmed:
            "CONFIRMED",

        processing:
            "PROCESSING",

        shipped:
            "SHIPPED",

        delivered:
            "DELIVERED",

        cancelled:
            "CANCELLED"

    };

    const normalized =
        normalizeOrderStatus(
            status
        );

    return (
        labels[normalized] ||
        "PENDING"
    );
}


function normalizePaymentStatus(status) {

    const value =
        String(
            status || "unpaid"
        )
            .trim()
            .toLowerCase();

    const allowed = [
        "unpaid",
        "pending",
        "paid",
        "failed",
        "cancelled",
        "refunded"
    ];

    return allowed.includes(value)
        ? value
        : "unpaid";
}


function getPaymentStatusLabel(status) {

    const labels = {

        unpaid:
            "UNPAID",

        pending:
            "PAYMENT PENDING",

        paid:
            "PAID",

        failed:
            "PAYMENT FAILED",

        cancelled:
            "PAYMENT CANCELLED",

        refunded:
            "REFUNDED"

    };

    const normalized =
        normalizePaymentStatus(
            status
        );

    return (
        labels[normalized] ||
        "UNPAID"
    );
}


/* =========================================================
   UI ERROR / LOADING
========================================================= */

function showLoading() {

    if (ordersLoading) {
        ordersLoading.hidden = false;
    }

    if (ordersError) {
        ordersError.hidden = true;
    }

    if (ordersContent) {
        ordersContent.hidden = true;
    }
}


function hideLoading() {

    if (ordersLoading) {
        ordersLoading.hidden = true;
    }
}


function showError(message) {

    if (ordersErrorText) {
        ordersErrorText.textContent =
            message;
    }

    if (ordersError) {
        ordersError.hidden = false;
    }

    if (ordersContent) {
        ordersContent.hidden = true;
    }

    hideLoading();
}


function showContent() {

    if (ordersError) {
        ordersError.hidden = true;
    }

    if (ordersContent) {
        ordersContent.hidden = false;
    }

    hideLoading();
}


/* =========================================================
   AUTH
========================================================= */

async function getCurrentUser() {

    const {
        data: {
            session
        },
        error
    } =
        await supabase.auth.getSession();

    if (error) {

        console.error(
            "Failed to get auth session:",
            error
        );

        return null;
    }

    return (
        session?.user ||
        null
    );
}


/* =========================================================
   LOAD ORDERS
========================================================= */

async function loadOrders() {

    if (!currentUser) {
        return false;
    }


    const {
        data,
        error
    } =
        await supabase
            .from("orders")
            .select(`
                id,
                user_id,
                order_number,
                status,
                payment_status,
                subtotal,
                shipping,
                tax,
                discount,
                total,
                currency,
                shipping_name,
                shipping_phone,
                shipping_address,
                created_at,
                updated_at
            `)
            .eq(
                "user_id",
                currentUser.id
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


    if (error) {

        console.error(
            "Failed to load orders:",
            error
        );

        throw error;
    }


    orders =
        data || [];

    return true;
}


/* =========================================================
   LOAD ORDER ITEMS
========================================================= */

async function loadOrderItems() {

    orderItems = [];


    if (!orders.length) {
        return;
    }


    const orderIds =
        orders.map(
            order =>
                order.id
        );


    const {
        data,
        error
    } =
        await supabase
            .from("order_items")
            .select(`
                id,
                order_id,
                product_variant_id,
                product_name,
                sku,
                quantity,
                unit_price,
                total_price,
                created_at
            `)
            .in(
                "order_id",
                orderIds
            )
            .order(
                "created_at",
                {
                    ascending: true
                }
            );


    if (error) {

        console.error(
            "Failed to load order items:",
            error
        );

        throw error;
    }


    orderItems =
        data || [];
}


/* =========================================================
   CART COUNT
========================================================= */

async function updateCartCount() {

    try {

        const {
            data: cart
        } =
            await supabase
                .from("carts")
                .select("id")
                .eq(
                    "user_id",
                    currentUser?.id
                )
                .maybeSingle();


        if (!cart) {

            if (ordersCartCount) {
                ordersCartCount.textContent =
                    "(0)";
            }

            return;
        }


        const {
            data: items,
            error
        } =
            await supabase
                .from("cart_items")
                .select("quantity")
                .eq(
                    "cart_id",
                    cart.id
                );


        if (error) {
            throw error;
        }


        const count =
            (items || []).reduce(
                (
                    total,
                    item
                ) =>
                    total +
                    (
                        Number(
                            item.quantity
                        ) || 0
                    ),
                0
            );


        if (ordersCartCount) {

            ordersCartCount.textContent =
                `(${formatNumber(count)})`;

        }

    } catch (error) {

        console.error(
            "Failed to update cart count:",
            error
        );

        if (ordersCartCount) {
            ordersCartCount.textContent =
                "(0)";
        }
    }
}


/* =========================================================
   RENDER ORDERS
========================================================= */

function renderOrders() {

    if (!ordersList) {
        return;
    }


    ordersList.innerHTML = "";


    if (!orders.length) {

        if (ordersEmpty) {
            ordersEmpty.hidden = false;
        }

        return;
    }


    if (ordersEmpty) {
        ordersEmpty.hidden = true;
    }


    orders.forEach(
        order => {

            const orderId =
                Number(order.id);


            const orderNumber =
                order.order_number ||
                `#${orderId}`;


            const status =
                normalizeOrderStatus(
                    order.status
                );


            const paymentStatus =
                normalizePaymentStatus(
                    order.payment_status
                );


            const items =
                orderItems.filter(
                    item =>
                        Number(
                            item.order_id
                        ) === orderId
                );


            const itemCount =
                items.reduce(
                    (
                        total,
                        item
                    ) =>
                        total +
                        (
                            Number(
                                item.quantity
                            ) || 0
                        ),
                    0
                );


            const element =
                document.createElement(
                    "article"
                );


            element.className =
                "order-card";


            element.innerHTML = `
                <div class="order-card-main">

                    <div class="order-card-top">

                        <div>

                            <div class="order-card-number">
                                ORDER #${escapeHtml(
                orderNumber
            )}
                            </div>

                            <div class="order-card-date">
                                ${escapeHtml(
                formatDate(
                    order.created_at
                )
            )}
                            </div>

                        </div>


                        <span
                            class="order-status ${escapeHtml(status)}"
                        >
                            ${escapeHtml(
                getOrderStatusLabel(
                    status
                )
            )}
                        </span>

                    </div>


                    <div class="order-card-info">

                        <div class="order-card-info-item">

                            <span>
                                ITEMS
                            </span>

                            <strong>
                                ${escapeHtml(
                formatNumber(
                    itemCount
                )
            )}
                            </strong>

                        </div>


                        <div class="order-card-info-item">

                            <span>
                                TOTAL
                            </span>

                            <strong>
                                ${escapeHtml(
                formatPrice(
                    order.total
                )
            )}
                            </strong>

                        </div>


                        <div class="order-card-info-item">

                            <span>
                                PAYMENT
                            </span>

                            <strong
                                class="payment-status ${escapeHtml(paymentStatus)}"
                            >
                                ${escapeHtml(
                getPaymentStatusLabel(
                    paymentStatus
                )
            )}
                            </strong>

                        </div>

                    </div>

                </div>


                <div class="order-card-action">

                    <button
                        type="button"
                        class="orders-view-button"
                        data-order-id="${escapeHtml(orderId)}"
                    >
                        VIEW ORDER
                    </button>

                </div>
            `;


            ordersList.appendChild(
                element
            );

        }
    );
}


/* =========================================================
   SHOW ORDER DETAIL
========================================================= */

function showOrderDetail(orderId) {

    const order =
        orders.find(
            item =>
                Number(item.id) ===
                Number(orderId)
        );


    if (!order) {
        return;
    }


    selectedOrder =
        order;


    const status =
        normalizeOrderStatus(
            order.status
        );


    const paymentStatus =
        normalizePaymentStatus(
            order.payment_status
        );


    const orderNumber =
        order.order_number ||
        `#${order.id}`;


    /* -----------------------------------------
       Header
    ----------------------------------------- */

    if (modalOrderTitle) {

        modalOrderTitle.textContent =
            `ORDER #${orderNumber}`;

    }


    if (modalOrderStatus) {

        modalOrderStatus.className =
            `order-status ${status}`;

        modalOrderStatus.textContent =
            getOrderStatusLabel(
                status
            );
    }


    /* -----------------------------------------
       Items
    ----------------------------------------- */

    if (modalOrderItems) {

        modalOrderItems.innerHTML = "";

        const items =
            orderItems.filter(
                item =>
                    Number(
                        item.order_id
                    ) ===
                    Number(
                        order.id
                    )
            );


        if (!items.length) {

            modalOrderItems.innerHTML = `
                <div
                    style="
                        padding: 2em;
                        text-align: center;
                        color: rgba(255,255,255,.35);
                        font-family: 'Vazirmatn', sans-serif;
                    "
                >
                    سفارشی برای نمایش وجود ندارد.
                </div>
            `;

        } else {

            items.forEach(
                item => {

                    const element =
                        document.createElement(
                            "div"
                        );


                    element.className =
                        "modal-order-item";


                    element.innerHTML = `

                        <div class="modal-order-item-main">

                            <div class="modal-order-item-name">
                                ${escapeHtml(
                        item.product_name
                    )}
                            </div>


                            <div class="modal-order-item-meta">

                                ${item.sku
                            ? `SKU: ${escapeHtml(item.sku)}`
                            : ""
                        }

                                ${item.sku
                            ? " · "
                            : ""
                        }

                                ${escapeHtml(
                            formatPrice(
                                item.unit_price
                            )
                        )}

                            </div>

                        </div>


                        <div class="modal-order-item-qty">
                            ×${escapeHtml(
                            formatNumber(
                                item.quantity
                            )
                        )}
                        </div>


                        <strong class="modal-order-item-total">
                            ${escapeHtml(
                            formatPrice(
                                item.total_price
                            )
                        )}
                        </strong>

                    `;


                    modalOrderItems.appendChild(
                        element
                    );

                }
            );
        }
    }


    /* -----------------------------------------
       Summary
    ----------------------------------------- */

    if (modalSubtotal) {

        modalSubtotal.textContent =
            formatPrice(
                order.subtotal
            );

    }


    if (modalShipping) {

        modalShipping.textContent =
            formatPrice(
                order.shipping
            );

    }


    if (modalTax) {

        modalTax.textContent =
            formatPrice(
                order.tax
            );

    }


    if (modalDiscount) {

        modalDiscount.textContent =
            Number(
                order.discount
            ) > 0

                ? `-${formatPrice(
                    order.discount
                )}`

                : formatPrice(0);

    }


    if (modalTotal) {

        modalTotal.textContent =
            formatPrice(
                order.total
            );

    }


    /* -----------------------------------------
       Shipping
    ----------------------------------------- */

    if (modalShippingName) {

        modalShippingName.textContent =
            order.shipping_name ||
            "—";

    }


    if (modalShippingPhone) {

        modalShippingPhone.textContent =
            order.shipping_phone ||
            "—";

    }


    if (modalShippingAddress) {

        modalShippingAddress.textContent =
            order.shipping_address ||
            "—";

    }


    /* -----------------------------------------
       Date
    ----------------------------------------- */

    if (modalCreatedAt) {

        modalCreatedAt.textContent =
            formatDateTime(
                order.created_at
            );

    }


    /* -----------------------------------------
       Payment information
    ----------------------------------------- */

    const paymentBox =
        document.getElementById(
            "modalPaymentStatus"
        );


    if (paymentBox) {

        paymentBox.textContent =
            getPaymentStatusLabel(
                paymentStatus
            );

        paymentBox.className =
            `payment-status ${paymentStatus}`;
    }


    /* -----------------------------------------
       Open modal
    ----------------------------------------- */

    if (orderDetailModal) {

        orderDetailModal.hidden =
            false;

        document.body.style.overflow =
            "hidden";

    }
}


/* =========================================================
   CLOSE MODAL
========================================================= */

function hideOrderDetail() {

    if (orderDetailModal) {

        orderDetailModal.hidden =
            true;

    }

    selectedOrder =
        null;

    document.body.style.overflow =
        "";
}


/* =========================================================
   EVENT LISTENERS
========================================================= */

function setupEvents() {

    /* Retry */

    if (ordersRetryBtn) {

        ordersRetryBtn.addEventListener(
            "click",
            loadPage
        );

    }


    /* Order list delegation */

    if (ordersList) {

        ordersList.addEventListener(
            "click",
            event => {

                const button =
                    event.target.closest(
                        ".orders-view-button"
                    );


                if (!button) {
                    return;
                }


                showOrderDetail(
                    button.dataset.orderId
                );

            }
        );
    }


    /* Close */

    if (closeOrderModal) {

        closeOrderModal.addEventListener(
            "click",
            hideOrderDetail
        );

    }


    /* Backdrop */

    document
        .querySelectorAll(
            "[data-close-order-modal]"
        )
        .forEach(
            element => {

                element.addEventListener(
                    "click",
                    hideOrderDetail
                );

            }
        );


    /* Escape */

    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Escape"
            ) {

                hideOrderDetail();

            }

        }
    );
}


/* =========================================================
   LOAD PAGE
========================================================= */

async function loadPage() {

    showLoading();


    try {

        currentUser =
            await getCurrentUser();


        if (!currentUser) {

            window.location.href =
                "/login?redirect=/orders";

            return;
        }


        await loadOrders();

        await loadOrderItems();

        await updateCartCount();


        renderOrders();

        showContent();


    } catch (error) {

        console.error(
            "Orders page error:",
            error
        );


        showError(
            "خطا در دریافت سفارش‌های شما. دوباره تلاش کنید."
        );
    }
}


/* =========================================================
   AUTH STATE CHANGE
========================================================= */

supabase.auth.onAuthStateChange(
    (
        event,
        session
    ) => {

        if (
            event ===
            "INITIAL_SESSION"
        ) {
            return;
        }


        setTimeout(
            async () => {

                currentUser =
                    session?.user ||
                    null;


                if (!currentUser) {

                    window.location.href =
                        "/login?redirect=/orders";

                    return;
                }


                try {

                    await loadOrders();

                    await loadOrderItems();

                    await updateCartCount();

                    renderOrders();

                } catch (error) {

                    console.error(
                        "Auth state orders refresh failed:",
                        error
                    );

                }

            },
            0
        );
    }
);


/* =========================================================
   START
========================================================= */

setupEvents();

loadPage();
