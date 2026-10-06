import { supabase } from "./js/supabase.js";

const MIN_CHARS = 2;
const MAX_PRODUCTS = 6;
const MAX_CATEGORIES = 5;
const MAX_FETCH = 24;
const DEBOUNCE_MS = 220;

const PRODUCT_SELECT =
  "id,name,slug,price,type,categories(name,slug),product_images(storage_path,is_primary,sort_order)";
const PRODUCT_SELECT_INNER =
  "id,name,slug,price,type,categories!inner(name,slug),product_images(storage_path,is_primary,sort_order)";

const toggleBtn = document.getElementById("shop-search-toggle");
const searchForm = document.getElementById("shop-search-form");
const searchInput = document.getElementById("shop-search-input");
const searchClose = document.getElementById("shop-search-close");
const searchWrap = document.querySelector(".home-search-wrap");
const panel = document.getElementById("home-search-panel");

let debounceTimer = null;
let closeTimer = null;
let requestToken = 0;
let lastQuery = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[\u200C\u200D]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeTerm(value) {
  return normalizeText(value)
    .replace(/[,()*.:"'\\%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function formatPrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) return "";
  return `${Math.round(price).toLocaleString("fa-IR")} تومان`;
}

function categoryOf(product) {
  const categories = product.categories;
  if (Array.isArray(categories)) return categories[0] || null;
  return categories || null;
}

function productHref(product) {
  const slug = String(product.slug ?? "").trim();
  return slug
    ? `/product/${encodeURIComponent(slug)}`
    : `/product?id=${encodeURIComponent(product.id)}`;
}

function scoreProduct(product, term) {
  const name = normalizeText(product.name);
  const type = normalizeText(product.type);
  const category = normalizeText(categoryOf(product)?.name);
  if (name === term) return 0;
  if (name.startsWith(term)) return 1;
  if (name.includes(term)) return 2;
  if (category.includes(term)) return 3;
  if (type.includes(term)) return 4;
  return 5;
}

async function searchProductsByText(term) {
  const pattern = `%${term}%`;
  const fields = ["name", "type", "material", "description"];

  for (let attempt = 0; attempt < 2; attempt++) {
    const use = attempt === 0 ? fields : fields.slice(0, 2);
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("is_active", true)
      .or(use.map((field) => `${field}.ilike.${pattern}`).join(","))
      .limit(MAX_FETCH);

    if (!error) return data || [];
  }

  return [];
}

async function searchCategories(term) {
  const pattern = `%${term}%`;
  const { data, error } = await supabase
    .from("categories")
    .select("id,name,slug")
    .or(`name.ilike.${pattern},slug.ilike.${pattern}`)
    .limit(MAX_CATEGORIES);

  if (error) return [];
  return (data || []).filter((category) => category && category.slug);
}

async function searchProductsByCategory(slugs) {
  if (!slugs.length) return [];
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT_INNER)
    .eq("is_active", true)
    .in("categories.slug", slugs)
    .limit(MAX_FETCH);

  if (error) return [];
  return data || [];
}

function productItemMarkup(product) {
  const name = String(product.name || "محصول NICHERZ");
  const category = String(categoryOf(product)?.name || product.type || "");
  const image = pickImage(product.product_images);
  const price = formatPrice(product.price);

  const thumb = image
    ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async">`
    : `<span class="home-search-item-fallback" aria-hidden="true">N</span>`;

  return `
    <li class="home-search-item">
      <a class="home-search-link" href="${escapeHtml(productHref(product))}">
        <span class="home-search-thumb">${thumb}</span>
        <span class="home-search-item-info">
          <span class="home-search-item-name">${escapeHtml(name)}</span>
          ${category ? `<span class="home-search-item-meta">${escapeHtml(category)}</span>` : ""}
        </span>
        ${price ? `<span class="home-search-item-price">${escapeHtml(price)}</span>` : ""}
      </a>
    </li>
  `;
}

function renderResults(products, categories, term) {
  const shopHref = `/shop?q=${encodeURIComponent(term)}`;
  const parts = [];

  if (categories.length) {
    const chips = categories
      .map(
        (category) =>
          `<a class="home-search-chip" href="/shop?category=${encodeURIComponent(
            category.slug
          )}">${escapeHtml(category.name || category.slug)}</a>`
      )
      .join("");
    parts.push(`
      <div class="home-search-group" lang="fa" dir="rtl">
        <p class="home-search-group-title">دسته‌بندی‌ها</p>
        <div class="home-search-chips">${chips}</div>
      </div>
    `);
  }

  if (products.length) {
    const items = products.map(productItemMarkup).join("");
    parts.push(`
      <div class="home-search-group">
        <p class="home-search-group-title" lang="fa" dir="rtl">محصولات</p>
        <ul class="home-search-list">${items}</ul>
      </div>
    `);
  }

  parts.push(`
    <a class="home-search-all" href="${escapeHtml(shopHref)}" lang="fa" dir="rtl">
      مشاهده همه نتایج در فروشگاه
    </a>
  `);

  panel.innerHTML = parts.join("");
  showPanel();
}

function renderState(message, className = "") {
  panel.innerHTML = `<p class="home-search-state${className ? ` ${className}` : ""}" lang="fa" dir="rtl">${escapeHtml(
    message
  )}</p>`;
  showPanel();
}

function hidePanel() {
  if (!panel) return;
  panel.hidden = true;
  panel.innerHTML = "";
  if (searchInput) searchInput.setAttribute("aria-expanded", "false");
}

function showPanel() {
  if (!panel) return;
  panel.hidden = false;
  if (searchInput) searchInput.setAttribute("aria-expanded", "true");
}

async function runSearch(rawValue) {
  if (!panel) return;

  const term = sanitizeTerm(rawValue);
  if (term.length < MIN_CHARS) {
    hidePanel();
    return;
  }

  const token = ++requestToken;
  lastQuery = term;
  renderState("در حال جستجو…", "is-loading");

  let products = [];
  let categories = [];

  try {
    const [textProducts, matchedCategories] = await Promise.all([
      searchProductsByText(term),
      searchCategories(term),
    ]);

    products = textProducts;
    categories = matchedCategories;

    const slugs = matchedCategories.map((category) => category.slug).filter(Boolean);
    if (slugs.length) {
      const categoryProducts = await searchProductsByCategory(slugs);
      if (categoryProducts.length) {
        const known = new Set(products.map((product) => String(product.id)));
        products = products.concat(
          categoryProducts.filter((product) => !known.has(String(product.id)))
        );
      }
    }
  } catch (error) {
    if (token !== requestToken) return;
    console.error("Home search failed:", error);
    renderState("جستجو در حال حاضر ممکن نیست. دوباره تلاش کنید.", "is-error");
    return;
  }

  if (token !== requestToken) return;

  const ranked = products
    .filter((product) => product && product.is_active !== false)
    .sort((a, b) => {
      const diff = scoreProduct(a, term) - scoreProduct(b, term);
      if (diff !== 0) return diff;
      return String(a.name || "").localeCompare(String(b.name || ""));
    })
    .slice(0, MAX_PRODUCTS);

  if (!ranked.length && !categories.length) {
    renderState("نتیجه‌ای برای این جستجو پیدا نشد.");
    return;
  }

  renderResults(ranked, categories.slice(0, MAX_CATEGORIES), term);
}

function handleInput() {
  if (!searchInput) return;
  window.clearTimeout(debounceTimer);
  const value = searchInput.value;

  if (sanitizeTerm(value).length < MIN_CHARS) {
    requestToken += 1;
    hidePanel();
    return;
  }

  debounceTimer = window.setTimeout(() => runSearch(value), DEBOUNCE_MS);
}

function openSearch() {
  if (!searchForm || !toggleBtn) return;
  window.clearTimeout(closeTimer);
  searchForm.classList.remove("closing");
  searchForm.classList.add("active");
  toggleBtn.setAttribute("aria-expanded", "true");
  if (searchInput) searchInput.focus();
}

function closeSearch() {
  if (!searchForm || !toggleBtn) return;
  if (!searchForm.classList.contains("active")) return;

  window.clearTimeout(debounceTimer);
  requestToken += 1;
  hidePanel();
  lastQuery = "";

  searchForm.classList.remove("active");
  searchForm.classList.add("closing");
  toggleBtn.setAttribute("aria-expanded", "false");

  closeTimer = window.setTimeout(() => {
    searchForm.classList.remove("closing");
  }, 300);

  if (searchInput) searchInput.value = "";
}

function goToShop() {
  const term = sanitizeTerm(searchInput?.value || lastQuery);
  window.location.href = term ? `/shop?q=${encodeURIComponent(term)}` : "/shop";
}

function setupEvents() {
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      if (searchForm?.classList.contains("active")) {
        closeSearch();
      } else {
        openSearch();
      }
    });
  }

  if (searchClose) searchClose.addEventListener("click", closeSearch);

  if (searchForm) {
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      goToShop();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", handleInput);
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" && panel && !panel.hidden) {
        const first = panel.querySelector("a");
        if (first) {
          event.preventDefault();
          first.focus();
        }
      } else if (event.key === "Escape") {
        if (panel && !panel.hidden) {
          event.preventDefault();
          hidePanel();
          return;
        }
        closeSearch();
        toggleBtn?.focus();
      }
    });
  }

  panel?.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    hidePanel();
    searchInput?.focus();
  });

  panel?.addEventListener("click", (event) => {
    if (event.target.closest("a")) hidePanel();
  });

  document.addEventListener("click", (event) => {
    if (!panel || panel.hidden) return;
    if (panel.contains(event.target) || searchWrap?.contains(event.target)) return;
    hidePanel();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (searchForm?.classList.contains("active")) closeSearch();
  });

  window.addEventListener("resize", () => {
    if (panel && !panel.hidden && !searchInput?.value.trim()) hidePanel();
  });
}

if (toggleBtn && searchForm && searchInput && panel) {
  setupEvents();
}
