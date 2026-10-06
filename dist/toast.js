// اگر ظرف Toast از قبل ساخته نشده باشد، آن را ایجاد می‌کند.
if (!document.querySelector(".toast-container")) {
  // ظرف اصلی پیام‌ها را می‌سازد.
  const container = document.createElement("div");
  // کلاس CSS ظرف پیام‌ها را تعیین می‌کند.
  container.className = "toast-container";
  // به ابزارهای کمکی اعلام می‌کند که پیام‌ها به‌صورت زنده تغییر می‌کنند.
  container.setAttribute("aria-live", "polite");
  // تغییر کامل محتوای پیام را برای ابزارهای دسترسی مشخص می‌کند.
  container.setAttribute("aria-atomic", "true");
  // ظرف پیام را به بدنه صفحه اضافه می‌کند.
  document.body.appendChild(container);
}

// یک پیام Toast با نوع، زمان و عنوان دلخواه نمایش می‌دهد.
function showToast(message, type = "info", duration = 3000, title = null) {
  // ظرف نمایش پیام‌ها را پیدا می‌کند.
  const container = document.querySelector(".toast-container");
  // فقط نوع‌های تعریف‌شده را قبول می‌کند و بقیه را info در نظر می‌گیرد.
  const safeType = ["success", "error", "warning", "info", "loading"].includes(type)
    ? type
    : "info";

  // آیکن مناسب هر نوع پیام را مشخص می‌کند.
  const icons = {
    success: "✓",
    error: "✕",
    warning: "⚠",
    info: "ⓘ",
    loading: "⟳",
  };

  // عنصر اصلی پیام را می‌سازد.
  const toast = document.createElement("div");
  // کلاس پایه و نوع پیام را به آن می‌دهد.
  toast.className = `toast ${safeType}`;
  // برای پیام خطا alert و برای بقیه status تعیین می‌کند.
  toast.setAttribute("role", safeType === "error" ? "alert" : "status");

  // بخش آیکن را می‌سازد.
  const icon = document.createElement("div");
  icon.className = "toast-icon";
  // آیکن متناسب با نوع پیام را قرار می‌دهد.
  icon.textContent = icons[safeType];

  // ظرف متن پیام را می‌سازد.
  const messageWrap = document.createElement("div");
  messageWrap.className = "toast-message";

  // عنوان داده‌شده یا عنوان پیش‌فرض نوع پیام را انتخاب می‌کند.
  const titleText = title || getDefaultTitle(safeType);
  // اگر عنوانی وجود داشته باشد، آن را به پیام اضافه می‌کند.
  if (titleText) {
    const titleElement = document.createElement("p");
    titleElement.className = "toast-title";
    titleElement.textContent = titleText;
    messageWrap.appendChild(titleElement);
  }

  // متن اصلی پیام را می‌سازد.
  const textElement = document.createElement("p");
  textElement.className = "toast-text";
  // متن را به صورت امن و بدون تفسیر HTML قرار می‌دهد.
  textElement.textContent = String(message ?? "");
  messageWrap.appendChild(textElement);

  // دکمه بستن پیام را می‌سازد.
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "toast-close";
  closeBtn.setAttribute("aria-label", "Close notification");
  closeBtn.textContent = "×";
  // با کلیک، پیام را با افکت خروج حذف می‌کند.
  closeBtn.addEventListener("click", () => removeToast(toast));

  // آیکن، متن و دکمه بستن را داخل Toast قرار می‌دهد.
  toast.append(icon, messageWrap, closeBtn);
  // Toast را در صفحه نمایش می‌دهد.
  container.appendChild(toast);

  // اگر زمان بیشتر از صفر باشد، پیام را بعد از آن زمان حذف می‌کند.
  if (duration > 0) {
    window.setTimeout(() => removeToast(toast), duration);
  }

  // خود عنصر Toast را برمی‌گرداند تا در صورت نیاز دوباره استفاده شود.
  return toast;
}

// عنوان پیش‌فرض هر نوع Toast را برمی‌گرداند.
function getDefaultTitle(type) {
  // عنوان‌های استاندارد پیام‌ها.
  const titles = {
    success: "✓ Success",
    error: "✕ Error",
    warning: "⚠ Warning",
    info: "ⓘ Info",
    loading: "Loading...",
  };
  // عنوان نوع موردنظر یا عنوان عمومی را برمی‌گرداند.
  return titles[type] || "Notification";
}

// یک Toast را با افکت خروج از صفحه حذف می‌کند.
function removeToast(toast) {
  // اگر عنصر وجود نداشته باشد یا قبلاً در حال حذف باشد، کاری نمی‌کند.
  if (!toast || toast.dataset.removing === "true") return;
  // علامت حذف را ثبت می‌کند تا حذف دوباره اتفاق نیفتد.
  toast.dataset.removing = "true";
  // انیمیشن خروج را روی Toast قرار می‌دهد.
  toast.style.animation = "slideOutRight 0.3s ease forwards";
  // بعد از تمام شدن انیمیشن، عنصر را واقعاً حذف می‌کند.
  window.setTimeout(() => toast.remove(), 300);
}

// پیام موفقیت با زمان نمایش سه ثانیه‌ای.
function showSuccess(message, title = "✓ Success") {
  return showToast(message, "success", 3000, title);
}

// پیام خطا با زمان نمایش چهار ثانیه‌ای.
function showError(message, title = "✕ Error") {
  return showToast(message, "error", 4000, title);
}

// پیام هشدار با زمان نمایش سه و نیم ثانیه‌ای.
function showWarning(message, title = "⚠ Warning") {
  return showToast(message, "warning", 3500, title);
}

// پیام اطلاعاتی با زمان نمایش سه ثانیه‌ای.
function showInfo(message, title = "ⓘ Info") {
  return showToast(message, "info", 3000, title);
}

// پیام در حال بارگذاری را بدون زمان حذف خودکار نمایش می‌دهد.
function showLoading(message, title = "Loading...") {
  return showToast(message, "loading", 0, title);
}

// یک Toast در حال بارگذاری را حذف و پیام جدید را جایگزین آن می‌کند.
function replaceLoading(loadingToast, message, type = "success", title = null) {
  removeToast(loadingToast);
  return showToast(message, type, 3000, title);
}
