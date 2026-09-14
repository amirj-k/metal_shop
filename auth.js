import { supabase } from "./js/supabase.js";

const form = document.getElementById("loginForm") || document.getElementById("registerForm");
const message = document.getElementById("authMessage");
const button = document.getElementById("loginBtn") || document.getElementById("registerBtn");

function showMessage(text, type = "") {
  if (!message) return;
  message.textContent = text;
  message.className = `auth-message ${type}`.trim();
}

function destinationFromRedirect() {
  const raw = (new URLSearchParams(window.location.search).get("redirect") || "").trim();
  if (!raw) return "/shop";
  const key = raw.replace(/\.html$/i, "").replace(/^\/+/, "").split(/[?#]/)[0].toLowerCase();
  if (key === "checkout") return "/cart";
  const allowed = {
    cart: "/cart",
    account: "/account",
    orders: "/orders",
    admin: "/admin",
    payment: "/payment",
    shop: "/shop",
    contact: "/contact",
    product: "/product",
    home: "/",
    "": "/",
  };
  return allowed[key] || "/shop";
}

function setLoading(loading, text) {
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? text : (button.id === "loginBtn" ? "ENTER ARCHIVE" : "CREATE ACCOUNT");
}

if (form?.id === "loginForm") {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    showMessage("");
    setLoading(true, "ENTERING...");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      console.error(error);
      showMessage(error.message, "error");
      setLoading(false);
      return;
    }

    showMessage("Welcome back. Redirecting...", "success");
    window.location.href = destinationFromRedirect();
  });
}

if (form?.id === "registerForm") {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (password !== confirmPassword) {
      showMessage("Passwords do not match.", "error");
      return;
    }

    if (password.length < 6) {
      showMessage("Password must be at least 6 characters.", "error");
      return;
    }

    showMessage("");
    setLoading(true, "CREATING...");

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      console.error(error);
      showMessage(error.message, "error");
      setLoading(false);
      return;
    }

    if (data.session) {
      showMessage("Account created. Redirecting...", "success");
      window.location.href = destinationFromRedirect();

      return;
    }

    showMessage("Account created. Check your email to confirm your account.", "success");
    form.reset();
    setLoading(false);
  });
}

const cartPill = document.querySelector(".cart-pill");
if (cartPill) {
  try {
    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    const count = cart.reduce((total, item) => total + Number(item.quantity || 0), 0);
    cartPill.textContent = `CART (${count})`;
  } catch {
    cartPill.textContent = "CART (0)";
  }
}
