
import { supabase } from "./js/supabase.js";


// ======================================================
// HELPERS
// ======================================================

const $ = (id) =>
    document.getElementById(id);


const money = (value) =>
    `${new Intl.NumberFormat("fa-IR").format(
        Math.round(
            Number(value) || 0
        )
    )} تومان`;


const esc = (value) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");


// ======================================================
// STATE
// ======================================================

let user = null;
let payment = null;
let order = null;


// ======================================================
// STATUS
// ======================================================

function setStatus(
    text,
    type = "info"
) {

    const element =
        $("paymentStatus");

    if (!element) {
        return;
    }

    element.textContent =
        text;

    element.className =
        `payment-status ${type}`;
}


// ======================================================
// SHOW ERROR
// ======================================================

function showError(message) {

    const loading =
        $("paymentLoading");

    const content =
        $("paymentContent");

    const error =
        $("paymentError");

    const errorText =
        $("paymentErrorText");


    if (loading) {
        loading.hidden = true;
    }

    if (content) {
        content.hidden = true;
    }

    if (error) {
        error.hidden = false;
    }

    if (errorText) {
        errorText.textContent =
            message;
    }

}


// ======================================================
// LOAD PAYMENT + ORDER
// ======================================================

async function loadPayment() {

    const paymentId =
        Number(
            sessionStorage.getItem(
                "lastPaymentId"
            )
        );


    const orderId =
        Number(
            sessionStorage.getItem(
                "lastOrderId"
            )
        );


    if (
        !paymentId ||
        !orderId
    ) {

        throw new Error(
            "شناسه سفارش یا پرداخت پیدا نشد. از صفحه سفارش‌ها وارد شوید."
        );

    }


    const [
        {
            data: paymentData,
            error: paymentError
        },
        {
            data: orderData,
            error: orderError
        }
    ] = await Promise.all([

        // ==========================================
        // PAYMENT
        // ==========================================

        supabase
            .from("payments")
            .select(`
                id,
                order_id,
                amount,
                gateway,
                status,
                receipt_path,
                admin_note
            `)
            .eq(
                "id",
                paymentId
            )
            .single(),


        // ==========================================
        // ORDER
        // ==========================================

        supabase
            .from("orders")
            .select(`
                id,
                order_number,
                total,
                payment_status,
                status
            `)
            .eq(
                "id",
                orderId
            )
            .single()

    ]);


    if (paymentError) {
        throw paymentError;
    }


    if (orderError) {
        throw orderError;
    }


    if (!paymentData) {

        throw new Error(
            "اطلاعات پرداخت پیدا نشد."
        );

    }


    if (!orderData) {

        throw new Error(
            "اطلاعات سفارش پیدا نشد."
        );

    }


    // ==============================================
    // VALIDATE PAYMENT ORDER
    // ==============================================

    if (
        Number(
            paymentData.order_id
        ) !==
        Number(orderId)
    ) {

        throw new Error(
            "اطلاعات پرداخت معتبر نیست."
        );

    }


    payment =
        paymentData;

    order =
        orderData;

}


// ======================================================
// LOAD PAYMENT SETTINGS
// ======================================================

async function loadSettings() {

    const {
        data,
        error
    } = await supabase.rpc(
        "get_payment_settings"
    );


    if (error) {
        throw error;
    }


    const settings =
        data || {};


    const rows = [

        [
            "بانک",
            settings.bank_name
        ],

        [
            "شماره کارت",
            settings.card_number
        ],

        [
            "به نام",
            settings.card_holder
        ],

        [
            "شماره شبا",
            settings.iban
        ]

    ].filter(
        ([, value]) =>
            value
    );


    const paymentDetails =
        $("paymentDetails");


    if (!paymentDetails) {
        return;
    }


    paymentDetails.innerHTML =
        rows.length

            ? rows
                .map(
                    ([label, value]) => `
                        <div class="payment-detail-row">
                            <span>${esc(label)}</span>
                            <strong>${esc(value)}</strong>
                        </div>
                    `
                )
                .join("")

            : `
                <div class="payment-empty">
                    اطلاعات کارت توسط مدیریت تنظیم نشده است.
                </div>
            `;
}


// ======================================================
// RENDER PAYMENT PAGE
// ======================================================

function render() {

    // ==============================================
    // ORDER NUMBER
    // ==============================================

    const orderNumber =
        order?.order_number ||
        `#${order?.id || ""}`;


    const paymentOrderId =
        $("paymentOrderId");


    const summaryOrderId =
        $("summaryOrderId");


    if (paymentOrderId) {

        paymentOrderId.textContent =
            orderNumber;

    }


    if (summaryOrderId) {

        summaryOrderId.textContent =
            orderNumber;

    }


    // ==============================================
    // TOTAL
    // ==============================================

    if ($("summaryTotal")) {

        $("summaryTotal").textContent =
            money(order.total);

    }


    if ($("paymentAmount")) {

        $("paymentAmount").textContent =
            money(order.total);

    }


    // ==============================================
    // PAYMENT STATUS
    // ==============================================

    const pending =
        payment.status === "pending" &&
        !payment.receipt_path;


    const submitted =
        Boolean(
            payment.receipt_path
        ) ||
        payment.status !== "pending";


    // ==============================================
    // PAID
    // ==============================================

    if (
        payment.status ===
        "paid"
    ) {

        if ($("summaryStatus")) {

            $("summaryStatus").textContent =
                "پرداخت تأیید شد";

        }


        setStatus(
            "پرداخت شما تأیید شده و سفارش در حال پردازش است.",
            "success"
        );

    }


    // ==============================================
    // FAILED
    // ==============================================

    else if (
        payment.status ===
        "failed"
    ) {

        if ($("summaryStatus")) {

            $("summaryStatus").textContent =
                "پرداخت رد شد";

        }


        setStatus(

            payment.admin_note

                ? `رسید رد شد: ${payment.admin_note}`

                : "رسید پرداخت تأیید نشد.",

            "error"
        );

    }


    // ==============================================
    // RECEIPT SUBMITTED
    // ==============================================

    else if (
        submitted
    ) {

        if ($("summaryStatus")) {

            $("summaryStatus").textContent =
                "در انتظار بررسی";

        }


        setStatus(
            "رسید شما ارسال شده و منتظر تأیید مدیریت است.",
            "success"
        );

    }


    // ==============================================
    // WAITING FOR PAYMENT
    // ==============================================

    else {

        if ($("summaryStatus")) {

            $("summaryStatus").textContent =
                "در انتظار پرداخت";

        }


        setStatus(
            "بعد از واریز، تصویر رسید را بارگذاری کنید.",
            "info"
        );

    }


    // ==============================================
    // RECEIPT INPUT
    // ==============================================

    const receiptInput =
        $("paymentReceiptInput");


    const submitButton =
        $("submitReceiptBtn");


    if (receiptInput) {

        receiptInput.disabled =
            !pending;

    }


    if (submitButton) {

        submitButton.disabled =
            true;

    }


    if (!pending && submitButton) {

        submitButton.textContent =
            payment.status === "paid"

                ? "پرداخت تأیید شد"

                : "رسید ارسال شده";

    }

}


// ======================================================
// RECEIPT PREVIEW
// ======================================================

function previewFile(file) {

    const box =
        $("receiptPreview");


    if (!box) {
        return;
    }


    if (!file) {

        box.hidden = true;
        box.innerHTML = "";

        return;
    }


    const url =
        URL.createObjectURL(file);


    box.hidden = false;


    box.innerHTML = `
        <img
            src="${esc(url)}"
            alt="پیش‌نمایش رسید"
        >

        <span>
            ${esc(file.name)}
        </span>
    `;

}


// ======================================================
// SUBMIT RECEIPT
// ======================================================

async function submitReceipt() {

    const input =
        $("paymentReceiptInput");


    const file =
        input?.files?.[0];


    if (
        !file ||
        !payment ||
        payment.status !== "pending"
    ) {
        return;
    }


    // ==============================================
    // FILE TYPE
    // ==============================================

    if (
        !/^image\/(jpeg|png|webp)$/.test(
            file.type
        )
    ) {

        setStatus(
            "فقط JPG، PNG یا WEBP مجاز است.",
            "error"
        );

        return;
    }


    // ==============================================
    // FILE SIZE
    // ==============================================

    if (
        file.size >
        5 * 1024 * 1024
    ) {

        setStatus(
            "حجم رسید نباید بیشتر از ۵ مگابایت باشد.",
            "error"
        );

        return;
    }


    const button =
        $("submitReceiptBtn");


    if (button) {
        button.disabled = true;
    }


    setStatus(
        "در حال ارسال رسید...",
        "info"
    );


    try {

        // ==========================================
        // STORAGE PATH
        // ==========================================

        const path =
            `${user.id}/${payment.id}/receipt.webp`;


        // ==========================================
        // UPLOAD RECEIPT
        // ==========================================

        const {
            error: uploadError
        } = await supabase
            .storage
            .from("payment_receipts")
            .upload(
                path,
                file,
                {
                    contentType:
                        file.type,

                    upsert:
                        true
                }
            );


        if (uploadError) {
            throw uploadError;
        }


        // ==========================================
        // SAVE RECEIPT PATH
        // ==========================================

        const {
            error: rpcError
        } = await supabase.rpc(
            "submit_payment_receipt",
            {
                p_payment_id:
                    payment.id,

                p_receipt_path:
                    path
            }
        );


        if (rpcError) {
            throw rpcError;
        }


        // ==========================================
        // UPDATE LOCAL STATE
        // ==========================================

        payment.receipt_path =
            path;


        setStatus(
            "رسید با موفقیت ارسال شد. منتظر تأیید مدیریت باشید.",
            "success"
        );


        if ($("summaryStatus")) {

            $("summaryStatus").textContent =
                "در انتظار بررسی";

        }


        if (input) {

            input.disabled =
                true;

        }


        if (button) {

            button.textContent =
                "رسید ارسال شد ✓";

        }


        sessionStorage.setItem(
            "receiptSubmitted",
            "1"
        );


        // ==========================================
        // GO TO ORDERS
        // ==========================================

        window.location.href =
            "/orders";


    } catch (error) {

        console.error(
            "Receipt upload failed:",
            error
        );


        if (button) {
            button.disabled = false;
        }


        setStatus(
            error?.message ||
                "ارسال رسید ناموفق بود.",
            "error"
        );

    }

}


// ======================================================
// INITIALIZE
// ======================================================

async function init() {

    try {

        // ==========================================
        // SESSION
        // ==========================================

        const {
            data: {
                session
            },
            error
        } = await supabase.auth.getSession();


        if (error) {
            throw error;
        }


        user =
            session?.user ||
            null;


        if (!user) {

            location.href =
                "/login?redirect=payment";

            return;
        }


        // ==========================================
        // LOAD PAYMENT
        // ==========================================

        await loadPayment();


        // ==========================================
        // CHECK GATEWAY
        // ==========================================

        if (
            payment.gateway !==
            "card_to_card"
        ) {

            throw new Error(
                "این پرداخت از نوع کارت‌به‌کارت نیست."
            );

        }


        // ==========================================
        // LOAD BANK SETTINGS
        // ==========================================

        await loadSettings();


        // ==========================================
        // RENDER
        // ==========================================

        render();


        // ==========================================
        // FILE INPUT
        // ==========================================

        const receiptInput =
            $("paymentReceiptInput");


        if (receiptInput) {

            receiptInput.addEventListener(
                "change",
                (event) => {

                    const file =
                        event.target.files?.[0];


                    previewFile(file);


                    const submitButton =
                        $("submitReceiptBtn");


                    if (submitButton) {

                        submitButton.disabled =
                            !file ||
                            payment.status !== "pending";

                    }

                }
            );

        }


        // ==========================================
        // RECEIPT BUTTON
        // ==========================================

        const submitButton =
            $("submitReceiptBtn");


        if (submitButton) {

            submitButton.addEventListener(
                "click",
                submitReceipt
            );

        }


        // ==========================================
        // SHOW CONTENT
        // ==========================================

        const loading =
            $("paymentLoading");


        const content =
            $("paymentContent");


        if (loading) {
            loading.hidden = true;
        }


        if (content) {
            content.hidden = false;
        }


    } catch (error) {

        console.error(
            "Payment initialization failed:",
            error
        );


        showError(
            error?.message ||
                "خطایی در بارگذاری صفحه پرداخت رخ داد."
        );

    }

}


// ======================================================
// START
// ======================================================

init();
