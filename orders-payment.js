import { supabase } from "./js/supabase.js";

const ordersList = document.getElementById("ordersList");
function isPayableCard(card) { const paymentStatus = card.querySelector(".payment-status"); if (!paymentStatus) return false; return paymentStatus.classList.contains("unpaid") || paymentStatus.classList.contains("pending"); }
function createPayButton(orderId) { const button = document.createElement("button"); button.type = "button"; button.className = "orders-pay-button"; button.dataset.orderId = String(orderId); button.textContent = "PAY NOW"; return button; }
async function hasSubmittedReceipt(orderId) { const { data, error } = await supabase.from("payments").select("id,receipt_path,status,created_at").eq("order_id", Number(orderId)).order("created_at", { ascending: false }).limit(1); if (error) { console.error("Failed to check payment receipt:", error); return false; } const payment = data?.[0]; return Boolean(payment?.receipt_path) || payment?.status === "paid"; }
async function injectPaymentButtons() { if (!ordersList) return; const cards = [...ordersList.querySelectorAll(".order-card")]; for (const card of cards) { if (!isPayableCard(card)) continue; if (card.querySelector(".orders-pay-button")) continue; const action = card.querySelector(".order-card-action"); const viewButton = card.querySelector(".orders-view-button"); const orderId = viewButton?.dataset.orderId; if (!action || !orderId) continue; if (await hasSubmittedReceipt(orderId)) continue; action.appendChild(createPayButton(orderId)); } }
async function startPayment(orderId, button) {
    const numericOrderId = Number(orderId); if (!numericOrderId || !button) return; const originalText = button.textContent; button.disabled = true; button.textContent = "LOADING...";
    try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession(); if (sessionError) throw sessionError; const user = session?.user;
        if (!user) { window.location.href = "/login?redirect=orders"; return; }
        const { data: order, error: orderError } = await supabase.from("orders").select("id,user_id,status,payment_status,total").eq("id", numericOrderId).eq("user_id", user.id).single();
        if (orderError) throw orderError; if (!order) throw new Error("سفارش پیدا نشد."); if (order.payment_status === "paid") throw new Error("این سفارش قبلاً پرداخت شده است."); if (["cancelled"].includes(String(order.status).toLowerCase())) throw new Error("این سفارش لغو شده و امکان پرداخت آن وجود ندارد."); if (await hasSubmittedReceipt(numericOrderId)) throw new Error("رسید این سفارش قبلاً ارسال شده و منتظر تأیید مدیریت است.");
        let payment = null;
        const { data: payments, error: paymentsError } = await supabase.from("payments").select("id,order_id,amount,gateway,status,receipt_path,admin_note,created_at").eq("order_id", numericOrderId).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1);
        if (paymentsError) throw paymentsError; const latestPayment = payments?.[0] || null;
        if (latestPayment && ["pending", "paid"].includes(latestPayment.status)) payment = latestPayment;
        else { const { data: paymentId, error: createPaymentError } = await supabase.rpc("create_payment", { p_order_id: numericOrderId, p_gateway: "card_to_card" }); if (createPaymentError) throw createPaymentError; if (!paymentId) throw new Error("شناسه پرداخت ایجاد نشد."); payment = { id: Number(paymentId), order_id: numericOrderId }; }
        sessionStorage.setItem("lastOrderId", String(numericOrderId)); sessionStorage.setItem("lastPaymentId", String(payment.id)); window.location.href = "/payment";
    } catch (error) { console.error("Resume payment failed:", error); button.disabled = false; button.textContent = originalText; window.alert(error?.message || "خطایی هنگام ادامه پرداخت رخ داد."); }
}
ordersList?.addEventListener("click", (event) => { const button = event.target.closest(".orders-pay-button"); if (!button) return; event.preventDefault(); event.stopPropagation(); startPayment(button.dataset.orderId, button); });
if (ordersList) { const observer = new MutationObserver(() => injectPaymentButtons()); observer.observe(ordersList, { childList: true, subtree: true }); injectPaymentButtons(); }
