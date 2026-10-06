import { supabase } from "./js/supabase.js";

const TEHRAN_SHIPPING = 150000;
const OTHER_CITY_SHIPPING = 250000;
const CUSTOM_ORDER_DRAFT_KEY = "pendingCustomOrder";

const CUSTOM_TYPE_FALLBACK = {
    plaque: { label: "پلاک با طرح دلخواه", price: 380000 },
    album: { label: "آلبوم با طرح دلخواه", price: 550000 }
};

let currentUser = null;
let cart = null;
let cartItems = [];
let products = [];
let promo = null;
let isCustomMode = false;
let customDraft = null;
let customCatalog = null;

const $ = (id) => document.getElementById(id);

function money(value) {
    return `${new Intl.NumberFormat("fa-IR").format(
        Math.round(Number(value) || 0)
    )} تومان`;
}

function esc(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

} function normalizeCity(city) {
    return String(city ?? "")
        .trim()
        .replace(/ي/g, "ی")
        .replace(/ك/g, "ک")
        .replace(/\s+/g, " ");
}

function getShippingCost(city) {
const normalizedCity = city
    .trim()
    .toLowerCase();

if (
    normalizedCity === "تهران" ||
    normalizedCity === "tehran"
) {
    return TEHRAN_SHIPPING;
}

return OTHER_CITY_SHIPPING;}

function errorMessage(message) {
    const text = String(message || "").toLowerCase();


    const map = [
        ["cart is empty", "سبد خرید شما خالی است."],
        ["cart not found", "سبد خرید پیدا نشد."],
        ["insufficient stock", "موجودی یکی از محصولات کافی نیست."],
        ["shipping name", "نام و نام خانوادگی الزامی است."],
        ["shipping phone", "شماره تماس الزامی است."],
        ["postal code is invalid", "کد پستی وارد شده معتبر نیست."],
        ["shipping postal", "کد پستی الزامی است."],
        ["shipping address", "آدرس ارسال الزامی است."],
        ["shipping city", "شهر الزامی است."],
        ["contact name", "نام و نام خانوادگی الزامی است."],
        ["contact phone", "شماره تماس الزامی است."],
        ["unknown custom order type", "نوع سفارش اختصاصی نامعتبر است."],
        ["invalid image path", "فایل طرح معتبر نیست. لطفاً دوباره از صفحه سفارش اختصاصی اقدام کنید."],
        ["custom order draft", "اطلاعات سفارش اختصاصی پیدا نشد. لطفاً دوباره از صفحه سفارش اختصاصی اقدام کنید."],
        ["must be logged in", "لطفاً ابتدا وارد حساب کاربری شوید."],
        ["active payment already exists", "برای این سفارش یک پرداخت فعال وجود دارد."],
        ["order not found", "سفارش پیدا نشد."]
    ];

    const found = map.find(([needle]) =>
        text.includes(needle)
    );

    return found
        ? found[1]
        : (message || "خطایی هنگام انجام عملیات رخ داد.");


}

function clearCustomDraft() {
    sessionStorage.removeItem(CUSTOM_ORDER_DRAFT_KEY);
    customDraft = null;
}

function readCustomDraft() {
    const params = new URLSearchParams(window.location.search);
    const wantsCustom = params.get("custom") === "1";
    const raw = sessionStorage.getItem(CUSTOM_ORDER_DRAFT_KEY);

    if (!wantsCustom) {
        return null;
    }

    if (!raw) {
        throw new Error("Custom order draft not found");
    }

    let draft;
    try {
        draft = JSON.parse(raw);
    } catch (error) {
        sessionStorage.removeItem(CUSTOM_ORDER_DRAFT_KEY);
        throw new Error("Custom order draft not found");
    }

    const type = draft?.custom_type === "album" ? "album" : "plaque";
    if (!draft || !draft.contact_name || !draft.contact_phone) {
        sessionStorage.removeItem(CUSTOM_ORDER_DRAFT_KEY);
        throw new Error("Custom order draft not found");
    }

    return { ...draft, custom_type: type };
}

async function loadCustomCatalog(draft) {
    const fallback = CUSTOM_TYPE_FALLBACK[draft.custom_type] || CUSTOM_TYPE_FALLBACK.plaque;

    try {
        const { data, error } = await supabase
            .from("custom_order_products")
            .select("code,label_fa,price")
            .eq("code", draft.custom_type)
            .eq("is_active", true)
            .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("Catalog row missing");

        customCatalog = {
            code: data.code,
            label: data.label_fa,
            price: Number(data.price) || 0
        };
    } catch (error) {
        console.warn("Custom catalog load failed, using display fallback:", error);
        customCatalog = {
            code: draft.custom_type,
            label: fallback.label,
            price: fallback.price
        };
    }

    if (!customCatalog.price) {
        throw new Error("Custom order draft not found");
    }
}

function customDetailLine(draft) {
    if (draft.custom_type === "album") {
        return [draft.artist_name, draft.album_name].filter(Boolean).join(" — ");
    }
    return draft.design_title || "";
}

function showError(message) {
    const modal = $("orderErrorModal");
    const text = $("orderErrorText");


    if (text) {
        text.textContent = message;
    }

    if (modal) {
        modal.hidden = false;
    }


}

function closeError() {
    const modal = $("orderErrorModal");


    if (modal) {
        modal.hidden = true;
    }


}

function getShipping() {
    const name =
        $("shippingName")?.value.trim() || "";


    const phone =
        $("shippingPhone")?.value.trim() || "";

    const city =
        $("shippingCity")?.value.trim() || "";

    const postalCode =
        $("shippingPostalCode")?.value.trim() || "";

    const address =
        $("shippingAddress")?.value.trim() || "";

    if (!name) {
        showError(
            "لطفاً نام و نام خانوادگی گیرنده را وارد کنید."
        );

        $("shippingName")?.focus();

        return null;
    }

    if (!phone) {
        showError(
            "لطفاً شماره تماس خود را وارد کنید."
        );

        $("shippingPhone")?.focus();

        return null;
    }

    if (!city) {
        showError(
            "لطفاً شهر خود را وارد کنید."
        );

        $("shippingCity")?.focus();

        return null;
    }

    if (!postalCode) {
        showError(
            "لطفاً کد پستی خود را وارد کنید."
        );

        $("shippingPostalCode")?.focus();

        return null;
    }

    if (!/^[1-9][0-9]{9}$/.test(postalCode)) {
        showError(
            "کد پستی وارد شده معتبر نیست."
        );

        $("shippingPostalCode")?.focus();

        return null;
    }

    if (!address) {
        showError(
            "لطفاً آدرس کامل خود را وارد کنید."
        );

        $("shippingAddress")?.focus();

        return null;
    }

    return {
        name,
        phone,
        city,
        postalCode,
        address,
        shippingCost: getShippingCost(city)
    };


}

function getImage(path) {
    if (!path) {
        return "";
    }


    const raw = String(path).trim();

    if (/^https?:\/\//i.test(raw)) {
        return raw;
    }

    const clean = raw
        .replace(/^\/+/, "")
        .replace(/^product-images\//i, "")
        .replace(/^product_image\//i, "");

    return (
        supabase.storage
            .from("product_image")
            .getPublicUrl(clean)
            .data?.publicUrl || ""
    );


}

async function loadCart() {
    const {
        data: c,
        error: ce
    } = await supabase
        .from("carts")
        .select("id,user_id")
        .eq("user_id", currentUser.id)
        .maybeSingle();


    if (ce) {
        throw ce;
    }

    if (!c) {
        throw new Error("Cart not found");
    }

    cart = c;

    const {
        data: items,
        error: ie
    } = await supabase
        .from("cart_items")
        .select(
            "id,cart_id,product_variant_id,quantity"
        )
        .eq("cart_id", c.id)
        .order("created_at");

    if (ie) {
        throw ie;
    }

    cartItems = items || [];

    if (!cartItems.length) {
        throw new Error("Cart is empty");
    }


}

async function loadProducts() {
    const ids =
        cartItems.map(
            (item) => item.product_variant_id
        );


    if (!ids.length) {
        throw new Error("Cart is empty");
    }

    const {
        data,
        error
    } = await supabase
        .from("product_variants")
        .select(`
        id,
        product_id,
        size,
        sku,
        stock,
        price,
        products(
            id,
            name,
            is_active,
            product_images(
                id,
                storage_path,
                alt_text,
                is_primary,
                sort_order
            )
        )
    `)
        .in("id", ids);

    if (error) {
        throw error;
    }

    products = (data || []).map((variant) => {
        const product = Array.isArray(variant.products)
            ? variant.products[0]
            : variant.products;

        const images = [
            ...(product?.product_images || [])
        ].sort(
            (a, b) =>
                Number(b.is_primary) -
                Number(a.is_primary) ||
                Number(a.sort_order || 0) -
                Number(b.sort_order || 0)
        );

        return {
            variantId: variant.id,
            productId: variant.product_id,
            name: product?.name || "Product",
            size: variant.size || "One Size",
            sku: variant.sku || "",
            price: Number(variant.price) || 0,
            stock: Number(variant.stock) || 0,
            isActive: product?.is_active !== false,
            image: getImage(
                images[0]?.storage_path
            )
        };
    });

    if (!products.length) {
        throw new Error("Products not found");
    }


}

function productFor(item) {
    return products.find(
        (product) =>
            Number(product.variantId) ===
            Number(item.product_variant_id)
    );
}

function applyCustomChrome() {
    if (!isCustomMode) return;

    const title = $("checkoutTitle");
    if (title) title.textContent = "CUSTOM CHECKOUT";

    const subtitle = $("checkoutSubtitle");
    if (subtitle) subtitle.textContent = "SHIPPING & PAYMENT";

    const backCart = $("checkoutBackCart");
    if (backCart) {
        backCart.href = "/#custom-order";
        backCart.textContent = "← BACK TO CUSTOM ORDER";
    }

    const errorBack = $("checkoutPageErrorBack");
    if (errorBack) {
        errorBack.href = "/#custom-order";
        errorBack.textContent = "← BACK TO CUSTOM ORDER";
    }

    if (customDraft?.contact_name && !$("shippingName")?.value) {
        $("shippingName").value = customDraft.contact_name;
    }
    if (customDraft?.contact_phone && !$("shippingPhone")?.value) {
        $("shippingPhone").value = customDraft.contact_phone;
    }
}

function subtotal() {
    if (isCustomMode) {
        return Number(customCatalog?.price) || 0;
    }

    return cartItems.reduce(
        (sum, item) => {
            const product = productFor(item);


            return (
                sum +
                (product?.price || 0) *
                (Number(item.quantity) || 0)
            );
        },
        0
    );


}

async function refreshPromo() {
    if (isCustomMode) {
        promo = null;
        return;
    }

    try {
        const raw =
            sessionStorage.getItem(
                "appliedPromo"
            );


        if (!raw) {
            promo = null;
            return;
        }

        const stored = JSON.parse(raw);

        if (!stored?.code) {
            promo = null;
            return;
        }

        const {
            data,
            error
        } = await supabase.rpc(
            "validate_promo_code",
            {
                p_code: stored.code,
                p_order_subtotal: subtotal()
            }
        );

        if (
            error ||
            !data?.valid
        ) {
            sessionStorage.removeItem(
                "appliedPromo"
            );

            promo = null;

            return;
        }

        promo = data;

        sessionStorage.setItem(
            "appliedPromo",
            JSON.stringify(data)
        );
    } catch (error) {
        console.error(
            "Promo refresh failed:",
            error
        );

        promo = null;
    }


}

function getCurrentShippingCost() {
    const city =
        $("shippingCity")?.value.trim() || "";


    return getShippingCost(city);


}

function renderItems() {
    const box =
        $("checkoutItems");


    if (!box) {
        return;
    }

    if (isCustomMode) {
        const label = customCatalog?.label || CUSTOM_TYPE_FALLBACK[customDraft?.custom_type]?.label || "سفارش اختصاصی";
        const detail = customDraft ? customDetailLine(customDraft) : "";
        const hasImage = Boolean(customDraft?.image_path);

        box.innerHTML = `
            <article class="checkout-item">
                <div class="checkout-item-image">
                    <div class="checkout-no-image">N</div>
                </div>
                <div class="checkout-item-info">
                    <h3>${esc(label)}</h3>
                    ${detail ? `<p>${esc(detail)}</p>` : ""}
                    <p>QTY: 1</p>
                    ${hasImage ? "<p>📷 طرح پیوست شده</p>" : ""}
                </div>
                <div class="checkout-item-price">${money(subtotal())}</div>
            </article>
        `;
        return;
    }

    box.innerHTML =
        cartItems
            .map((item) => {
                const product =
                    productFor(item);

                if (!product) {
                    return "";
                }

                const quantity =
                    Number(item.quantity) || 0;

                return `
                <article class="checkout-item">

                    <div class="checkout-item-image">
                        ${product.image
                        ? `
                                    <img
                                        src="${esc(product.image)}"
                                        alt="${esc(product.name)}"
                                    >
                                `
                        : `
                                    <div class="checkout-no-image">
                                        N
                                    </div>
                                `
                    }
                    </div>

                    <div class="checkout-item-info">

                        <h3>
                            ${esc(product.name)}
                        </h3>

                        <p>
                            SIZE:
                            ${esc(product.size)}
                        </p>

                        ${product.sku
                        ? `
                                    <p>
                                        SKU:
                                        ${esc(product.sku)}
                                    </p>
                                `
                        : ""
                    }

                        <p>
                            QTY:
                            ${quantity}
                        </p>

                    </div>

                    <div class="checkout-item-price">
                        ${money(
                        product.price *
                        quantity
                    )}
                    </div>

                </article>
            `;
            })
            .join("");


}

function renderSummary() {
    const sub =
        subtotal();


    const discount =
        Math.min(
            Number(
                promo?.discount_amount
            ) || 0,
            sub
        );

    const shipping =
        getCurrentShippingCost();

    const total =
        Math.max(
            0,
            sub +
            shipping -
            discount
        );

    if ($("checkoutSubtotal")) {
        $("checkoutSubtotal").textContent =
            money(sub);
    }

    if ($("checkoutShipping")) {
        $("checkoutShipping").textContent =
            money(shipping);
    }

    if ($("checkoutTax")) {
        $("checkoutTax").textContent =
            money(0);
    }

    if ($("checkoutDiscount")) {
        $("checkoutDiscount").textContent =
            discount
                ? `-${money(discount)}`
                : money(0);
    }

    if ($("checkoutTotal")) {
        $("checkoutTotal").textContent =
            money(total);
    }

    if ($("checkoutCartCount")) {
        const count = isCustomMode
            ? 1
            : cartItems.reduce(
                (sum, item) =>
                    sum +
                    (Number(item.quantity) || 0),
                0
            );

        $("checkoutCartCount").textContent =
            `(${new Intl.NumberFormat("fa-IR").format(count)})`;
    }


}

async function placeOrder(event) {
    event?.preventDefault();

    if (!currentUser) {
        location.href = isCustomMode
            ? "/login?redirect=customcheckout"
            : "/login?redirect=checkout";

        return;
    }

    const shipping =
        getShipping();

    if (!shipping) {
        return;
    }

    const button =
        $("placeOrderBtn");

    const buttonText =
        button?.querySelector(
            ".checkout-submit-text"
        );

    const originalText =
        buttonText?.textContent ||
        "ثبت سفارش و ادامه پرداخت";

    try {
        if (button) {
            button.disabled = true;
        }

        if (buttonText) {
            buttonText.textContent =
                "در حال ثبت سفارش...";
        }

        // ==============================================
        // Refresh promo before creating order
        // ==============================================

        await refreshPromo();

        // ==============================================
        // CREATE ORDER
        // ==============================================

        let orderId = null;

        if (isCustomMode) {
            if (!customDraft || !customCatalog) {
                throw new Error("Custom order draft not found");
            }

            const { data: createdId, error: customError } = await supabase.rpc(
                "create_custom_order",
                {
                    p_custom_type: customDraft.custom_type,
                    p_contact_name: customDraft.contact_name,
                    p_contact_phone: customDraft.contact_phone,
                    p_shipping_name: shipping.name,
                    p_shipping_phone: shipping.phone,
                    p_shipping_address: `${shipping.city}، ${shipping.address}، ${shipping.postalCode}`,
                    p_shipping_postal_code: shipping.postalCode,
                    p_artist_name: customDraft.artist_name || null,
                    p_album_name: customDraft.album_name || null,
                    p_design_title: customDraft.design_title || null,
                    p_description: customDraft.description || null,
                    p_image_path: customDraft.image_path || null,
                    p_shipping: shipping.shippingCost
                }
            );

            if (customError) {
                throw customError;
            }

            orderId = createdId;
        } else {
            const {
                data: createdId,
                error
            } = await supabase.rpc(
                "create_order_from_cart",
                {
                    p_shipping_name:
                        shipping.name,

                    p_shipping_phone:
                        shipping.phone,

                    p_shipping_address:
                        `${shipping.city}، ${shipping.address}، ${shipping.postalCode}`,

                    p_shipping_postal_code:
                        shipping.postalCode,

                    p_promo_code:
                        promo?.code || null,

                    p_shipping:
                        shipping.shippingCost,

                    p_tax:
                        0
                }
            );

            if (error) {
                throw error;
            }

            orderId = createdId;
        }

        if (!orderId) {
            throw new Error(
                "Order ID was not returned"
            );
        }

        console.log(
            "Created order ID:",
            orderId
        );

        if (isCustomMode) {
            clearCustomDraft();
        }

        // ==============================================
        // GET ORDER NUMBER
        // ==============================================

        const {
            data: createdOrder,
            error: orderFetchError
        } = await supabase
            .from("orders")
            .select(`
                id,
                order_number
            `)
            .eq(
                "id",
                orderId
            )
            .single();

        if (orderFetchError) {
            console.error(
                "Error loading created order:",
                orderFetchError
            );

            throw orderFetchError;
        }

        const orderNumber =
            createdOrder?.order_number || "";

        if (!orderNumber) {
            throw new Error(
                "Order number was not returned"
            );
        }

        console.log(
            "Created order:",
            orderId
        );

        console.log(
            "Order number:",
            orderNumber
        );

        // ==============================================
        // SAVE ORDER INFORMATION
        // ==============================================

        sessionStorage.setItem(
            "lastOrderId",
            String(orderId)
        );

        sessionStorage.setItem(
            "lastOrderNumber",
            orderNumber
        );

        // ==============================================
        // CREATE PAYMENT
        // ==============================================

        if (buttonText) {
            buttonText.textContent =
                "در حال آماده‌سازی پرداخت...";
        }

        const {
            data: paymentId,
            error: paymentError
        } = await supabase.rpc(
            "create_payment",
            {
                p_order_id:
                    Number(orderId),

                p_gateway:
                    "card_to_card"
            }
        );

        if (paymentError) {
            throw paymentError;
        }

        if (!paymentId) {
            throw new Error(
                "Payment ID was not returned"
            );
        }

        // ==============================================
        // SAVE PAYMENT ID
        // ==============================================

        sessionStorage.setItem(
            "lastPaymentId",
            String(paymentId)
        );

        // ==============================================
        // CLEAR PROMO
        // ==============================================

        sessionStorage.removeItem(
            "appliedPromo"
        );

        // ==============================================
        // GO TO PAYMENT PAGE
        // ==============================================

        location.href =
            "/payment";

    } catch (error) {

        console.error(
            "Place order failed:",
            error
        );

        showError(
            errorMessage(
                error?.message
            )
        );

        if (button) {
            button.disabled = false;
        }

        if (buttonText) {
            buttonText.textContent =
                originalText;
        }
    }
    
    
}
function setupCityListener() {
    const cityInput =
        $("shippingCity");

    if (!cityInput) {
        return;
    }

    cityInput.addEventListener(
        "input",
        renderSummary
    );
}


// ======================================================
// INITIALIZE CHECKOUT
// ======================================================

async function init() {
    try {
        isCustomMode = false;
        customDraft = null;
        customCatalog = null;

        try {
            customDraft = readCustomDraft();
            isCustomMode = Boolean(customDraft);
        } catch (error) {
            console.error("Custom checkout draft error:", error);
            throw error;
        }

        const {
            data: {
                session
            },
            error
        } = await supabase.auth.getSession();


        if (error) {
            throw error;
        }


        currentUser =
            session?.user || null;


        if (!currentUser) {
            const loginHref = isCustomMode
                ? "/login?redirect=customcheckout"
                : "/login?redirect=checkout";

            location.href = loginHref;

            return;
        }


        // ==============================================
        // LOAD ORDER SOURCE (cart or custom draft)
        // ==============================================

        if (isCustomMode) {
            customDraft = readCustomDraft();
            if (!customDraft) {
                throw new Error("Custom order draft not found");
            }

            await loadCustomCatalog(customDraft);
            applyCustomChrome();
            renderItems();
            renderSummary();
            setupCityListener();
        } else {
            await loadCart();
            await loadProducts();
            await refreshPromo();
            renderItems();
            renderSummary();
            setupCityListener();
        }


        // ==============================================
        // FORM SUBMIT
        // ==============================================

        $("checkoutForm")
            ?.addEventListener(
                "submit",
                placeOrder
            );


        // ==============================================
        // ERROR MODAL
        // ==============================================

        $("closeErrorModal")
            ?.addEventListener(
                "click",
                closeError
            );


        $("errorModalOk")
            ?.addEventListener(
                "click",
                closeError
            );


        document
            .querySelector(
                "[data-close-error]"
            )
            ?.addEventListener(
                "click",
                closeError
            );


        // ==============================================
        // SHOW CHECKOUT
        // ==============================================

        const content =
            $("checkoutContent");

        if (content) {
            content.hidden = false;
        }


    } catch (error) {

        console.error(
            "Checkout initialization failed:",
            error
        );


        const section =
            $("checkoutPageError");

        const text =
            $("checkoutPageErrorText");


        if (text) {

            text.textContent =
                errorMessage(
                    error?.message
                );

        }


        if (section) {
            section.hidden = false;
        }


        if ($("checkoutContent")) {

            $("checkoutContent").hidden =
                true;

        }

    }
}


// ======================================================
// START
// ======================================================

init();
