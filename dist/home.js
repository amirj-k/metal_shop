import { supabase } from "./js/supabase.js";

const SLIDER_LIMIT = 12;

const viewport = document.getElementById("homeSliderViewport");
const prevBtn = document.getElementById("homeSliderPrev");
const nextBtn = document.getElementById("homeSliderNext");
const scrollbarEl = document.getElementById("homeSliderScrollbar");
const scrollTrack = document.getElementById("homeSliderScrollbarTrack");
const scrollThumb = document.getElementById("homeSliderScrollbarThumb");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (viewport) {
  viewport.innerHTML = "";
}

function formatPrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) return "قیمت در حال بررسی";
  return `${Math.round(price).toLocaleString("fa-IR")} تومان`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isUnsafeSegment(segment) {
  return !segment || segment === "." || segment === ".." || /[\\/]/.test(segment) || /[\x00-\x1f\x7f]/.test(segment);
}

function publicImageUrl(storagePath) {
  const raw = String(storagePath ?? "").trim();
  if (!raw || /[\x00-\x1f\x7f\\]/.test(raw)) return "";

  let path = raw;
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(raw)) {
    try {
      const url = new URL(raw, "https://nicherz.ir");
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
      const match = url.pathname.match(
        /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/(?:product_image|product-images)\/(.+)$/i
      );
      if (!match) return url.href;
      path = match[1];
    } catch {
      return "";
    }
  }

  path = path
    .replace(/^\/+/, "")
    .replace(/^storage\/v1\/object\/(?:public|sign|authenticated)\//i, "")
    .replace(/^(?:product_image|product-images)\//i, "");

  const segments = path.split("/").map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });

  if (segments.some(isUnsafeSegment)) return "";

  const base = supabase.storage.from("product_image").getPublicUrl("").data?.publicUrl;
  if (!base) return "";

  try {
    const url = new URL(`${base.replace(/\/+$/, "")}/${segments.map(encodeURIComponent).join("/")}`);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function pickImage(images) {
  if (!Array.isArray(images) || !images.length) return "";
  const sorted = [...images].sort(
    (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
  );
  const primary = sorted.find((image) => image.is_primary) || sorted[0];
  return publicImageUrl(primary?.storage_path);
}

function maxScroll() {
  if (!viewport) return 0;
  return Math.max(0, viewport.scrollWidth - viewport.clientWidth);
}

function syncControls() {
  const count = slideCount();
  const hasSlides = count > 1;
  const max = maxScroll();
  const atStart = !viewport || viewport.scrollLeft <= 1;
  const atEnd = !viewport || max === 0 || viewport.scrollLeft >= max - 1;

  if (prevBtn) {
    prevBtn.hidden = !hasSlides;
    prevBtn.disabled = hasSlides && atStart;
  }
  if (nextBtn) {
    nextBtn.hidden = !hasSlides;
    nextBtn.disabled = hasSlides && atEnd;
  }
}

function syncScrollbar() {
  if (!scrollbarEl || !scrollTrack || !scrollThumb || !viewport) return;

  if (slideCount() <= 1) {
    scrollbarEl.hidden = true;
    return;
  }

  scrollbarEl.hidden = false;
  const trackW = scrollTrack.clientWidth;
  const max = maxScroll();
  const thumbW = Math.min(
    trackW,
    Math.max(36, Math.round((trackW * viewport.clientWidth) / Math.max(1, viewport.scrollWidth)))
  );
  const travel = Math.max(0, trackW - thumbW);
  const ratio = max > 0 ? Math.min(1, Math.max(0, viewport.scrollLeft / max)) : 0;

  scrollThumb.style.width = `${thumbW}px`;
  scrollThumb.style.transform = `translateX(${Math.round(ratio * travel)}px)`;
  scrollbarEl.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
}

function syncSlider() {
  syncControls();
  syncScrollbar();
}

function showState(message, { error = false, retry = false } = {}) {
  if (!viewport) return;
  viewport.innerHTML = "";
  const paragraph = document.createElement("p");
  paragraph.id = "homeSliderState";
  paragraph.className = error ? "home-slider-state is-error" : "home-slider-state";
  paragraph.setAttribute("role", error ? "alert" : "status");
  paragraph.textContent = message;
  viewport.appendChild(paragraph);

  if (retry) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "home-slider-retry";
    button.textContent = "تلاش دوباره";
    button.addEventListener("click", loadProducts);
    viewport.appendChild(button);
  }

  syncSlider();
}

function cardMarkup(product) {
  const slug = String(product.slug ?? "").trim();
  const href = slug
    ? `/product/${encodeURIComponent(slug)}`
    : `/product?id=${encodeURIComponent(product.id)}`;
  const name = String(product.name || "محصول NICHERZ");
  const band = String(product.category?.name || product.type || "");
  const image = pickImage(product.product_images);

  const imageHtml = image
    ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" loading="lazy" decoding="async">`
    : `<div class="home-product-image-fallback" aria-hidden="true">N</div>`;

  return `
    <a class="home-product-card" href="${escapeHtml(href)}" aria-label="${escapeHtml(name)}">
      <div class="home-product-image">${imageHtml}</div>
      <div class="home-product-info">
        <p class="home-product-band">${escapeHtml(band)}</p>
        <h3 class="home-product-name">${escapeHtml(name)}</h3>
        <div class="home-product-bottom">
          <span class="home-product-price">${escapeHtml(formatPrice(product.price))}</span>
          <span class="home-product-cta">VIEW →</span>
        </div>
      </div>
    </a>
  `;
}

function slideCount() {
  return viewport ? viewport.querySelectorAll(".home-slide").length : 0;
}

function currentIndex() {
  if (!viewport) return 0;
  const slides = [...viewport.querySelectorAll(".home-slide")];
  if (!slides.length) return 0;
  if (maxScroll() > 0 && viewport.scrollLeft >= maxScroll() - 1) return slides.length - 1;

  const viewportLeft = viewport.getBoundingClientRect().left;
  let best = 0;
  let bestDistance = Infinity;
  slides.forEach((slide, index) => {
    const distance = Math.abs(slide.getBoundingClientRect().left - viewportLeft);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

function scrollToIndex(index) {
  if (!viewport) return;
  const slides = viewport.querySelectorAll(".home-slide");
  const target = slides[Math.max(0, Math.min(index, slides.length - 1))];
  if (!target) return;
  const delta = target.getBoundingClientRect().left - viewport.getBoundingClientRect().left;
  viewport.scrollTo({
    left: viewport.scrollLeft + delta,
    behavior: reduceMotion.matches ? "auto" : "smooth",
  });
}

function step(direction) {
  scrollToIndex(currentIndex() + direction);
}

function renderProducts(products) {
  if (!viewport) return;
  viewport.innerHTML = "";
  products.forEach((product) => {
    const slide = document.createElement("div");
    slide.className = "home-slide";
    slide.innerHTML = cardMarkup(product);
    viewport.appendChild(slide);
  });

  viewport.scrollLeft = 0;
  syncSlider();

  viewport.querySelectorAll(".home-product-image img").forEach((img) => {
    img.addEventListener(
      "error",
      () => {
        const fallback = document.createElement("div");
        fallback.className = "home-product-image-fallback";
        fallback.setAttribute("aria-hidden", "true");
        fallback.textContent = "N";
        img.replaceWith(fallback);
      },
      { once: true }
    );
  });
}

async function loadProducts() {
  showState("در حال بارگذاری محصولات جدید…");

  try {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id,name,slug,price,type,is_active,created_at,categories(name),product_images(storage_path,is_primary,sort_order)"
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(SLIDER_LIMIT);

    if (error) throw error;

    const products = (data || []).filter((product) => product.is_active !== false);
    if (!products.length) {
      showState("هنوز محصول جدیدی منتشر نشده است.");
      return;
    }

    renderProducts(products);
  } catch (error) {
    console.error("Failed to load new products:", error);
    showState("خطا در بارگذاری محصولات جدید.", { error: true, retry: true });
  }
}

function bindSlider() {
  if (prevBtn) prevBtn.addEventListener("click", () => step(-1));
  if (nextBtn) nextBtn.addEventListener("click", () => step(1));

  if (viewport) {
    let ticking = false;
    viewport.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          syncSlider();
        });
      },
      { passive: true }
    );

    viewport.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      } else if (event.key === "Home") {
        event.preventDefault();
        scrollToIndex(0);
      } else if (event.key === "End") {
        event.preventDefault();
        scrollToIndex(slideCount() - 1);
      }
    });
  }

  let dragging = false;
  let dragStartX = 0;
  let dragStartScroll = 0;

  const thumbTravel = () =>
    Math.max(1, (scrollTrack?.clientWidth || 0) - (scrollThumb?.offsetWidth || 0));

  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    if (event && scrollThumb) {
      try {
        scrollThumb.releasePointerCapture(event.pointerId);
      } catch {
        /* pointer already released */
      }
    }
    if (viewport) viewport.style.scrollSnapType = "";
    scrollToIndex(currentIndex());
  };

  if (scrollThumb && scrollTrack && viewport) {
    scrollThumb.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      dragging = true;
      dragStartX = event.clientX;
      dragStartScroll = viewport.scrollLeft;
      viewport.style.scrollSnapType = "none";
      scrollThumb.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    scrollThumb.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const delta = ((event.clientX - dragStartX) / thumbTravel()) * maxScroll();
      viewport.scrollLeft = Math.min(maxScroll(), Math.max(0, dragStartScroll + delta));
    });

    scrollThumb.addEventListener("pointerup", endDrag);
    scrollThumb.addEventListener("pointercancel", endDrag);

    scrollThumb.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      } else if (event.key === "Home") {
        event.preventDefault();
        scrollToIndex(0);
      } else if (event.key === "End") {
        event.preventDefault();
        scrollToIndex(slideCount() - 1);
      }
    });

    scrollTrack.addEventListener("pointerdown", (event) => {
      if (event.target !== scrollTrack) return;
      const rect = scrollTrack.getBoundingClientRect();
      const travel = thumbTravel();
      const left = Math.min(travel, Math.max(0, event.clientX - rect.left - (scrollThumb.offsetWidth || 0) / 2));
      viewport.scrollLeft = (left / travel) * maxScroll();
      scrollToIndex(currentIndex());
    });
  }

  const onResize = () => syncSlider();
  window.addEventListener("resize", onResize);
  if (typeof ResizeObserver === "function" && viewport) {
    new ResizeObserver(onResize).observe(viewport);
  }
}

bindSlider();
loadProducts();
