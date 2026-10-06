import { supabase } from "./js/supabase.js";


// ========================================
// Resolve product identifier from the URL
// Supports:
//   /product?id=123
//   /product/id-123
//   /product/<slug>
//   /product/<slug>.html
// ========================================

function parseProductId(value) {
  const text = String(value ?? "");
  const id = Number(text);
  return /^[0-9]+$/.test(text) && Number.isSafeInteger(id) && id > 0
    ? id
    : NaN;
}

function resolveProductRoute() {
  const params = new URLSearchParams(window.location.search);
  const invalid = { id: NaN, slug: null };
  const ids = params.getAll("id");
  if (ids.length > 1 || (ids.length && !Number.isSafeInteger(parseProductId(ids[0])))) {
    return invalid;
  }

  const match = (window.location.pathname || "").match(/^\/product\/([^/]+)\/?$/);
  let slug = null;
  if (match) {
    try {
      slug = decodeURIComponent(match[1]);
    } catch {
      return invalid;
    }
  }

  const snapshotId = parseProductId(document.body?.dataset.productId);
  if (Number.isSafeInteger(snapshotId)) {
    return { id: snapshotId, slug: null };
  }
  if (slug !== null) {
    return { id: NaN, slug };
  }
  return { id: parseProductId(ids[0]), slug: null };
}

function productPath(product) {
  return typeof product.slug === "string" && product.slug.length
    ? `/product/${encodeURIComponent(product.slug)}`
    : `/product?id=${encodeURIComponent(product.id)}`;
}

const productRoute = resolveProductRoute();
let productId = NaN;


// ========================================
// DOM elements
// ========================================

const productImage =
  document.getElementById("productImage");

const productName =
  document.getElementById("productName");

const productBand =
  document.getElementById("productBand");

const productDescription =
  document.getElementById("productDescription");

const productType =
  document.getElementById("productType");

const productPrice =
  document.getElementById("productPrice");

const productStock =
  document.getElementById("productStock");

const sizeOptions =
  document.getElementById("sizeOptions");

const qtyDecrease =
  document.getElementById("qtyDecrease");

const qtyIncrease =
  document.getElementById("qtyIncrease");

const qtyInput =
  document.getElementById("qtyInput");

const addToCartBtn =
  document.getElementById("addToCartBtn");

const relatedProductsGrid =
  document.getElementById(
    "relatedProductsGrid"
  );


// ========================================
// Current selected variant
// ========================================

let currentProduct = null;
let selectedVariant = null;


// ========================================
// Helpers
// ========================================

function publicImageUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw || /[\u0000-\u001f\u007f\\]/.test(raw)) return "";

  try {
    let path = raw;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) {
      const url = new URL(raw, "https://nicherz.ir");
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
      const storage = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/(?:product_image|product-images)\/(.+)$/i);
      if (!storage) return url.href;
      path = storage[1];
    } else if (/^(?:\.?\/)?Images\//i.test(raw)) {
      return new URL(raw.replace(/^\.\//, ""), "https://nicherz.ir/").href;
    }

    path = path.replace(/^\/+/, "")
      .replace(/^storage\/v1\/object\/(?:public|sign|authenticated)\//i, "")
      .replace(/^(?:product_image|product-images)\//i, "");
    const segments = path.split("/").map(segment => decodeURIComponent(segment));
    if (segments.some(segment => !segment || segment === "." || segment === ".." || /[\u0000-\u001f\u007f/\\]/.test(segment))) return "";
    const encodedPath = segments.map(segment => encodeURIComponent(segment)).join("/");
    const publicBase = supabase.storage.from("product_image").getPublicUrl("").data?.publicUrl;
    if (!publicBase) return "";
    const url = new URL(`${publicBase.replace(/\/+$/, "")}/${encodedPath}`);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function setMetadata(attribute, key, value) {
  const matches = [...document.querySelectorAll(`meta[${attribute}="${key}"]`)];
  let meta = matches.shift();
  matches.forEach(item => item.remove());
  if (value === null) {
    meta?.remove();
    return;
  }
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attribute, key);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", value);
}

function clearPurchaseInfo(message) {
  currentProduct = null;
  selectedVariant = null;
  productId = NaN;
  if (productPrice) productPrice.textContent = "";
  if (productStock) productStock.textContent = message;
  if (sizeOptions) {
    sizeOptions.innerHTML = "";
    sizeOptions.dataset.selectedVariantId = "";
    sizeOptions.dataset.selectedSize = "";
  }
  document.querySelectorAll(".detail-specs .spec-item").forEach(item => {
    const label = item.querySelector(".spec-label")?.textContent.trim();
    if (/^(?:Price|Stock|قیمت|موجودی)\s*:?$/i.test(label || "")) {
      const value = item.querySelector(".spec-value");
      if (value) value.textContent = "";
    }
  });
  [addToCartBtn, qtyInput, qtyDecrease, qtyIncrease].forEach(control => {
    if (control) control.disabled = true;
  });
  if (qtyInput) {
    qtyInput.value = "1";
    qtyInput.max = "1";
  }
  if (addToCartBtn) {
    addToCartBtn.onclick = null;
    addToCartBtn.textContent = message;
  }
}

function productSchemas() {
  return [...document.querySelectorAll('script[type="application/ld+json"]')].filter(script => {
    if (script.id === "productJsonLd") return true;
    try {
      const data = JSON.parse(script.textContent);
      return data["@type"] === "Product";
    } catch {
      return false;
    }
  });
}

function showProductFailure(missing = false) {
  clearPurchaseInfo("UNAVAILABLE");
  productSchemas().forEach(script => script.remove());
  setMetadata("name", "robots", "noindex, follow");
  let status = document.getElementById("productLoadStatus");
  if (!status) {
    status = document.createElement("p");
    status.id = "productLoadStatus";
    status.className = "detail-description";
    status.setAttribute("role", "alert");
    (document.querySelector(".product-detail-info") || document.body).appendChild(status);
  }
  status.textContent = missing
    ? "This product is unavailable or no longer exists."
    : "Unable to refresh this product. Purchasing is disabled. Please try again later.";

  if (missing || !productName?.textContent.trim()) {
    if (productName) productName.textContent = "Product unavailable";
    [productBand, productDescription, productType].forEach(element => {
      if (element) element.textContent = "";
    });
    if (productImage) {
      productImage.removeAttribute("src");
      productImage.alt = "";
    }
    if (relatedProductsGrid) relatedProductsGrid.innerHTML = "";
    const breadcrumb = document.getElementById("productBreadcrumbName");
    if (breadcrumb) breadcrumb.textContent = "Product unavailable";
    document.querySelectorAll('link[rel="canonical"]').forEach(link => link.remove());
    document.title = "محصول در دسترس نیست | NICHERZ";
    const description = "این محصول در حال حاضر در دسترس نیست. محصولات دیگر را در فروشگاه NICHERZ ببینید.";
    setMetadata("name", "description", description);
    setMetadata("property", "og:title", document.title);
    setMetadata("property", "og:description", description);
    setMetadata("property", "og:url", null);
    setMetadata("name", "twitter:title", document.title);
    setMetadata("name", "twitter:description", description);
    setMetadata("property", "og:image", null);
    setMetadata("name", "twitter:image", null);
    setMetadata("name", "twitter:card", "summary");
  }
}

function formatPrice(value) {

  return `${Number(value || 0).toLocaleString("fa-IR")} تومان`;
}


function readCart() {

  try {

    const cart =
      JSON.parse(
        localStorage.getItem("cart")
      );

    return Array.isArray(cart)
      ? cart
      : [];

  } catch {

    return [];
  }
}


function saveCart(cart) {

  localStorage.setItem(
    "cart",
    JSON.stringify(cart)
  );
}


function getCartQuantity(
  cart,
  productId,
  variantId = null
) {

  return cart.reduce(
    (total, item) => {

      if (
        String(item.productId) !==
        String(productId)
      ) {
        return total;
      }

      if (
        variantId !== null &&
        String(item.variantId ?? "") !==
        String(variantId)
      ) {
        return total;
      }

      return (
        total +
        Math.max(
          0,
          Number(item.quantity) || 0
        )
      );
    },
    0
  );
}


function updateCartCount() {

  const cart =
    readCart();

  const totalItems =
    cart.reduce(
      (sum, item) =>
        sum +
        Math.max(
          0,
          Number(item.quantity) || 0
        ),
      0
    );

  const cartPill =
    document.querySelector(
      ".cart-pill"
    );

  if (cartPill) {

    cartPill.textContent =
      `CART (${totalItems})`;
  }
}


// ========================================
// Load product from Supabase
// ========================================

async function loadProduct() {
  clearPurchaseInfo("CHECKING AVAILABILITY...");
  productSchemas().forEach((script, index) => {
    if (index > 0) {
      script.remove();
      return;
    }
    try {
      const data = JSON.parse(script.textContent);
      delete data.brand;
      delete data.image;
      script.id = "productJsonLd";
      script.textContent = JSON.stringify(data).replace(/</g, "\\u003c");
    } catch {
      script.remove();
    }
  });
  document.documentElement.lang = "en";
  setMetadata("property", "og:locale", "fa_IR");

  if (!Number.isSafeInteger(productRoute.id) && !productRoute.slug) {
    showProductFailure(true);
    return;
  }

  async function fetchProduct(field, value) {
    return supabase
    .from("products")
    .select(`
      id,
      name,
      slug,
      description,
      type,
      price,
      material,
      is_active,
      category_id,

      categories (
        id,
        name,
        slug
      ),

      product_variants (
        id,
        size,
        sku,
        stock,
        price
      ),

      product_images (
        id,
        storage_path,
        alt_text,
        is_primary,
        sort_order
      )
    `)
    .eq(field, value)
    .maybeSingle();
  }

  let data;
  try {
    let result = await fetchProduct(
      productRoute.slug !== null ? "slug" : "id",
      productRoute.slug !== null ? productRoute.slug : productRoute.id
    );
    if (result.error) throw result.error;
    if (!result.data && productRoute.slug !== null) {
      const legacy = productRoute.slug.match(/^(?:id-)?([0-9]+)$/);
      const legacyId = parseProductId(legacy?.[1]);
      if (Number.isSafeInteger(legacyId)) {
        result = await fetchProduct("id", legacyId);
        if (result.error) throw result.error;
      }
    }
    data = result.data;
  } catch {
    showProductFailure();
    return;
  }

  if (!data || data.is_active !== true) {
    showProductFailure(true);
    return;
  }
  if (!Number.isSafeInteger(parseProductId(data.id))) {
    showProductFailure();
    return;
  }


  // ====================================
  // Normalize variants
  // ====================================

  const variants =
    Array.isArray(
      data.product_variants
    )
      ? data.product_variants
      : [];


  // Sort variants by ID
  variants.sort(
    (a, b) =>
      Number(a.id) -
      Number(b.id)
  );


  // ====================================
  // Normalize images
  // ====================================

  const images =
    Array.isArray(
      data.product_images
    )
      ? data.product_images
      : [];


  images.sort(
    (a, b) =>
      (a.sort_order || 0) -
      (b.sort_order || 0)
  );


  const primaryImage =
    images.find(
      image =>
        image.is_primary
    ) ||
    images[0] ||
    null;


  // ====================================
  // Total stock
  // ====================================

  const stock =
    variants.reduce(
      (total, variant) =>
        total +
        Math.max(
          0,
          Number(variant.stock) || 0
        ),
      0
    );


  // ====================================
  // Default price
  // ====================================

  const price =
    variants[0]?.price != null
      ? Number(
        variants[0].price
      )
      : Number(
        data.price || 0
      );


  // ====================================
  // Category
  // ====================================

  const categoryData =
    Array.isArray(data.categories)
      ? data.categories[0]
      : data.categories;


  // ====================================
  // Product object
  // ====================================

  const product = {

    id:
      data.id,

    name:
      data.name,

    slug:
      data.slug,

    description:
      data.description || "",

    type:
      data.type || "",

    material:
      data.material || "",

    categoryId:
      data.category_id ||
      categoryData?.id ||
      null,

    category:
      categoryData?.slug ||
      "",

    categoryName:
      categoryData?.name ||
      "",

    price,

    stock,

    variants,

    images,

    image:
      publicImageUrl(primaryImage?.storage_path),

    imageAlt:
      primaryImage?.alt_text ||
      data.name
  };


  productId = parseProductId(product.id);
  product.id = productId;
  currentProduct = product;
  document.getElementById("productLoadStatus")?.remove();
  setMetadata("name", "robots", "index, follow");


  renderProduct(
    product
  );


  try {
    await loadRelatedProducts(product);
  } catch {
    renderRelatedProducts([]);
  }


  updateCartCount();
}


// ========================================
// Render product
// ========================================

function updateProductMetadata(product) {

  const normalizeText = value =>
    String(value || "").replace(/\s+/g, " ").trim();

  const name = normalizeText(product.name) || `محصول ${product.id}`;
  const type = normalizeText(product.type).toLowerCase();
  const category = normalizeText(product.categoryName).toLowerCase();
  const purchaseLabel =
    type === "album" || type === "albums" || type === "آلبوم" ||
    category === "albums" || category === "آلبوم"
      ? "خرید آلبوم"
      : "خرید";
  const title = `${purchaseLabel} ${name} | NICHERZ`;
  const details = [product.type, product.material, product.categoryName]
    .map(normalizeText)
    .filter(Boolean)
    .join(" · ");
  const rawDescription = normalizeText(product.description);
  const looksPersian = /[\u0600-\u06FF]/.test(rawDescription);
  const description = looksPersian
    ? rawDescription
    : `${name}${details ? ` — ${details}` : ""} را از فروشگاه NICHERZ ببینید و خریداری کنید.`;

  document.title = title;

  const productUrl = `https://nicherz.ir${productPath(product)}`;

  const metadata = [
    ["name", "description", description],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:type", "product"],
    ["property", "og:url", productUrl],
    ["property", "og:locale", "fa_IR"],
    ["property", "og:image", product.image || null],
    ["name", "twitter:image", product.image || null],
    ["name", "twitter:card", product.image ? "summary_large_image" : "summary"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description]
  ];

  metadata.forEach(([attribute, key, value]) => setMetadata(attribute, key, value));

  let canonical = document.querySelector('link[rel="canonical"]');

  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }

  canonical.setAttribute("href", productUrl);
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.textContent);
      if (data["@type"] !== "BreadcrumbList" || !Array.isArray(data.itemListElement)) return;
      const last = data.itemListElement[data.itemListElement.length - 1];
      if (last) {
        last.name = name;
        last.item = productUrl;
        script.textContent = JSON.stringify(data).replace(/</g, "\\u003c");
      }
    } catch {
      return;
    }
  });

  updateProductJsonLd(product, description, productUrl);
}


function updateProductJsonLd(product, description, productUrl) {

  const normalizeText = value =>
    String(value || "").replace(/\s+/g, " ").trim();

  const name = normalizeText(product.name);
  const image = product.image || "";

  const price = Number(product.price);
  const inStock = Number(product.stock) > 0;

  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    productID: String(product.id),
    name,
    description,
    url: productUrl,
    category: normalizeText(product.categoryName) || undefined
  };

  if (Number.isFinite(price) && price >= 0) {
    data.offers = {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: "IRR",
      price: String(Math.round(price)),
      itemCondition: "https://schema.org/NewCondition",
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
    };
  }

  if (image) {
    data.image = image;
  }

  let script = document.getElementById("productJsonLd");

  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "productJsonLd";
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify(data).replace(/</g, "\\u003c");
}


function renderProduct(product) {

  updateProductMetadata(product);
  const breadcrumb = document.getElementById("productBreadcrumbName");
  if (breadcrumb) breadcrumb.textContent = product.name;

  // ====================================
  // Main image
  // ====================================

  if (productImage) {

    if (product.image) {

      productImage.src =
        product.image;

      productImage.alt =
        product.imageAlt;

    } else {

      productImage.removeAttribute(
        "src"
      );

      productImage.alt =
        product.name;
    }


    productImage.loading =
      "eager";

    productImage.decoding =
      "async";


    productImage.addEventListener(
      "error",
      () => {

        productImage.removeAttribute(
          "src"
        );

      },
      {
        once: true
      }
    );
  }


  // ====================================
  // Basic information
  // ====================================

  if (productName) {

    productName.textContent =
      product.name;
  }


  if (productBand) {

    productBand.textContent =
      product.categoryName ||
      "";

    productBand.hidden =
      !product.categoryName;
  }


  if (productDescription) {

    productDescription.textContent =
      product.description;
  }


  if (productType) {

    productType.textContent =
      product.type;
  }


  // ====================================
  // Variants
  // ====================================

  renderVariants(
    product
  );


  // ====================================
  // Quantity
  // ====================================

  setupQuantity();


  // ====================================
  // Add to cart
  // ====================================

  setupAddToCart();
}


// ========================================
// Render variants / sizes
// ========================================

function renderVariants(product) {

  if (!sizeOptions) {
    return;
  }


  sizeOptions.innerHTML =
    "";


  const variants =
    Array.isArray(product.variants)
      ? product.variants
      : [];


  // ====================================
  // No variants
  // ====================================

  if (!variants.length) {

    selectedVariant =
      null;

    sizeOptions.dataset.selectedVariantId =
      "";

    sizeOptions.dataset.selectedSize =
      "";


    if (productPrice) {

      productPrice.textContent =
        formatPrice(
          product.price
        );
    }


    updateVariantUI(
      null,
      product.stock
    );


    return;
  }


  // ====================================
  // One Size / single variant
  // ====================================

  if (variants.length === 1) {

    selectedVariant =
      variants[0];


    sizeOptions.dataset.selectedVariantId =
      String(
        selectedVariant.id
      );


    sizeOptions.dataset.selectedSize =
      selectedVariant.size ||
      "One Size";


    const label =
      document.createElement(
        "button"
      );


    label.type =
      "button";


    label.className =
      "size-btn selected";


    label.textContent =
      selectedVariant.size ||
      "One Size";


    label.disabled =
      Number(
        selectedVariant.stock
      ) <= 0;


    label.addEventListener(
      "click",
      () => {

        selectVariant(
          selectedVariant
        );
      }
    );


    sizeOptions.appendChild(
      label
    );


    updateVariantUI(
      selectedVariant
    );


    return;
  }


  // ====================================
  // Multiple variants
  // ====================================

  const availableVariants =
    variants.filter(
      variant =>
        Number(variant.stock) > 0
    );


  variants.forEach(
    variant => {

      const btn =
        document.createElement(
          "button"
        );


      btn.type =
        "button";


      btn.className =
        "size-btn";


      btn.textContent =
        variant.size ||
        "One Size";


      btn.dataset.variantId =
        String(
          variant.id
        );


      const stock =
        Number(
          variant.stock
        ) || 0;


      if (stock <= 0) {

        btn.disabled =
          true;

        btn.classList.add(
          "disabled"
        );
      }


      btn.addEventListener(
        "click",
        () => {

          if (stock <= 0) {
            return;
          }

          selectVariant(
            variant
          );
        }
      );


      sizeOptions.appendChild(
        btn
      );
    }
  );


  // ====================================
  // Select first available variant
  // ====================================

  const firstAvailable =
    availableVariants[0] ||
    variants[0];


  selectVariant(
    firstAvailable
  );
}


// ========================================
// Select variant
// ========================================

function selectVariant(
  variant
) {

  if (!variant) {
    return;
  }


  selectedVariant =
    variant;


  if (sizeOptions) {

    sizeOptions.dataset.selectedVariantId =
      String(
        variant.id
      );


    sizeOptions.dataset.selectedSize =
      variant.size ||
      "One Size";


    sizeOptions
      .querySelectorAll(
        ".size-btn"
      )
      .forEach(
        button => {

          button.classList.toggle(
            "selected",
            String(
              button.dataset.variantId
            ) ===
            String(
              variant.id
            )
          );
        }
      );
  }


  updateVariantUI(
    variant
  );
}


// ========================================
// Update UI based on selected variant
// ========================================

function updateVariantUI(
  variant,
  fallbackStock = 0
) {

  const price =
    variant?.price != null
      ? Number(
        variant.price
      )
      : Number(
        currentProduct?.price || 0
      );


  const stock =
    variant
      ? Math.max(
        0,
        Number(
          variant.stock
        ) || 0
      )
      : Math.max(
        0,
        Number(
          fallbackStock
        ) || 0
      );


  // ====================================
  // Price
  // ====================================

  if (productPrice) {

    productPrice.textContent =
      formatPrice(
        price
      );
  }


  // ====================================
  // Stock
  // ====================================

  if (productStock) {

    if (stock > 0) {

      productStock.textContent =
        `${stock} IN STOCK`;

    } else {

      productStock.textContent =
        "OUT OF STOCK";
    }
  }


  // ====================================
  // Quantity max
  // ====================================

  if (qtyInput) {

    qtyInput.max =
      String(
        Math.max(
          1,
          stock
        )
      );


    const currentQuantity =
      Number.parseInt(
        qtyInput.value,
        10
      ) || 1;


    qtyInput.value =
      String(
        Math.min(
          Math.max(
            1,
            currentQuantity
          ),
          Math.max(
            1,
            stock
          )
        )
      );
  }


  // ====================================
  // Add button
  // ====================================

  [qtyInput, qtyDecrease, qtyIncrease].forEach(control => {
    if (control) control.disabled = !currentProduct || stock <= 0;
  });

  if (addToCartBtn) {

    addToCartBtn.disabled =
      !currentProduct || stock <= 0;


    if (stock <= 0) {

      addToCartBtn.textContent =
        "OUT OF STOCK";

    } else {

      addToCartBtn.textContent =
        "ADD TO CART";
    }
  }
}


// ========================================
// Quantity controls
// ========================================

function setupQuantity() {

  if (
    !qtyInput ||
    !qtyDecrease ||
    !qtyIncrease
  ) {
    return;
  }


  qtyInput.type =
    "number";


  qtyInput.min =
    "1";


  qtyDecrease.type =
    "button";


  qtyIncrease.type =
    "button";


  function getCurrentStock() {

    if (selectedVariant) {

      return Math.max(
        0,
        Number(
          selectedVariant.stock
        ) || 0
      );
    }


    return Math.max(
      0,
      Number(
        currentProduct?.stock
      ) || 0
    );
  }


  function setQuantity(value) {

    const stock =
      getCurrentStock();


    if (stock <= 0) {

      qtyInput.value =
        "1";

      return;
    }


    const next =
      Number.parseInt(
        value,
        10
      );


    const quantity =
      Number.isFinite(next)
        ? Math.min(
          stock,
          Math.max(
            1,
            next
          )
        )
        : 1;


    qtyInput.value =
      String(
        quantity
      );
  }


  qtyInput.value =
    "1";


  qtyDecrease.onclick =
    () => {

      setQuantity(
        Number(
          qtyInput.value
        ) - 1
      );
    };


  qtyIncrease.onclick =
    () => {

      setQuantity(
        Number(
          qtyInput.value
        ) + 1
      );
    };


  qtyInput.onchange =
    () => {

      setQuantity(
        qtyInput.value
      );
    };
}


// ========================================
// Add to cart
// ========================================

function setupAddToCart() {

  if (!addToCartBtn) {
    return;
  }


  addToCartBtn.onclick =
    () => {

      if (!currentProduct || !Number.isSafeInteger(productId) || addToCartBtn.disabled) {
        return;
      }


      // ==================================
      // Determine selected variant
      // ==================================

      let variant =
        selectedVariant;


      // For products with no variants
      if (
        !variant &&
        currentProduct.variants.length === 0
      ) {

        variant = {
          id: null,

          size:
            "One Size",

          stock:
            currentProduct.stock,

          price:
            currentProduct.price,

          sku:
            null
        };
      }


      if (!variant) {

        if (
          typeof showWarning ===
          "function"
        ) {

          showWarning(
            "Please select a size.",
            "⚠ Select Size"
          );
        }

        return;
      }


      const variantStock =
        Math.max(
          0,
          Number(
            variant.stock
          ) || 0
        );


      if (variantStock <= 0) {

        if (
          typeof showWarning ===
          "function"
        ) {

          showWarning(
            "This variant is out of stock.",
            "⚠ Out of Stock"
          );
        }

        return;
      }


      // ==================================
      // Quantity
      // ==================================

      const quantity =
        Math.min(
          variantStock,
          Math.max(
            1,
            Number.parseInt(
              qtyInput?.value,
              10
            ) || 1
          )
        );


      // ==================================
      // Existing cart quantity
      // ==================================

      const cart =
        readCart();


      const currentQuantity =
        getCartQuantity(
          cart,
          currentProduct.id,
          variant.id
        );


      if (
        currentQuantity +
        quantity >
        variantStock
      ) {

        if (
          typeof showWarning ===
          "function"
        ) {

          showWarning(
            "You cannot add more than the available stock for this size.",
            "⚠ Stock Limit"
          );
        }

        return;
      }


      // ==================================
      // Selected size
      // ==================================

      const selectedSize =
        variant.size ||
        "One Size";


      // ==================================
      // Find existing cart item
      // ==================================

      const existingItem =
        cart.find(
          item => {

            const sameProduct =
              String(
                item.productId
              ) ===
              String(
                currentProduct.id
              );


            const sameVariant =
              String(
                item.variantId ?? ""
              ) ===
              String(
                variant.id ?? ""
              );


            return (
              sameProduct &&
              sameVariant
            );
          }
        );


      // ==================================
      // Price
      // ==================================

      const variantPrice =
        variant.price != null
          ? Number(
            variant.price
          )
          : Number(
            currentProduct.price
          );


      // ==================================
      // Update existing item
      // ==================================

      if (existingItem) {

        existingItem.quantity +=
          quantity;

        existingItem.name =
          currentProduct.name;

        existingItem.size =
          selectedSize;

        existingItem.variantId =
          variant.id;

        existingItem.sku =
          variant.sku ||
          null;

        existingItem.price =
          variantPrice;

        existingItem.image =
          currentProduct.image ||
          "";
      }

      // ==================================
      // Create new cart item
      // ==================================

      else {

        cart.push({

          productId:
            currentProduct.id,

          variantId:
            variant.id,

          name:
            currentProduct.name,

          size:
            selectedSize,

          sku:
            variant.sku ||
            null,

          quantity,

          price:
            variantPrice,

          image:
            currentProduct.image ||
            ""
        });
      }


      // ==================================
      // Save
      // ==================================

      saveCart(
        cart
      );


      // ==================================
      // Success message
      // ==================================

      if (
        typeof showSuccess ===
        "function"
      ) {

        showSuccess(
          `${quantity} × ${currentProduct.name} (${selectedSize}) added to cart.`,
          "✓ Added to Cart"
        );
      }


      // ==================================
      // Button feedback
      // ==================================

      const originalText =
        addToCartBtn.textContent;


      addToCartBtn.textContent =
        "✓ ADDED TO CART";


      addToCartBtn.disabled =
        true;


      window.setTimeout(
        () => {
          if (!currentProduct || currentProduct.id !== productId) return;

          addToCartBtn.textContent =
            originalText;


          const latestCart =
            readCart();


          const latestQuantity =
            getCartQuantity(
              latestCart,
              currentProduct.id,
              variant.id
            );


          addToCartBtn.disabled =
            latestQuantity >=
            variantStock;

        },
        1500
      );


      // ==================================
      // Update cart count
      // ==================================

      updateCartCount();
    };
}


// ========================================
// Related products
// ========================================

async function loadRelatedProducts(
  product
) {

  if (!relatedProductsGrid) {
    return;
  }


  // No category
  if (!product.categoryId) {

    renderRelatedProducts([]);

    return;
  }


  const {
    data,
    error
  } = await supabase
    .from("products")
    .select(`
      id,
      name,
      slug,
      price,
      type,
      category_id,

      categories (
        id,
        name,
        slug
      ),

      product_variants (
        id,
        stock,
        price
      ),

      product_images (
        id,
        storage_path,
        alt_text,
        is_primary,
        sort_order
      )
    `)
    .eq(
      "is_active",
      true
    )
    .eq(
      "category_id",
      product.categoryId
    )
    .neq(
      "id",
      product.id
    )
    .order(
      "created_at",
      {
        ascending: false
      }
    )
    .limit(4);


  if (error) {

    console.error(
      "Error loading related products:",
      error
    );

    return;
  }


  const relatedProducts =
    (data || []).map(
      item => {

        const variants =
          Array.isArray(
            item.product_variants
          )
            ? item.product_variants
            : [];


        const images =
          Array.isArray(
            item.product_images
          )
            ? item.product_images
            : [];


        images.sort(
          (a, b) =>
            (a.sort_order || 0) -
            (b.sort_order || 0)
        );


        const primaryImage =
          images.find(
            image =>
              image.is_primary
          ) ||
          images[0] ||
          null;


        const stock =
          variants.reduce(
            (total, variant) =>
              total +
              Math.max(
                0,
                Number(
                  variant.stock
                ) || 0
              ),
            0
          );


        const price =
          variants[0]?.price != null
            ? Number(
              variants[0].price
            )
            : Number(
              item.price || 0
            );


        return {

          id:
            item.id,

          slug:
            item.slug,

          name:
            item.name,

          type:
            item.type ||
            "",

          category:
            item.categories?.slug ||
            "",

          price,

          stock,

          image:
            publicImageUrl(primaryImage?.storage_path),

          imageAlt:
            primaryImage?.alt_text ||
            item.name
        };
      }
    );


  renderRelatedProducts(
    relatedProducts
  );
}


// ========================================
// Render related products
// ========================================

function renderRelatedProducts(
  relatedProducts
) {

  if (!relatedProductsGrid) {
    return;
  }


  relatedProductsGrid.innerHTML =
    "";


  if (
    relatedProducts.length ===
    0
  ) {

    const empty =
      document.createElement(
        "p"
      );


    empty.textContent =
      "No related products";


    empty.style.cssText =
      "grid-column:1/-1;text-align:center;color:rgba(255,255,255,0.5);";


    relatedProductsGrid.appendChild(
      empty
    );


    return;
  }


  relatedProducts.forEach(
    relProduct => {

      const card =
        document.createElement(
          "a"
        );


      card.className =
        "related-product-card";


      card.href =
        productPath(relProduct);


      card.setAttribute(
        "aria-label",
        `View ${relProduct.name || "product"} details`
      );


      // ==================================
      // Image
      // ==================================

      const imageWrap =
        document.createElement(
          "div"
        );


      imageWrap.className =
        "related-image";


      if (
        relProduct.image
      ) {

        const image =
          document.createElement(
            "img"
          );


        image.src =
          relProduct.image;


        image.alt =
          relProduct.imageAlt;


        image.loading =
          "lazy";


        image.decoding =
          "async";


        image.addEventListener(
          "error",
          () => {

            image.removeAttribute(
              "src"
            );

          },
          {
            once: true
          }
        );


        imageWrap.appendChild(
          image
        );
      }


      // ==================================
      // Info
      // ==================================

      const info =
        document.createElement(
          "div"
        );


      info.className =
        "related-info";


      const name =
        document.createElement(
          "h3"
        );


      name.className =
        "related-name";


      name.textContent =
        relProduct.name;


      const price =
        document.createElement(
          "p"
        );


      price.className =
        "related-price";


      price.textContent =
        formatPrice(
          relProduct.price
        );


      info.append(
        name,
        price
      );


      card.append(
        imageWrap,
        info
      );


      relatedProductsGrid.appendChild(
        card
      );
    }
  );
}


// ========================================
// Start
// ========================================

updateCartCount();

loadProduct();
