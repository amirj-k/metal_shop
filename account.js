import { supabase } from "./js/supabase.js";
import "./header-auth.js";

let currentUser = null;
const $ = (id) => document.getElementById(id);
const accountLoading = $("accountLoading");
const accountError = $("accountError");
const accountErrorText = $("accountErrorText");
const accountContent = $("accountContent");
const accountEmail = $("accountEmail");
const profileForm = $("profileForm");
const fullName = $("fullName");
const phone = $("phone");
const address = $("address");
const saveProfileBtn = $("saveProfileBtn");
const logoutBtn = $("logoutBtn");
const accountCartCount = $("accountCartCount");
const successModal = $("successModal");
const profileErrorModal = $("profileErrorModal");
const profileErrorText = $("profileErrorText");

function showLoading() {
  if (accountLoading) accountLoading.hidden = false;
  if (accountContent) accountContent.hidden = true;
  if (accountError) accountError.hidden = true;
}
function showContent() {
  if (accountLoading) accountLoading.hidden = true;
  if (accountError) accountError.hidden = true;
  if (accountContent) accountContent.hidden = false;
}
function showPageError(message) {
  if (accountLoading) accountLoading.hidden = true;
  if (accountContent) accountContent.hidden = true;
  if (accountError) accountError.hidden = false;
  if (accountErrorText) accountErrorText.textContent = message;
}
function showProfileError(message) {
  if (profileErrorText) profileErrorText.textContent = message;
  if (profileErrorModal) profileErrorModal.hidden = false;
}
function hideProfileError() {
  if (profileErrorModal) profileErrorModal.hidden = true;
}

async function loadProfile() {
  if (!currentUser) return;
  if (accountEmail) accountEmail.value = currentUser.email || "";
  const { data, error } = await supabase.from("profiles").select("full_name,phone,address").eq("id", currentUser.id).maybeSingle();
  if (error) throw error;
  if (fullName) fullName.value = data?.full_name || "";
  if (phone) phone.value = data?.phone || "";
  if (address) address.value = data?.address || "";
}

async function saveProfile(event) {
  event?.preventDefault();
  if (!currentUser || !saveProfileBtn) return;
  saveProfileBtn.disabled = true;
  const saveText = saveProfileBtn.querySelector(".save-text");
  if (saveText) saveText.textContent = "SAVING...";
  try {
    const { error } = await supabase.from("profiles").upsert({
      id: currentUser.id,
      full_name: fullName?.value.trim() || null,
      phone: phone?.value.trim() || null,
      address: address?.value.trim() || null,
      updated_at: new Date().toISOString()
    }, { onConflict: "id" });
    if (error) throw error;
    if (successModal) successModal.hidden = false;
  } catch (error) {
    console.error("Failed to save profile:", error);
    showProfileError(error?.message || "ذخیره اطلاعات انجام نشد.");
  } finally {
    saveProfileBtn.disabled = false;
    if (saveText) saveText.textContent = "SAVE CHANGES";
  }
}

async function updateCartCount() {
  if (!currentUser || !accountCartCount) return;
  const { data: cart, error } = await supabase.from("carts").select("id").eq("user_id", currentUser.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error || !cart) {
    accountCartCount.textContent = "(0)";
    return;
  }
  const { data: items, error: itemsError } = await supabase.from("cart_items").select("quantity").eq("cart_id", cart.id);
  if (itemsError) {
    accountCartCount.textContent = "(0)";
    return;
  }
  const count = (items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  accountCartCount.textContent = `(${count})`;
}

async function handleLogout() {
  if (logoutBtn) logoutBtn.disabled = true;
  const { error } = await supabase.auth.signOut();
  if (error) {
    if (logoutBtn) logoutBtn.disabled = false;
    showProfileError("خروج از حساب انجام نشد.");
    return;
  }
  window.location.href = "/shop";
}

function setupEvents() {
  profileForm?.addEventListener("submit", saveProfile);
  logoutBtn?.addEventListener("click", handleLogout);
  $("accountRetryBtn")?.addEventListener("click", initAccount);
  $("successModalOk")?.addEventListener("click", () => { if (successModal) successModal.hidden = true; });
  $("closeProfileErrorModal")?.addEventListener("click", hideProfileError);
  $("profileErrorOk")?.addEventListener("click", hideProfileError);
  document.querySelectorAll("[data-close-success]").forEach((el) => el.addEventListener("click", () => { if (successModal) successModal.hidden = true; }));
  document.querySelectorAll("[data-close-profile-error]").forEach((el) => el.addEventListener("click", hideProfileError));
}

async function initAccount() {
  showLoading();
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    currentUser = user || null;
    if (!currentUser) {
      window.location.href = "/login?redirect=/account";
      return;
    }
    await loadProfile();
    await updateCartCount();
    showContent();
  } catch (error) {
    console.error("Account initialization failed:", error);
    showPageError("خطا در بارگذاری اطلاعات حساب.");
  }
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) window.location.href = "/login?redirect=/account";
});
setupEvents();
initAccount();