import { supabase } from "./js/supabase.js";


// ========================================
// Get product ID from URL
// ========================================

const urlParams =
  new URLSearchParams(window.location.search);

const productId =
  Number.parseInt(
    urlParams.get("id"),
    10
  );


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

  if (
    !Number.isInteger(productId)
  ) {

    window.location.replace(
      "/shop"
    );

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
    .eq("id", productId)
    .eq("is_active", true)
    .maybeSingle();


  if (error) {

    console.error(
      "Error loading product:",
      error
    );

    showError(
      "Failed to load product.",
      "Product Error"
    );

    return;
  }


  if (!data) {

    window.location.replace(
      "/shop"
    );

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
      primaryImage?.storage_path ||
      "",

    imageAlt:
      primaryImage?.alt_text ||
      data.name
  };


  currentProduct =
    product;


  console.log(
    "PRODUCT FROM SUPABASE:",
    product
  );


  renderProduct(
    product
  );


  await loadRelatedProducts(
    product
  );


  updateCartCount();
}


// ========================================
// Render product
// ========================================

function renderProduct(product) {

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

  if (addToCartBtn) {

    addToCartBtn.disabled =
      stock <= 0;


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

      if (!currentProduct) {
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
            primaryImage?.storage_path ||
            "",

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
          "article"
        );


      card.className =
        "related-product-card";


      card.tabIndex =
        0;


      card.setAttribute(
        "role",
        "link"
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


      // ==================================
      // Open product
      // ==================================

      const openDetail =
        () => {

          window.location.href =
            `/product?id=${encodeURIComponent(
              relProduct.id
            )}`;
        };


      card.addEventListener(
        "click",
        openDetail
      );


      card.addEventListener(
        "keydown",
        event => {

          if (
            event.key ===
            "Enter" ||
            event.key ===
            " "
          ) {

            event.preventDefault();

            openDetail();
          }
        }
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
