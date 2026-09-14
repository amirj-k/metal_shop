import { supabase } from "./js/supabase.js";

const TEHRAN_SHIPPING = 150000;
const OTHER_CITY_SHIPPING = 250000;

let currentUser = null;
let cart = null;
let cartItems = [];
let products = [];
let promo = null;

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
        ["shipping address", "آدرس ارسال الزامی است."],
        ["shipping city", "شهر الزامی است."],
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

function subtotal() {
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
        const count =
            cartItems.reduce(
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
        location.href =
            "/login?redirect=checkout";

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

        const {
            data: orderId,
            error
        } = await supabase.rpc(
            "create_order_from_cart",
            {
                p_shipping_name:
                    shipping.name,

                p_shipping_phone:
                    shipping.phone,

                p_shipping_address:
                    `${shipping.city}، ${shipping.address}`,

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

        if (!orderId) {
            throw new Error(
                "Order ID was not returned"
            );
        }

        console.log(
            "Created order ID:",
            orderId
        );

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

            location.href =
                "/login?redirect=checkout";

            return;
        }


        // ==============================================
        // LOAD CART
        // ==============================================

        await loadCart();


        // ==============================================
        // LOAD PRODUCTS
        // ==============================================

        await loadProducts();


        // ==============================================
        // REFRESH PROMO
        // ==============================================

        await refreshPromo();


        // ==============================================
        // RENDER
        // ==============================================

        renderItems();

        renderSummary();

        setupCityListener();


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
