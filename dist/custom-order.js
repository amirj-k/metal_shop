import { supabase } from "./js/supabase.js";

const BUCKET = "custom_order_designs";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const CUSTOM_ORDER_DRAFT_KEY = "pendingCustomOrder";

const TYPE_INFO = {
  plaque: {
    label: "پلاک با طرح دلخواه",
    price: 380000
  },
  album: {
    label: "آلبوم با طرح دلخواه",
    price: 550000
  }
};

const form = document.getElementById("customOrderForm");
const gate = document.getElementById("customOrderGate");
const successBox = document.getElementById("customOrderSuccess");
const alertBox = document.getElementById("customOrderFormAlert");
const submitBtn = document.getElementById("customOrderSubmit");
const anotherBtn = document.getElementById("customOrderAnother");
const summaryType = document.getElementById("customSummaryType");
const summaryPrice = document.getElementById("customSummaryPrice");
const fileInput = document.getElementById("customDesignImage");
const uploadError = document.getElementById("customUploadError");
const uploadPreview = document.getElementById("customUploadPreview");
const uploadPreviewImg = document.getElementById("customUploadPreviewImg");
const uploadRemove = document.getElementById("customUploadRemove");

let currentUser = null;
let previewUrl = "";
let submitting = false;

function formatPrice(value) {
  return `${Math.round(Number(value) || 0).toLocaleString("fa-IR")} تومان`;
}

function selectedType() {
  const checked = form?.querySelector('input[name="customType"]:checked');
  return checked?.value === "album" ? "album" : "plaque";
}

function setFieldError(id, message) {
  const input = document.getElementById(id);
  const error = document.getElementById(`${id}Error`);
  if (error) error.textContent = message || "";
  if (input) {
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }
}

function showAlert(message) {
  if (!alertBox) return;
  if (!message) {
    alertBox.hidden = true;
    alertBox.textContent = "";
    return;
  }
  alertBox.hidden = false;
  alertBox.textContent = message;
}

function syncType() {
  const type = selectedType();
  if (form) form.dataset.type = type;
  const info = TYPE_INFO[type];
  if (summaryType) summaryType.textContent = info.label;
  if (summaryPrice) summaryPrice.textContent = formatPrice(info.price);

  setFieldError("customArtistName", "");
  setFieldError("customAlbumName", "");
  setFieldError("customDesignTitle", "");
}

function clearUploadError() {
  if (uploadError) uploadError.textContent = "";
}

function revokePreview() {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = "";
  }
  if (uploadPreview) uploadPreview.hidden = true;
  if (uploadPreviewImg) uploadPreviewImg.removeAttribute("src");
}

function resetFileInput() {
  if (fileInput) fileInput.value = "";
  revokePreview();
  clearUploadError();
}

function validateFile(file) {
  if (!file) return "";
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "فرمت تصویر باید JPG، PNG، WEBP یا GIF باشد.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "حجم تصویر نباید بیشتر از ۵ مگابایت باشد.";
  }
  return "";
}

function handleFileSelected(file) {
  clearUploadError();
  revokePreview();

  const message = validateFile(file);
  if (message) {
    if (fileInput) fileInput.value = "";
    if (uploadError) uploadError.textContent = message;
    return;
  }

  if (!file) return;

  previewUrl = URL.createObjectURL(file);
  if (uploadPreviewImg) uploadPreviewImg.src = previewUrl;
  if (uploadPreview) uploadPreview.hidden = false;
}

function normalizePhone(value) {
  return String(value ?? "").replace(/[\s()\-.+]/g, "");
}

function validate() {
  let valid = true;

  const name = document.getElementById("customContactName")?.value.trim() || "";
  if (!name) {
    setFieldError("customContactName", "نام و نام خانوادگی الزامی است.");
    valid = false;
  } else if (name.length > 120) {
    setFieldError("customContactName", "نام نباید بیشتر از ۱۲۰ کاراکتر باشد.");
    valid = false;
  } else {
    setFieldError("customContactName", "");
  }

  const phoneRaw = document.getElementById("customContactPhone")?.value.trim() || "";
  const phone = normalizePhone(phoneRaw);
  if (!phone) {
    setFieldError("customContactPhone", "شماره تماس الزامی است.");
    valid = false;
  } else if (!/^(?:0)?9\d{9}$/.test(phone) && !/^989\d{9}$/.test(phone)) {
    setFieldError("customContactPhone", "شماره موبایل معتبر وارد کنید (مثال: 09123456789).");
    valid = false;
  } else {
    setFieldError("customContactPhone", "");
  }

  const type = selectedType();

  if (type === "album") {
    const artist = document.getElementById("customArtistName")?.value.trim() || "";
    const album = document.getElementById("customAlbumName")?.value.trim() || "";
    if (!artist) {
      setFieldError("customArtistName", "نام خواننده یا گروه الزامی است.");
      valid = false;
    } else {
      setFieldError("customArtistName", "");
    }
    if (!album) {
      setFieldError("customAlbumName", "نام آلبوم الزامی است.");
      valid = false;
    } else {
      setFieldError("customAlbumName", "");
    }
    setFieldError("customDesignTitle", "");
  } else {
    const title = document.getElementById("customDesignTitle")?.value.trim() || "";
    if (!title) {
      setFieldError("customDesignTitle", "عنوان طرح دلخواه الزامی است.");
      valid = false;
    } else {
      setFieldError("customDesignTitle", "");
    }
    setFieldError("customArtistName", "");
    setFieldError("customAlbumName", "");
  }

  return valid;
}

function setSubmitting(loading) {
  submitting = loading;
  if (!submitBtn) return;
  submitBtn.disabled = loading;
  submitBtn.textContent = loading ? "در حال آماده‌سازی…" : "ادامه و تسویه حساب";
}

function showGate(show) {
  if (gate) gate.hidden = !show;
  if (form) form.hidden = show;
  if (show && successBox) successBox.hidden = true;
}

function showSuccess(show) {
  if (successBox) successBox.hidden = !show;
  if (show) {
    if (form) form.hidden = true;
    if (gate) gate.hidden = true;
  } else {
    showGate(!currentUser);
    if (form && currentUser) form.hidden = false;
  }
}

function resetForm() {
  if (!form) return;
  form.reset();
  form.dataset.type = "plaque";
  ["customContactName", "customContactPhone", "customArtistName", "customAlbumName", "customDesignTitle"].forEach((id) =>
    setFieldError(id, "")
  );
  showAlert("");
  resetFileInput();
  syncType();
  showSuccess(false);
}

async function uploadDesign(file, userId) {
  const originalName = String(file.name || "design").replace(/[^\w.\-]+/g, "_").slice(-60) || "design";
  const path = `${userId}/${Date.now()}-${originalName}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined
  });

  if (error) throw error;
  return path;
}

async function removeUploaded(path) {
  if (!path) return;
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch (error) {
    console.warn("Could not clean up uploaded design:", error);
  }
}

function buildDraft(type, phone, uploadedPath) {
  const draft = {
    custom_type: type,
    contact_name: document.getElementById("customContactName")?.value.trim() || null,
    contact_phone: phone || null,
    description: document.getElementById("customDescription")?.value.trim() || null,
    image_path: uploadedPath || null,
    created_at: Date.now()
  };

  if (type === "album") {
    draft.artist_name = document.getElementById("customArtistName")?.value.trim() || null;
    draft.album_name = document.getElementById("customAlbumName")?.value.trim() || null;
    draft.design_title = null;
  } else {
    draft.design_title = document.getElementById("customDesignTitle")?.value.trim() || null;
    draft.artist_name = null;
    draft.album_name = null;
  }

  return draft;
}

async function handleSubmit(event) {
  event.preventDefault();
  if (submitting) return;

  showAlert("");

  if (!currentUser) {
    showGate(true);
    return;
  }

  if (!validate()) {
    showAlert("لطفاً خطاهای فرم را برطرف کنید.");
    const firstInvalid = form?.querySelector('[aria-invalid="true"]');
    firstInvalid?.focus();
    return;
  }

  const file = fileInput?.files?.[0] || null;
  if (file) {
    const fileMessage = validateFile(file);
    if (fileMessage) {
      if (uploadError) uploadError.textContent = fileMessage;
      return;
    }
  }

  const type = selectedType();
  const phoneRaw = document.getElementById("customContactPhone")?.value.trim() || "";
  const phoneDigits = normalizePhone(phoneRaw);
  const phone = phoneDigits.length === 10 ? `0${phoneDigits}` : phoneDigits;

  setSubmitting(true);

  let uploadedPath = "";

  try {
    if (file) {
      uploadedPath = await uploadDesign(file, currentUser.id);
    }

    const draft = buildDraft(type, phone, uploadedPath);
    sessionStorage.setItem(CUSTOM_ORDER_DRAFT_KEY, JSON.stringify(draft));
    sessionStorage.removeItem("appliedPromo");

    if (typeof window.showSuccess === "function") {
      window.showSuccess("اطلاعات طرح ثبت شد. حالا آدرس ارسال را وارد کنید.", "سفارش اختصاصی");
    }

    location.href = "/checkout?custom=1";
  } catch (error) {
    console.error("Custom order continue failed:", error);
    await removeUploaded(uploadedPath);
    showAlert(
      error?.message
        ? String(error.message)
        : "خطا در آماده‌سازی سفارش. دوباره تلاش کنید."
    );
    setSubmitting(false);
  }
}

async function resolveSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    currentUser = data?.session?.user || null;
  } catch (error) {
    console.error("Could not read auth session:", error);
    currentUser = null;
  }

  if (!currentUser) {
    showGate(true);
    showSuccess(false);
    return;
  }

  showGate(false);
  if (successBox?.hidden) {
    if (form) form.hidden = false;
  }
}

function bindEvents() {
  form?.addEventListener("submit", handleSubmit);

  form?.querySelectorAll('input[name="customType"]').forEach((radio) => {
    radio.addEventListener("change", syncType);
  });

  fileInput?.addEventListener("change", () => {
    handleFileSelected(fileInput.files?.[0] || null);
  });

  uploadRemove?.addEventListener("click", () => {
    resetFileInput();
    fileInput?.focus();
  });

  anotherBtn?.addEventListener("click", () => {
    resetForm();
    form?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  ["customContactName", "customContactPhone", "customArtistName", "customAlbumName", "customDesignTitle"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => setFieldError(id, ""));
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    if (!currentUser) {
      showGate(true);
      showSuccess(false);
    } else if (successBox?.hidden) {
      showGate(false);
      if (form) form.hidden = false;
    }
  });
}

if (form) {
  form.dataset.type = "plaque";
  syncType();
  bindEvents();
  showGate(true);
  resolveSession();
}
