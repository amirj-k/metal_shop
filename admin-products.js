import { supabase } from "./js/supabase.js";

/* =========================================================
   STATE
   ========================================================= */

let currentUser = null;
let bands = [];
let categories = [];
let products = [];

let editingProductId = null;
let editingImagePath = null;

let productSection = null;
let productList = null;
let productEmpty = null;
let productSearch = null;

let productFormModal = null;
let productForm = null;
let productFormTitle = null;
let productSubmitButton = null;

let productFileInput = null;
let productImagePreview = null;
let productImagePreviewText = null;

let productCategorySelect = null;
let productBandSelect = null;
let productActiveInput = null;

let variantsContainer = null;

const STATUS_ACTIVE = true;
const PRODUCT_BUCKET = "product_image";

/* =========================================================
   HELPERS
   ========================================================= */

async function loadBands() {
  const { data, error } = await supabase
    .from("bands")
    .select("id, name, slug")
    .order("name", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  bands = data || [];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPrice(value) {
  const price = Number(value) || 0;

  return `${new Intl.NumberFormat("fa-IR").format(
    Math.round(price)
  )} تومان`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("fa-IR").format(
    Number(value) || 0
  );
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getPublicImageUrl(storagePath) {
  if (!storagePath) {
    return "";
  }

  const raw = String(storagePath).trim();

  if (!raw) {
    return "";
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  let path = raw.replace(/^\/+/, "");

  if (path.startsWith("product-images/")) {
    path = path.slice("product-images/".length);
  }

  if (path.startsWith("product_image/")) {
    path = path.slice("product_image/".length);
  }

  const { data } = supabase.storage
    .from(PRODUCT_BUCKET)
    .getPublicUrl(path);

  return data?.publicUrl || "";
}

function renderBandOptions(selectedBandId = "") {
  if (!productBandSelect) {
    return;
  }

  productBandSelect.innerHTML = "";

  const noBandOption =
    document.createElement("option");

  noBandOption.value = "";
  noBandOption.textContent = "NO BAND";

  productBandSelect.appendChild(
    noBandOption
  );

  bands.forEach((band) => {
    const option =
      document.createElement("option");

    option.value = String(band.id);
    option.textContent =
      band.name ||
      band.slug ||
      `Band ${band.id}`;

    if (
      String(band.id) ===
      String(selectedBandId ?? "")
    ) {
      option.selected = true;
    }

    productBandSelect.appendChild(
      option
    );
  });

  if (
    selectedBandId === null ||
    selectedBandId === undefined ||
    selectedBandId === ""
  ) {
    productBandSelect.value = "";
  }
}

function getProductStock(product) {
  const variants =
    Array.isArray(
      product?.product_variants
    )
      ? product.product_variants
      : [];

  return variants.reduce(
    (total, variant) => {
      return (
        total +
        Number(variant.stock || 0)
      );
    },
    0
  );
}

function getProductPrice(product) {
  const variants =
    Array.isArray(
      product?.product_variants
    )
      ? product.product_variants
      : [];

  const firstVariant =
    variants[0];

  return Number(
    firstVariant?.price ??
    product?.price ??
    0
  );
}

function showProductMessage(
  message,
  type = "success"
) {
  if (
    type === "error" &&
    typeof window.showError ===
      "function"
  ) {
    window.showError(
      message,
      "Product Error"
    );

    return;
  }

  if (
    type === "success" &&
    typeof window.showSuccess ===
      "function"
  ) {
    window.showSuccess(
      message,
      "✓ Product"
    );

    return;
  }

  console[
    type === "error"
      ? "error"
      : "log"
  ](message);
}

/* =========================================================
   ADMIN ACCESS
   ========================================================= */

async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error(
      "Product admin auth check failed:",
      error
    );

    return null;
  }

  return user || null;
}

async function isCurrentUserAdmin() {
  if (!currentUser) {
    return false;
  }

  const {
    data,
    error,
  } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error(
      "Product admin role check failed:",
      error
    );

    return false;
  }

  return data?.role === "admin";
}

/* =========================================================
   LOAD DATA
   ========================================================= */

async function loadCategories() {
  const {
    data,
    error,
  } = await supabase
    .from("categories")
    .select("id, name, slug")
    .order("name", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  categories = data || [];
}

async function loadProducts() {
  const {
    data,
    error,
  } = await supabase
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
      band_id,
      created_at,
      updated_at,

      categories (
        id,
        name,
        slug
      ),

      bands (
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
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    throw error;
  }

  products =
    (data || []).map(
      (product) => ({
        ...product,

        product_variants:
          Array.isArray(
            product.product_variants
          )
            ? product.product_variants
            : [],

        product_images:
          (
            Array.isArray(
              product.product_images
            )
              ? product.product_images
              : []
          ).sort((a, b) => {
            if (
              Boolean(b.is_primary) !==
              Boolean(a.is_primary)
            ) {
              return (
                Number(
                  Boolean(b.is_primary)
                ) -
                Number(
                  Boolean(a.is_primary)
                )
              );
            }

            return (
              (Number(a.sort_order) || 0) -
              (Number(b.sort_order) || 0)
            );
          }),
      })
    );
}

/* =========================================================
   UI CREATION
   ========================================================= */

function buildProductSection() {
  if (
    !document.getElementById(
      "adminContent"
    )
  ) {
    return;
  }

  const host =
    document.getElementById(
      "adminContent"
    );

  if (
    document.getElementById(
      "adminProductsSection"
    )
  ) {
    return;
  }

  const wrapper =
    document.createElement(
      "section"
    );

  wrapper.id =
    "adminProductsSection";

  wrapper.className =
    "admin-card admin-products-section";

  wrapper.innerHTML = `
    <div class="admin-card-header">

      <div class="admin-section-number">
        02
      </div>

      <div>
        <h2>
          PRODUCT MANAGEMENT
        </h2>

        <p>
          MANAGE CATALOG, STOCK AND IMAGES
        </p>
      </div>

      <div class="admin-products-actions">

        <input
          id="adminProductSearch"
          class="admin-products-search"
          type="search"
          placeholder="SEARCH PRODUCTS..."
          autocomplete="off"
        >

        <button
          id="adminAddProductBtn"
          class="admin-product-add-button"
          type="button"
        >
          + ADD PRODUCT
        </button>

      </div>

    </div>

    <div
      id="adminProductsGrid"
      class="admin-products-grid"
    ></div>

    <div
      id="adminProductsEmpty"
      class="admin-products-empty"
      hidden
    >
      NO PRODUCTS FOUND
    </div>
  `;

  host.appendChild(wrapper);

  productSection =
    wrapper;

  productList =
    wrapper.querySelector(
      "#adminProductsGrid"
    );

  productEmpty =
    wrapper.querySelector(
      "#adminProductsEmpty"
    );

  productSearch =
    wrapper.querySelector(
      "#adminProductSearch"
    );

  wrapper
    .querySelector(
      "#adminAddProductBtn"
    )
    .addEventListener(
      "click",
      () => openProductEditor()
    );

  productSearch.addEventListener(
    "input",
    renderProducts
  );

  buildEditorModal();
}

/* =========================================================
   PRODUCT EDITOR MODAL
   ========================================================= */

function buildEditorModal() {
  if (
    document.getElementById(
      "adminProductEditor"
    )
  ) {
    return;
  }

  const modal =
    document.createElement(
      "div"
    );

  modal.id =
    "adminProductEditor";

  modal.className =
    "admin-product-editor";

  modal.hidden = true;

  modal.innerHTML = `
    <div
      class="admin-product-editor-backdrop"
      data-close-product-editor
    ></div>

    <div class="admin-product-editor-box">

      <button
        type="button"
        class="admin-product-editor-close"
        id="adminProductEditorClose"
        aria-label="Close"
      >
        ×
      </button>

      <div class="admin-product-editor-header">

        <div class="admin-product-editor-kicker">
          PRODUCT MANAGEMENT
        </div>

        <h2 id="adminProductFormTitle">
          ADD PRODUCT
        </h2>

      </div>

      <form
        id="adminProductForm"
        class="admin-product-form"
      >

        <!-- PRODUCT NAME -->

        <div class="admin-product-form-field">

          <label
            for="adminProductName"
          >
            PRODUCT NAME
          </label>

          <input
            id="adminProductName"
            name="name"
            required
            maxlength="160"
          >

        </div>

        <!-- SLUG -->

        <div class="admin-product-form-field">

          <label
            for="adminProductSlug"
          >
            SLUG
          </label>

          <input
            id="adminProductSlug"
            name="slug"
            maxlength="180"
          >

        </div>

        <!-- DESCRIPTION -->

        <div class="admin-product-form-field full">

          <label
            for="adminProductDescription"
          >
            DESCRIPTION
          </label>

          <textarea
            id="adminProductDescription"
            name="description"
            maxlength="2000"
          ></textarea>

        </div>

        <!-- BASE PRICE -->

        <div class="admin-product-form-field">

          <label
            for="adminProductPrice"
          >
            BASE PRICE
          </label>

          <input
            id="adminProductPrice"
            name="price"
            type="number"
            min="0"
            step="1"
            required
          >

        </div>

        <!-- BAND -->

        <div class="admin-product-form-field">

          <label
            for="adminProductBand"
          >
            BAND
          </label>

          <select
            id="adminProductBand"
            name="band_id"
          >
            <option value="">
              NO BAND
            </option>
          </select>

        </div>

        <!-- CATEGORY -->

        <div class="admin-product-form-field">

          <label
            for="adminProductCategory"
          >
            CATEGORY
          </label>

          <select
            id="adminProductCategory"
            name="category_id"
          >
            <option value="">
              NO CATEGORY
            </option>
          </select>

        </div>

        <!-- TYPE -->

        <div class="admin-product-form-field">

          <label
            for="adminProductType"
          >
            TYPE
          </label>

          <input
            id="adminProductType"
            name="type"
            maxlength="80"
            placeholder="necklace / pendant / ring / t-shirt"
          >

        </div>

        <!-- MATERIAL -->

        <div class="admin-product-form-field">

          <label
            for="adminProductMaterial"
          >
            MATERIAL
          </label>

          <input
            id="adminProductMaterial"
            name="material"
            maxlength="120"
            placeholder="Stainless Steel"
          >

        </div>

        <!-- VARIANTS -->

        <div class="admin-product-form-field full">

          <div class="admin-product-variants-header">

            <div>

              <label>
                PRODUCT VARIANTS
              </label>

              <p>
                MANAGE SIZE, SKU, STOCK AND PRICE
              </p>

            </div>

            <button
              type="button"
              id="adminAddVariantBtn"
              class="admin-product-add-variant-button"
            >
              + ADD VARIANT
            </button>

          </div>

          <div
            id="adminProductVariants"
            class="admin-product-variants"
          ></div>

        </div>

        <!-- IMAGE PREVIEW -->

        <div
          class="admin-product-image-preview"
          id="adminProductImagePreview"
        >

          <span
            id="adminProductImagePreviewText"
          >
            NO IMAGE SELECTED
          </span>

        </div>

        <!-- IMAGE -->

        <div class="admin-product-form-field full">

          <label
            for="adminProductImage"
          >
            PRODUCT IMAGE
          </label>

          <input
            id="adminProductImage"
            name="image"
            type="file"
            accept="image/*"
          >

        </div>

        <!-- ACTIVE -->

        <div class="admin-product-form-switch">

          <span>
            PRODUCT ACTIVE / VISIBLE IN SHOP
          </span>

          <label class="admin-product-toggle">

            <input
              id="adminProductActive"
              name="is_active"
              type="checkbox"
              checked
            >

            <span
              class="admin-product-toggle-track"
            ></span>

          </label>

        </div>

        <!-- FOOTER -->

        <div class="admin-product-form-footer">

          <button
            id="adminProductCancelBtn"
            type="button"
            class="admin-product-form-cancel"
          >
            CANCEL
          </button>

          <button
            id="adminProductSubmitBtn"
            type="submit"
            class="admin-product-form-submit"
          >
            SAVE PRODUCT
          </button>

        </div>

      </form>

    </div>
  `;

  document.body.appendChild(
    modal
  );

  productFormModal =
    modal;

  productForm =
    modal.querySelector(
      "#adminProductForm"
    );

  productFormTitle =
    modal.querySelector(
      "#adminProductFormTitle"
    );

  productSubmitButton =
    modal.querySelector(
      "#adminProductSubmitBtn"
    );

  productFileInput =
    modal.querySelector(
      "#adminProductImage"
    );

  productImagePreview =
    modal.querySelector(
      "#adminProductImagePreview"
    );

  productImagePreviewText =
    modal.querySelector(
      "#adminProductImagePreviewText"
    );

  productCategorySelect =
    modal.querySelector(
      "#adminProductCategory"
    );

  productBandSelect =
    modal.querySelector(
      "#adminProductBand"
    );

  productActiveInput =
    modal.querySelector(
      "#adminProductActive"
    );

  variantsContainer =
    modal.querySelector(
      "#adminProductVariants"
    );

  modal
    .querySelector(
      "#adminProductEditorClose"
    )
    .addEventListener(
      "click",
      closeProductEditor
    );

  modal
    .querySelector(
      "#adminProductCancelBtn"
    )
    .addEventListener(
      "click",
      closeProductEditor
    );

  modal
    .querySelectorAll(
      "[data-close-product-editor]"
    )
    .forEach((element) => {
      element.addEventListener(
        "click",
        closeProductEditor
      );
    });

  modal
    .querySelector(
      "#adminAddVariantBtn"
    )
    .addEventListener(
      "click",
      () => addVariantRow()
    );

  productFileInput.addEventListener(
    "change",
    handleImagePreview
  );

  productForm.addEventListener(
    "submit",
    handleProductSubmit
  );

  modal.addEventListener(
    "click",
    (event) => {
      event.stopPropagation();
    }
  );

  renderBandOptions("");
}

/* =========================================================
   CATEGORY OPTIONS
   ========================================================= */

function renderCategoryOptions(
  selectedId = ""
) {
  if (!productCategorySelect) {
    return;
  }

  productCategorySelect.innerHTML = `
    <option value="">
      NO CATEGORY
    </option>
  `;

  categories.forEach((category) => {
    const option =
      document.createElement(
        "option"
      );

    option.value =
      String(category.id);

    option.textContent =
      category.name ||
      category.slug ||
      `Category ${category.id}`;

    if (
      String(category.id) ===
      String(selectedId ?? "")
    ) {
      option.selected = true;
    }

    productCategorySelect.appendChild(
      option
    );
  });

  if (
    selectedId === null ||
    selectedId === undefined ||
    selectedId === ""
  ) {
    productCategorySelect.value =
      "";
  }
}

/* =========================================================
   VARIANT MANAGEMENT
   ========================================================= */

function addVariantRow(
  variant = {}
) {
  if (!variantsContainer) {
    return;
  }

  const row =
    document.createElement(
      "div"
    );

  row.className =
    "admin-product-variant-row";

  row.dataset.variantId =
    variant.id
      ? String(variant.id)
      : "";

  row.innerHTML = `
    <div class="admin-product-variant-field">

      <label>
        SIZE
      </label>

      <input
        type="text"
        class="variant-size"
        maxlength="60"
        value="${escapeHtml(
          variant.size ||
            "One Size"
        )}"
        placeholder="S / M / L / XL"
      >

    </div>

    <div class="admin-product-variant-field">

      <label>
        SKU
      </label>

      <input
        type="text"
        class="variant-sku"
        maxlength="120"
        value="${escapeHtml(
          variant.sku || ""
        )}"
        placeholder="PRODUCT-S-001"
      >

    </div>

    <div class="admin-product-variant-field">

      <label>
        STOCK
      </label>

      <input
        type="number"
        class="variant-stock"
        min="0"
        step="1"
        value="${Number(
          variant.stock ?? 0
        )}"
      >

    </div>

    <div class="admin-product-variant-field">

      <label>
        PRICE
      </label>

      <input
        type="number"
        class="variant-price"
        min="0"
        step="1"
        value="${Number(
          variant.price ?? 0
        )}"
      >

    </div>

    <button
      type="button"
      class="admin-product-remove-variant"
      data-remove-variant
      title="Remove variant"
    >
      ×
    </button>
  `;

  const removeButton =
    row.querySelector(
      "[data-remove-variant]"
    );

  removeButton.addEventListener(
    "click",
    () => {
      const rows =
        variantsContainer.querySelectorAll(
          ".admin-product-variant-row"
        );

      if (rows.length <= 1) {
        showProductMessage(
          "A product must have at least one variant.",
          "error"
        );

        return;
      }

      row.remove();
    }
  );

  variantsContainer.appendChild(
    row
  );
}

function clearVariantRows() {
  if (!variantsContainer) {
    return;
  }

  variantsContainer.innerHTML = "";
}

function getVariantRows() {
  if (!variantsContainer) {
    return [];
  }

  return Array.from(
    variantsContainer.querySelectorAll(
      ".admin-product-variant-row"
    )
  );
}

function collectVariantsFromForm() {
  const rows =
    getVariantRows();

  return rows.map((row) => {
    const id =
      row.dataset.variantId
        ? Number(
            row.dataset.variantId
          )
        : null;

    const size =
      String(
        row.querySelector(
          ".variant-size"
        )?.value || ""
      ).trim();

    const sku =
      String(
        row.querySelector(
          ".variant-sku"
        )?.value || ""
      ).trim();

    const stock =
      Number(
        row.querySelector(
          ".variant-stock"
        )?.value
      );

    const price =
      Number(
        row.querySelector(
          ".variant-price"
        )?.value
      );

    return {
      id,
      size,
      sku,
      stock,
      price,
    };
  });
}

/* =========================================================
   PRODUCT RENDERING
   ========================================================= */

function getFilteredProducts() {
  const query =
    String(
      productSearch?.value ||
        ""
    )
      .trim()
      .toLowerCase();

  if (!query) {
    return products;
  }

  return products.filter(
    (product) => {
      const categoryName =
        product.categories
          ?.name || "";

      const bandName =
        product.bands?.name ||
        "";

      const variantValues =
        product.product_variants
          .flatMap((variant) => [
            variant.size,
            variant.sku,
          ])
          .filter(Boolean);

      return [
        product.name,
        product.slug,
        product.type,
        product.material,
        categoryName,
        bandName,
        ...variantValues,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(query)
        );
    }
  );
}

function renderProducts() {
  if (
    !productList ||
    !productEmpty
  ) {
    return;
  }

  const visible =
    getFilteredProducts();

  productList.innerHTML = "";

  productEmpty.hidden =
    visible.length !== 0;

  visible.forEach(
    (product) => {
      const card =
        document.createElement(
          "article"
        );

      card.className =
        "admin-product-card";

      const primaryImage =
        product.product_images?.[0];

      const imageUrl =
        getPublicImageUrl(
          primaryImage?.storage_path
        );

      const active =
        product.is_active === true;

      const stock =
        getProductStock(product);

      const price =
        getProductPrice(product);

      const categoryName =
        product.categories?.name ||
        "NO CATEGORY";

      const bandName =
        product.bands?.name ||
        "NO BAND";

      const variantCount =
        product.product_variants
          ?.length || 0;

      card.innerHTML = `
        <div class="admin-product-image">

          ${
            imageUrl
              ? `
                <img
                  src="${escapeHtml(
                    imageUrl
                  )}"
                  alt="${escapeHtml(
                    product.name
                  )}"
                  loading="lazy"
                >
              `
              : `
                <div class="admin-product-image-placeholder">
                  N
                </div>
              `
          }

          <span
            class="admin-product-active-badge ${
              active
                ? ""
                : "inactive"
            }"
          >
            ${
              active
                ? "ACTIVE"
                : "HIDDEN"
            }
          </span>

        </div>

        <div class="admin-product-body">

          <p class="admin-product-category">
            ${escapeHtml(
              categoryName
            )}
          </p>

          <p class="admin-product-category">
            ${escapeHtml(
              bandName
            )}
          </p>

          <h3 class="admin-product-name">
            ${escapeHtml(
              product.name
            )}
          </h3>

          <div class="admin-product-meta">

            <div>
              <span>
                PRICE
              </span>

              <strong>
                ${formatPrice(
                  price
                )}
              </strong>
            </div>

            <div>
              <span>
                STOCK
              </span>

              <strong>
                ${formatNumber(
                  stock
                )}
              </strong>
            </div>

          </div>

          <div class="admin-product-variant-count">
            ${formatNumber(
              variantCount
            )}

            ${
              variantCount === 1
                ? "VARIANT"
                : "VARIANTS"
            }
          </div>

          <div class="admin-product-actions">

            <button
              type="button"
              class="admin-product-edit-button"
              data-edit-product="${escapeHtml(
                product.id
              )}"
            >
              EDIT
            </button>

            <button
              type="button"
              class="admin-product-archive-button"
              data-archive-product="${escapeHtml(
                product.id
              )}"
            >
              ${
                active
                  ? "HIDE"
                  : "RESTORE"
              }
            </button>

          </div>

        </div>
      `;

      productList.appendChild(
        card
      );
    }
  );
}

/* =========================================================
   EDITOR
   ========================================================= */

function resetEditor() {
  editingProductId = null;
  editingImagePath = null;

  if (productForm) {
    productForm.reset();
  }

  if (
    productActiveInput
  ) {
    productActiveInput.checked =
      STATUS_ACTIVE;
  }

  renderCategoryOptions("");
  renderBandOptions("");

  clearVariantRows();

  addVariantRow({
    size: "One Size",
    sku: "",
    stock: 0,
    price: 0,
  });

  if (productImagePreview) {
    productImagePreview.innerHTML = `
      <span id="adminProductImagePreviewText">
        NO IMAGE SELECTED
      </span>
    `;

    productImagePreviewText =
      productImagePreview.querySelector(
        "#adminProductImagePreviewText"
      );
  }

  if (productSubmitButton) {
    productSubmitButton.textContent =
      "SAVE PRODUCT";
  }
}

function openProductEditor(
  productId = null
) {
  resetEditor();

  /* =====================================================
     ADD PRODUCT
     ===================================================== */

  if (productId === null) {
    productFormTitle.textContent =
      "ADD PRODUCT";

    renderBandOptions("");

    productFormModal.hidden =
      false;

    document.body.style.overflow =
      "hidden";

    return;
  }

  /* =====================================================
     EDIT PRODUCT
     ===================================================== */

  const product =
    products.find(
      (item) =>
        Number(item.id) ===
        Number(productId)
    );

  if (!product) {
    showProductMessage(
      "Product not found.",
      "error"
    );

    return;
  }

  const image =
    product.product_images?.[0] ||
    null;

  editingProductId =
    product.id;

  editingImagePath =
    image?.storage_path ??
    null;

  productFormTitle.textContent =
    "EDIT PRODUCT";

  productForm.elements.name.value =
    product.name || "";

  productForm.elements.slug.value =
    product.slug || "";

  productForm.elements.description.value =
    product.description || "";

  productForm.elements.price.value =
    getProductPrice(product);

  productForm.elements.type.value =
    product.type || "";

  productForm.elements.material.value =
    product.material || "";

  if (productActiveInput) {
    productActiveInput.checked =
      product.is_active !== false;
  }

  renderCategoryOptions(
    product.category_id ??
      product.categories?.id ??
      ""
  );

  /*
    IMPORTANT:
    Load the saved band when editing.
  */
  renderBandOptions(
    product.band_id ??
      product.bands?.id ??
      ""
  );

  /* =====================================================
     VARIANTS
     ===================================================== */

  clearVariantRows();

  const variants =
    Array.isArray(
      product.product_variants
    )
      ? product.product_variants
      : [];

  if (
    variants.length ===
    0
  ) {
    addVariantRow({
      size: "One Size",
      sku: "",
      stock: 0,
      price:
        getProductPrice(
          product
        ),
    });
  } else {
    variants.forEach(
      (variant) => {
        addVariantRow(
          variant
        );
      }
    );
  }

  /* =====================================================
     IMAGE
     ===================================================== */

  const imageUrl =
    getPublicImageUrl(
      image?.storage_path
    );

  if (imageUrl) {
    showImagePreview(
      imageUrl
    );
  }

  productFormModal.hidden =
    false;

  document.body.style.overflow =
    "hidden";
}

function closeProductEditor() {
  if (!productFormModal) {
    return;
  }

  productFormModal.hidden =
    true;

  document.body.style.overflow =
    "";
}

function showImagePreview(
  src
) {
  if (!productImagePreview) {
    return;
  }

  productImagePreview.innerHTML =
    "";

  const img =
    document.createElement(
      "img"
    );

  img.src = src;
  img.alt =
    "Product preview";

  productImagePreview.appendChild(
    img
  );
}

function handleImagePreview() {
  const file =
    productFileInput
      ?.files?.[0];

  if (!file) {
    return;
  }

  const url =
    URL.createObjectURL(
      file
    );

  showImagePreview(
    url
  );
}

/* =========================================================
   IMAGE UPLOAD
   ========================================================= */

function getFileExtension(
  file
) {
  const name =
    String(
      file?.name || ""
    );

  const dot =
    name.lastIndexOf(
      "."
    );

  return dot >= 0
    ? name
        .slice(dot + 1)
        .toLowerCase()
    : "jpg";
}

async function uploadProductImage(
  slug,
  file
) {
  const extension =
    getFileExtension(
      file
    );

  const safeSlug =
    slugify(slug) ||
    `product-${Date.now()}`;

  const storagePath =
    `${safeSlug}/main-${Date.now()}.${extension}`;

  const {
    error: uploadError,
  } = await supabase.storage
    .from(PRODUCT_BUCKET)
    .upload(
      storagePath,
      file,
      {
        cacheControl:
          "3600",
        upsert: false,
        contentType:
          file.type ||
          undefined,
      }
    );

  if (uploadError) {
    throw uploadError;
  }

  const publicUrl =
    getPublicImageUrl(
      storagePath
    );

  return {
    storagePath,
    publicUrl,
  };
}

async function saveImageRecord(
  productId,
  storagePath,
  altText
) {
  const {
    data: existingPrimary,
    error: findError,
  } = await supabase
    .from("product_images")
    .select(
      "id, storage_path, is_primary, sort_order"
    )
    .eq(
      "product_id",
      productId
    )
    .order(
      "is_primary",
      {
        ascending:
          false,
      }
    )
    .order(
      "sort_order",
      {
        ascending:
          true,
      }
    )
    .limit(1)
    .maybeSingle();

  if (findError) {
    throw findError;
  }

  if (
    existingPrimary?.id
  ) {
    const {
      error,
    } = await supabase
      .from("product_images")
      .update({
        storage_path:
          storagePath,
        alt_text:
          altText || null,
        is_primary:
          true,
        sort_order:
          0,
      })
      .eq(
        "id",
        existingPrimary.id
      );

    if (error) {
      throw error;
    }

    return (
      existingPrimary.storage_path ||
      null
    );
  }

  const {
    error,
  } = await supabase
    .from("product_images")
    .insert({
      product_id:
        productId,
      storage_path:
        storagePath,
      alt_text:
        altText || null,
      is_primary:
        true,
      sort_order:
        0,
    });

  if (error) {
    throw error;
  }

  return null;
}

async function removeStorageFile(
  storagePath
) {
  if (!storagePath) {
    return;
  }

  let path =
    String(
      storagePath
    )
      .trim()
      .replace(/^\/+/, "");

  if (
    /^https?:\/\//i.test(
      path
    )
  ) {
    const marker =
      `/storage/v1/object/public/${PRODUCT_BUCKET}/`;

    const index =
      path.indexOf(
        marker
      );

    if (index >= 0) {
      path =
        path.slice(
          index +
            marker.length
        );
    } else {
      return;
    }
  }

  path =
    path.replace(
      /^product-images\//i,
      ""
    );

  path =
    path.replace(
      /^product_image\//i,
      ""
    );

  const {
    error,
  } = await supabase.storage
    .from(PRODUCT_BUCKET)
    .remove([path]);

  if (error) {
    console.warn(
      "Old product image could not be removed:",
      error
    );
  }
}

/* =========================================================
   SAVE VARIANTS
   ========================================================= */

async function saveProductVariants(
  productId,
  variants
) {
  const {
    data: existingVariants,
    error: existingError,
  } = await supabase
    .from("product_variants")
    .select(
      "id, size, sku, stock, price"
    )
    .eq(
      "product_id",
      productId
    );

  if (existingError) {
    throw existingError;
  }

  const existing =
    existingVariants || [];

  const keptIds =
    new Set();

  for (
    const variant of variants
  ) {
    const payload = {
      product_id:
        productId,
      size:
        variant.size,
      sku:
        variant.sku ||
        null,
      stock:
        variant.stock,
      price:
        variant.price,
    };

    if (
      variant.id !== null &&
      Number.isInteger(
        Number(
          variant.id
        )
      )
    ) {
      const variantId =
        Number(
          variant.id
        );

      const {
        error,
      } = await supabase
        .from(
          "product_variants"
        )
        .update({
          size:
            payload.size,
          sku:
            payload.sku,
          stock:
            payload.stock,
          price:
            payload.price,
        })
        .eq(
          "id",
          variantId
        )
        .eq(
          "product_id",
          productId
        );

      if (error) {
        throw error;
      }

      keptIds.add(
        variantId
      );
    } else {
      const {
        data,
        error,
      } = await supabase
        .from(
          "product_variants"
        )
        .insert(
          payload
        )
        .select(
          "id"
        )
        .single();

      if (error) {
        throw error;
      }

      if (data?.id) {
        keptIds.add(
          Number(
            data.id
          )
        );
      }
    }
  }

  const idsToDelete =
    existing
      .map(
        (variant) =>
          Number(
            variant.id
          )
      )
      .filter(
        (id) =>
          !keptIds.has(
            id
          )
      );

  if (
    idsToDelete.length >
    0
  ) {
    const {
      error,
    } = await supabase
      .from(
        "product_variants"
      )
      .delete()
      .eq(
        "product_id",
        productId
      )
      .in(
        "id",
        idsToDelete
      );

    if (error) {
      throw error;
    }
  }
}

/* =========================================================
   SAVE PRODUCT
   ========================================================= */

async function handleProductSubmit(
  event
) {
  event.preventDefault();

  const formData =
    new FormData(
      productForm
    );

  const name =
    String(
      formData.get(
        "name"
      ) || ""
    ).trim();

  const slugInput =
    String(
      formData.get(
        "slug"
      ) || ""
    ).trim();

  const slug =
    slugify(
      slugInput ||
        name
    );

  const description =
    String(
      formData.get(
        "description"
      ) || ""
    ).trim();

  const type =
    String(
      formData.get(
        "type"
      ) || ""
    ).trim();

  const material =
    String(
      formData.get(
        "material"
      ) || ""
    ).trim();

  const categoryValue =
    String(
      formData.get(
        "category_id"
      ) || ""
    ).trim();

  const bandValue =
    String(
      formData.get(
        "band_id"
      ) || ""
    ).trim();

  const basePrice =
    Number(
      formData.get(
        "price"
      )
    );

  const isActive =
    productActiveInput?.checked ??
    true;

  const imageFile =
    productFileInput?.files?.[0] ||
    null;

  const variants =
    collectVariantsFromForm();

  /* =====================================================
     VALIDATION
     ===================================================== */

  if (!name) {
    showProductMessage(
      "Product name is required.",
      "error"
    );

    return;
  }

  if (!slug) {
    showProductMessage(
      "A valid English slug is required.",
      "error"
    );

    return;
  }

  if (
    !Number.isFinite(
      basePrice
    ) ||
    basePrice < 0
  ) {
    showProductMessage(
      "Enter a valid base price.",
      "error"
    );

    return;
  }

  if (
    variants.length ===
    0
  ) {
    showProductMessage(
      "Add at least one product variant.",
      "error"
    );

    return;
  }

  for (
    let index = 0;
    index <
    variants.length;
    index++
  ) {
    const variant =
      variants[index];

    if (!variant.size) {
      showProductMessage(
        `Variant ${index + 1}: size is required.`,
        "error"
      );

      return;
    }

    if (
      !Number.isInteger(
        variant.stock
      ) ||
      variant.stock <
        0
    ) {
      showProductMessage(
        `Variant ${index + 1}: enter a valid stock value.`,
        "error"
      );

      return;
    }

    if (
      !Number.isFinite(
        variant.price
      ) ||
      variant.price <
        0
    ) {
      showProductMessage(
        `Variant ${index + 1}: enter a valid price.`,
        "error"
      );

      return;
    }
  }

  const normalizedSizes =
    variants.map(
      (variant) =>
        variant.size
          .trim()
          .toLowerCase()
    );

  const hasDuplicateSizes =
    new Set(
      normalizedSizes
    ).size !==
    normalizedSizes.length;

  if (
    hasDuplicateSizes
  ) {
    showProductMessage(
      "Each variant must have a unique size.",
      "error"
    );

    return;
  }

  if (
    productSubmitButton
  ) {
    productSubmitButton.disabled =
      true;

    productSubmitButton.textContent =
      "SAVING...";
  }

  const wasEditing =
    editingProductId !==
    null;

  try {
    const categoryId =
      categoryValue
        ? Number(
            categoryValue
          )
        : null;

    const bandId =
      bandValue
        ? Number(
            bandValue
          )
        : null;

    /*
      Use the first variant price
      as the product base price.
    */
    const firstVariantPrice =
      Number(
        variants[0]?.price
      );

    const productPrice =
      Number.isFinite(
        firstVariantPrice
      )
        ? firstVariantPrice
        : basePrice;

    const productPayload = {
      name,
      slug,

      description:
        description ||
        null,

      type:
        type ||
        null,

      price:
        productPrice,

      material:
        material ||
        null,

      category_id:
        Number.isInteger(
          categoryId
        )
          ? categoryId
          : null,

      /*
        IMPORTANT:
        Save the selected band ID.
      */
      band_id:
        Number.isInteger(
          bandId
        )
          ? bandId
          : null,

      is_active:
        isActive,

      updated_at:
        new Date().toISOString(),
    };

    let productId =
      editingProductId;

    /* =====================================================
       DEBUG
       ===================================================== */

    console.log(
      "Saving product:",
      {
        productId,
        bandId,
        bandName:
          bands.find(
            (band) =>
              Number(
                band.id
              ) ===
              Number(
                bandId
              )
          )?.name ||
          "NO BAND",
        productPayload,
      }
    );

    /* =====================================================
       CREATE PRODUCT
       ===================================================== */

    if (
      productId ===
      null
    ) {
      const {
        data,
        error,
      } = await supabase
        .from("products")
        .insert(
          productPayload
        )
        .select(
          "id"
        )
        .single();

      if (error) {
        throw error;
      }

      productId =
        data.id;
    }

    /* =====================================================
       UPDATE PRODUCT
       ===================================================== */

    else {
      const {
        error,
      } = await supabase
        .from("products")
        .update(
          productPayload
        )
        .eq(
          "id",
          productId
        );

      if (error) {
        throw error;
      }
    }

    /* =====================================================
       SAVE VARIANTS
       ===================================================== */

    await saveProductVariants(
      productId,
      variants
    );

    /* =====================================================
       IMAGE
       ===================================================== */

    if (imageFile) {
      const uploaded =
        await uploadProductImage(
          slug,
          imageFile
        );

      const oldPath =
        await saveImageRecord(
          productId,
          uploaded.storagePath,
          name
        );

      if (
        oldPath &&
        oldPath !==
          uploaded.storagePath
      ) {
        await removeStorageFile(
          oldPath
        );
      }
    }

    /* =====================================================
       REFRESH DATA
       ===================================================== */

    await loadProducts();

    renderProducts();

    closeProductEditor();

    showProductMessage(
      wasEditing
        ? "Product updated successfully."
        : "Product created successfully.",
      "success"
    );
  } catch (error) {
    console.error(
      "Product save failed:",
      error
    );

    showProductMessage(
      error?.message ||
        "Product could not be saved.",
      "error"
    );
  } finally {
    if (
      productSubmitButton
    ) {
      productSubmitButton.disabled =
        false;

      productSubmitButton.textContent =
        wasEditing
          ? "SAVE CHANGES"
          : "SAVE PRODUCT";
    }
  }
}

/* =========================================================
   ARCHIVE / RESTORE
   ========================================================= */

async function toggleProductActive(
  productId
) {
  const product =
    products.find(
      (item) =>
        Number(item.id) ===
        Number(productId)
    );

  if (!product) {
    return;
  }

  const nextActive =
    product.is_active !==
    true;

  const actionText =
    nextActive
      ? "restore"
      : "hide";

  const confirmed =
    window.confirm(
      nextActive
        ? `Restore ${product.name} to the shop?`
        : `Hide ${product.name} from the shop?`
    );

  if (!confirmed) {
    return;
  }

  try {
    const {
      error,
    } = await supabase
      .from("products")
      .update({
        is_active:
          nextActive,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        product.id
      );

    if (error) {
      throw error;
    }

    product.is_active =
      nextActive;

    renderProducts();

    showProductMessage(
      nextActive
        ? "Product restored to the shop."
        : "Product hidden from the shop.",
      "success"
    );
  } catch (error) {
    console.error(
      `Product ${actionText} failed:`,
      error
    );

    showProductMessage(
      error?.message ||
        `Could not ${actionText} product.`,
      "error"
    );
  }
}

/* =========================================================
   EVENTS
   ========================================================= */

function setupProductEvents() {
  if (!productList) {
    return;
  }

  productList.addEventListener(
    "click",
    (event) => {
      const editButton =
        event.target.closest(
          "[data-edit-product]"
        );

      if (editButton) {
        openProductEditor(
          editButton.dataset
            .editProduct
        );

        return;
      }

      const archiveButton =
        event.target.closest(
          "[data-archive-product]"
        );

      if (archiveButton) {
        toggleProductActive(
          archiveButton.dataset
            .archiveProduct
        );
      }
    }
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key ===
          "Escape" &&
        productFormModal &&
        !productFormModal.hidden
      ) {
        closeProductEditor();
      }
    }
  );
}

/* =========================================================
   INIT
   ========================================================= */

async function initProductManagement() {
  try {
    currentUser =
      await getCurrentUser();

    if (!currentUser) {
      return;
    }

    const admin =
      await isCurrentUserAdmin();

    if (!admin) {
      return;
    }

    buildProductSection();

    /*
      Load all required data first.
    */
    await Promise.all([
      loadCategories(),
      loadBands(),
      loadProducts(),
    ]);

    /*
      Populate selects AFTER data has loaded.
    */
    renderCategoryOptions("");

    renderBandOptions("");

    renderProducts();

    setupProductEvents();

  } catch (error) {
    console.error(
      "Product management initialization failed:",
      error
    );
  }
}

/* =========================================================
   START
   ========================================================= */

initProductManagement();