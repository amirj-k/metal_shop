import { supabase } from "./js/supabase.js";

let products = [];
let appliedPromo = null;
let currentUser = null;
let currentUserCart = null;
let currentDbCartItems = [];


/* =========================================================
   PRICE
========================================================= */

function formatPrice(value) {
  const price = Number(value) || 0;

  return `${new Intl.NumberFormat("fa-IR").format(
    Math.round(price)
  )} تومان`;
}


/* =========================================================
   IMAGE
========================================================= */

function getProductImageUrl(storagePath) {
  if (!storagePath) {
    return "";
  }

  const rawPath = String(storagePath).trim();

  if (!rawPath) {
    return "";
  }

  if (/^https?:\/\//i.test(rawPath)) {
    return rawPath;
  }

  let path = rawPath.replace(/^\/+/, "");

  if (path.startsWith("product-images/")) {
    path = path.substring("product-images/".length);
  }

  const { data } = supabase.storage
    .from("product-images")
    .getPublicUrl(path);

  return data?.publicUrl || "";
}


/* =========================================================
   LOCAL STORAGE
========================================================= */

function getGuestCart() {
  try {
    const cart = JSON.parse(
      localStorage.getItem("cart") || "[]"
    );

    return Array.isArray(cart) ? cart : [];
  } catch (error) {
    console.error(
      "Failed to read guest cart:",
      error
    );

    return [];
  }
}


function saveGuestCart(cart) {
  localStorage.setItem(
    "cart",
    JSON.stringify(cart)
  );
}


function clearGuestCart() {
  localStorage.removeItem("cart");
}


/* =========================================================
   PROMO STORAGE
========================================================= */

function getStoredPromo() {
  try {
    const raw =
      sessionStorage.getItem(
        "appliedPromo"
      );

    if (!raw) {
      return null;
    }

    const promo =
      JSON.parse(raw);

    if (
      !promo ||
      !promo.code
    ) {
      return null;
    }

    return promo;

  } catch (error) {
    console.error(
      "Failed to read stored promo:",
      error
    );

    return null;
  }
}


function saveStoredPromo(promo) {
  if (!promo) {
    clearStoredPromo();
    return;
  }

  sessionStorage.setItem(
    "appliedPromo",
    JSON.stringify(promo)
  );

  appliedPromo = promo;
}


function clearStoredPromo() {
  sessionStorage.removeItem(
    "appliedPromo"
  );

  appliedPromo = null;
}


/* =========================================================
   AUTH
========================================================= */

async function getCurrentUser() {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) {
    console.error(
      "Failed to get auth session:",
      error
    );

    return null;
  }

  return session?.user || null;
}


/* =========================================================
   LOAD PRODUCTS
========================================================= */

async function loadProducts() {
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
      categories (
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
    .eq("is_active", true);

  if (error) {
    console.error(
      "Failed to load products:",
      error
    );

    products = [];
    return;
  }

  products =
    (data || []).map(product => {

      const variants =
        Array.isArray(
          product.product_variants
        )
          ? product.product_variants
          : [];

      const images =
        Array.isArray(
          product.product_images
        )
          ? product.product_images
          : [];

      const primaryImage =
        images.find(
          image =>
            image.is_primary
        ) ||
        [...images].sort(
          (a, b) =>
            Number(
              a.sort_order || 0
            ) -
            Number(
              b.sort_order || 0
            )
        )[0];

      const imageUrl =
        getProductImageUrl(
          primaryImage?.storage_path
        );

      const totalStock =
        variants.reduce(
          (sum, variant) =>
            sum +
            (
              Number(
                variant.stock
              ) || 0
            ),
          0
        );

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        type: product.type,
        material: product.material,
        price:
          Number(
            product.price
          ) || 0,
        stock: totalStock,
        image: imageUrl,
        images,
        variants
      };
    });
}


/* =========================================================
   PRODUCT HELPERS
========================================================= */

function getProduct(productId) {
  return products.find(
    product =>
      Number(product.id) ===
      Number(productId)
  );
}


function getProductVariant(
  product,
  variantId
) {
  if (
    !product ||
    !Array.isArray(
      product.variants
    )
  ) {
    return null;
  }

  return product.variants.find(
    variant =>
      Number(variant.id) ===
      Number(variantId)
  );
}


function getProductPrice(
  product,
  variantId = null
) {
  if (!product) {
    return 0;
  }

  if (
    variantId !== null &&
    variantId !== undefined
  ) {
    const variant =
      getProductVariant(
        product,
        variantId
      );

    if (
      variant &&
      variant.price !== null &&
      variant.price !== undefined
    ) {
      return (
        Number(
          variant.price
        ) || 0
      );
    }
  }

  return (
    Number(
      product.price
    ) || 0
  );
}


/* =========================================================
   GET OR CREATE USER CART
========================================================= */

async function getOrCreateUserCart() {
  if (!currentUser) {
    return null;
  }

  const {
    data: existingCart,
    error: fetchError
  } = await supabase
    .from("carts")
    .select("*")
    .eq(
      "user_id",
      currentUser.id
    )
    .order(
      "created_at",
      {
        ascending: true
      }
    )
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    console.error(
      "Failed to load user cart:",
      fetchError
    );

    return null;
  }

  if (existingCart) {
    return existingCart;
  }

  const {
    data: newCart,
    error: createError
  } = await supabase
    .from("carts")
    .insert({
      user_id:
        currentUser.id
    })
    .select()
    .single();

  if (createError) {
    console.error(
      "Failed to create user cart:",
      createError
    );

    return null;
  }

  return newCart;
}


/* =========================================================
   LOAD USER CART ITEMS
========================================================= */

async function loadUserCartItems() {
  currentDbCartItems = [];

  if (!currentUserCart) {
    return;
  }

  const {
    data,
    error
  } = await supabase
    .from("cart_items")
    .select(`
      id,
      cart_id,
      product_variant_id,
      quantity
    `)
    .eq(
      "cart_id",
      currentUserCart.id
    )
    .order(
      "created_at",
      {
        ascending: true
      }
    );

  if (error) {
    console.error(
      "Failed to load cart items:",
      error
    );

    return;
  }

  currentDbCartItems =
    data || [];
}


/* =========================================================
   MERGE GUEST CART → USER CART
========================================================= */

async function mergeGuestCartIntoUserCart() {
  if (
    !currentUser ||
    !currentUserCart
  ) {
    return;
  }

  const guestCart =
    getGuestCart();

  if (
    !Array.isArray(guestCart) ||
    guestCart.length === 0
  ) {
    return;
  }

  console.log(
    "Merging guest cart into user cart..."
  );

  let allTransferred =
    true;

  for (
    const guestItem of guestCart
  ) {

    const productId =
      guestItem.productId ??
      guestItem.id;

    const quantity =
      Number(
        guestItem.quantity
      ) || 1;

    if (
      !productId ||
      quantity <= 0
    ) {
      allTransferred = false;
      continue;
    }

    const product =
      getProduct(
        productId
      );

    if (!product) {
      console.warn(
        "Product not found while merging guest cart:",
        productId
      );

      allTransferred = false;
      continue;
    }

    let variantId =
      guestItem.variantId ??
      guestItem.product_variant_id ??
      null;

    if (
      !variantId &&
      Array.isArray(
        product.variants
      ) &&
      product.variants.length > 0
    ) {

      const availableVariant =
        product.variants.find(
          variant =>
            Number(
              variant.stock
            ) > 0
        );

      const fallbackVariant =
        availableVariant ||
        product.variants[0];

      variantId =
        fallbackVariant?.id ??
        null;
    }

    if (!variantId) {
      allTransferred = false;
      continue;
    }

    const variant =
      getProductVariant(
        product,
        variantId
      );

    if (!variant) {
      allTransferred = false;
      continue;
    }

    const stock =
      Number(
        variant.stock
      ) || 0;

    if (stock <= 0) {
      allTransferred = false;
      continue;
    }

    const existingItem =
      currentDbCartItems.find(
        item =>
          Number(
            item.product_variant_id
          ) ===
          Number(
            variantId
          )
      );

    let finalQuantity =
      quantity;

    if (existingItem) {
      finalQuantity =
        Number(
          existingItem.quantity
        ) +
        quantity;
    }

    if (
      finalQuantity >
      stock
    ) {
      finalQuantity =
        stock;
    }

    if (
      finalQuantity <= 0
    ) {
      allTransferred = false;
      continue;
    }

    if (existingItem) {

      const {
        error
      } = await supabase
        .from("cart_items")
        .update({
          quantity:
            finalQuantity
        })
        .eq(
          "id",
          existingItem.id
        )
        .eq(
          "cart_id",
          currentUserCart.id
        );

      if (error) {
        console.error(
          "Failed to merge existing cart item:",
          error
        );

        allTransferred = false;
        continue;
      }

    } else {

      const {
        error
      } = await supabase
        .from("cart_items")
        .insert({
          cart_id:
            currentUserCart.id,
          product_variant_id:
            Number(
              variantId
            ),
          quantity:
            finalQuantity
        });

      if (error) {
        console.error(
          "Failed to insert guest cart item:",
          error
        );

        allTransferred = false;
        continue;
      }
    }
  }

  await loadUserCartItems();

  if (allTransferred) {
    clearGuestCart();

    console.log(
      "Guest cart merged successfully."
    );
  } else {
    console.warn(
      "Guest cart was only partially merged."
    );
  }
}


/* =========================================================
   ADD ITEM TO USER CART
========================================================= */

async function addVariantToUserCart(
  variantId,
  quantity = 1
) {
  if (
    !currentUser ||
    !currentUserCart
  ) {
    return false;
  }

  const numericVariantId =
    Number(
      variantId
    );

  const numericQuantity =
    Number(
      quantity
    ) || 1;

  if (
    !numericVariantId ||
    numericQuantity <= 0
  ) {
    return false;
  }

  const existingItem =
    currentDbCartItems.find(
      item =>
        Number(
          item.product_variant_id
        ) ===
        numericVariantId
    );

  if (existingItem) {

    const newQuantity =
      Number(
        existingItem.quantity
      ) +
      numericQuantity;

    const {
      error
    } = await supabase
      .from("cart_items")
      .update({
        quantity:
          newQuantity
      })
      .eq(
        "id",
        existingItem.id
      )
      .eq(
        "cart_id",
        currentUserCart.id
      );

    if (error) {
      console.error(
        "Failed to update cart item:",
        error
      );

      return false;
    }

  } else {

    const {
      error
    } = await supabase
      .from("cart_items")
      .insert({
        cart_id:
          currentUserCart.id,
        product_variant_id:
          numericVariantId,
        quantity:
          numericQuantity
      });

    if (error) {
      console.error(
        "Failed to add cart item:",
        error
      );

      return false;
    }
  }

  await loadUserCartItems();

  return true;
}


/* =========================================================
   UPDATE USER CART ITEM
========================================================= */

async function updateUserCartItem(
  itemId,
  quantity
) {
  if (
    !currentUser ||
    !currentUserCart
  ) {
    return false;
  }

  const numericQuantity =
    Number(quantity);

  if (
    !Number.isFinite(
      numericQuantity
    )
  ) {
    return false;
  }

  if (
    numericQuantity <= 0
  ) {
    return removeUserCartItem(
      itemId
    );
  }

  const {
    data,
    error
  } = await supabase
    .from("cart_items")
    .update({
      quantity:
        numericQuantity
    })
    .eq(
      "id",
      itemId
    )
    .eq(
      "cart_id",
      currentUserCart.id
    )
    .select()
    .maybeSingle();

  if (error) {
    console.error(
      "Failed to update cart item:",
      error
    );

    return false;
  }

  if (!data) {
    console.error(
      "Cart item update affected 0 rows."
    );

    return false;
  }

  await loadUserCartItems();

  return true;
}


/* =========================================================
   REMOVE USER CART ITEM
========================================================= */

async function removeUserCartItem(
  itemId
) {
  if (
    !currentUser ||
    !currentUserCart
  ) {
    return false;
  }

  const {
    error
  } = await supabase
    .from("cart_items")
    .delete()
    .eq(
      "id",
      itemId
    )
    .eq(
      "cart_id",
      currentUserCart.id
    );

  if (error) {
    console.error(
      "Failed to remove cart item:",
      error
    );

    return false;
  }

  await loadUserCartItems();

  return true;
}


/* =========================================================
   NORMALIZE CART
========================================================= */

function getCartItemsForDisplay() {

  if (currentUser) {

    return currentDbCartItems
      .map(dbItem => {

        const product =
          products.find(
            item =>
              Array.isArray(
                item.variants
              ) &&
              item.variants.some(
                variant =>
                  Number(
                    variant.id
                  ) ===
                  Number(
                    dbItem.product_variant_id
                  )
              )
          );

        if (!product) {
          return null;
        }

        const variant =
          getProductVariant(
            product,
            dbItem.product_variant_id
          );

        if (!variant) {
          return null;
        }

        return {
          cartItemId:
            dbItem.id,

          productId:
            product.id,

          variantId:
            dbItem.product_variant_id,

          quantity:
            Number(
              dbItem.quantity
            ) || 1,

          product,

          variant,

          price:
            getProductPrice(
              product,
              dbItem.product_variant_id
            )
        };
      })
      .filter(Boolean);
  }


  const guestCart =
    getGuestCart();

  return guestCart
    .map(item => {

      const productId =
        item.productId ??
        item.id;

      const product =
        getProduct(
          productId
        );

      if (!product) {
        return null;
      }

      let variantId =
        item.variantId ??
        item.product_variant_id ??
        null;

      if (
        !variantId &&
        Array.isArray(
          product.variants
        ) &&
        product.variants.length > 0
      ) {
        variantId =
          product.variants[0].id;
      }

      const variant =
        variantId
          ? getProductVariant(
            product,
            variantId
          )
          : null;

      if (!variant) {
        return null;
      }

      return {
        cartItemId:
          null,

        productId:
          product.id,

        variantId,

        quantity:
          Number(
            item.quantity
          ) || 1,

        product,

        variant,

        price:
          getProductPrice(
            product,
            variantId
          )
      };
    })
    .filter(Boolean);
}


/* =========================================================
   RENDER CART
========================================================= */

function renderCart() {

  const cartItemsContainer =
    document.getElementById(
      "cartItemsContainer"
    );

  if (!cartItemsContainer) {
    return;
  }

  const cartItems =
    getCartItemsForDisplay();

  cartItemsContainer.innerHTML =
    "";

  if (
    cartItems.length === 0
  ) {

    cartItemsContainer.innerHTML = `
      <div class="empty-cart">
        <h2>YOUR CART IS EMPTY</h2>

        <p>
          There are no products in your cart.
        </p>

        <a href="/shop">
          CONTINUE SHOPPING
        </a>
      </div>
    `;

    updateSummary([]);

    updateCartCount(0);

    return;
  }

  cartItems.forEach(item => {

    const product =
      item.product;

    const itemTotal =
      item.price *
      item.quantity;

    const variantSize =
      item.variant?.size ||
      "One Size";

    const itemElement =
      document.createElement(
        "div"
      );

    itemElement.className =
      "cart-item";

    itemElement.innerHTML = `
      <div class="cart-item-image">
        ${product.image
        ? `
              <img
                src="${escapeHtml(
          product.image
        )}"
                alt="${escapeHtml(
          product.name
        )}"
                loading="lazy"
                onerror="this.style.display='none';"
              >
            `
        : `
              <div class="no-image">
                NO IMAGE
              </div>
            `
      }
      </div>

      <div class="cart-item-info">

        <h3 class="cart-item-name">
          ${escapeHtml(
        product.name
      )}
        </h3>

        <div class="cart-item-size">
          SIZE:
          ${escapeHtml(
        String(
          variantSize
        )
      )}
        </div>

        ${item.variant?.sku
        ? `
              <div class="cart-item-sku">
                SKU:
                ${escapeHtml(
          String(
            item.variant.sku
          )
        )}
              </div>
            `
        : ""
      }

        <div class="cart-item-price">
          ${formatPrice(
        item.price
      )}
        </div>

      </div>

      <div class="cart-item-actions">

        <div class="quantity-controls">

          <button
            type="button"
            class="quantity-btn decrease-btn"
            aria-label="Decrease quantity"
          >
            −
          </button>

          <span class="quantity">
            ${item.quantity}
          </span>

          <button
            type="button"
            class="quantity-btn increase-btn"
            aria-label="Increase quantity"
          >
            +
          </button>

        </div>

        <div class="cart-item-total">
          ${formatPrice(
        itemTotal
      )}
        </div>

        <button
          type="button"
          class="remove-item"
        >
          REMOVE
        </button>

      </div>
    `;

    const decreaseBtn =
      itemElement.querySelector(
        ".decrease-btn"
      );

    const increaseBtn =
      itemElement.querySelector(
        ".increase-btn"
      );

    const removeBtn =
      itemElement.querySelector(
        ".remove-item"
      );

    decreaseBtn.addEventListener(
      "click",
      async () => {
        await changeQuantity(
          item,
          -1
        );
      }
    );

    increaseBtn.addEventListener(
      "click",
      async () => {
        await changeQuantity(
          item,
          1
        );
      }
    );

    removeBtn.addEventListener(
      "click",
      async () => {
        await removeCartItem(
          item
        );
      }
    );

    cartItemsContainer.appendChild(
      itemElement
    );
  });

  updateSummary(
    cartItems
  );

  updateCartCount(
    cartItems.reduce(
      (total, item) =>
        total +
        item.quantity,
      0
    )
  );
}


/* =========================================================
   CHANGE QUANTITY
========================================================= */

async function changeQuantity(
  item,
  amount
) {

  const newQuantity =
    Number(item.quantity) +
    Number(amount);

  if (
    newQuantity <= 0
  ) {
    await removeCartItem(
      item
    );

    return;
  }


  if (amount > 0) {

    const variant =
      item.variant;

    if (!variant) {
      return;
    }

    const stock =
      Number(
        variant.stock
      ) || 0;

    if (
      newQuantity >
      stock
    ) {
      showStockPopup(
        stock
      );

      return;
    }
  }


  if (currentUser) {

    const success =
      await updateUserCartItem(
        item.cartItemId,
        newQuantity
      );

    if (!success) {
      return;
    }

  } else {

    const cart =
      getGuestCart();

    const cartItem =
      cart.find(
        cartItem => {

          const productId =
            cartItem.productId ??
            cartItem.id;

          let variantId =
            cartItem.variantId ??
            cartItem.product_variant_id ??
            null;

          if (!variantId) {
            variantId =
              item.variantId;
          }

          return (
            Number(
              productId
            ) ===
            Number(
              item.productId
            ) &&
            Number(
              variantId || 0
            ) ===
            Number(
              item.variantId || 0
            )
          );
        }
      );

    if (cartItem) {

      cartItem.productId =
        item.productId;

      cartItem.variantId =
        item.variantId;

      cartItem.quantity =
        newQuantity;

      saveGuestCart(
        cart
      );

    } else {

      cart.push({
        productId:
          item.productId,

        variantId:
          item.variantId,

        quantity:
          newQuantity
      });

      saveGuestCart(
        cart
      );
    }
  }

  /*
   * Promo amount depends on subtotal,
   * so revalidate the stored promo
   * after quantity changes.
   */
  if (appliedPromo) {
    await refreshAppliedPromo();
  }

  renderCart();
}


/* =========================================================
   REMOVE CART ITEM
========================================================= */

async function removeCartItem(
  item
) {

  if (currentUser) {

    const success =
      await removeUserCartItem(
        item.cartItemId
      );

    if (!success) {
      return;
    }

  } else {

    const cart =
      getGuestCart();

    const newCart =
      cart.filter(
        cartItem => {

          const productId =
            cartItem.productId ??
            cartItem.id;

          let variantId =
            cartItem.variantId ??
            cartItem.product_variant_id ??
            null;

          if (!variantId) {
            variantId =
              item.variantId;
          }

          const sameProduct =
            Number(
              productId
            ) ===
            Number(
              item.productId
            );

          const sameVariant =
            Number(
              variantId || 0
            ) ===
            Number(
              item.variantId || 0
            );

          return !(
            sameProduct &&
            sameVariant
          );
        }
      );

    saveGuestCart(
      newCart
    );
  }

  if (appliedPromo) {
    await refreshAppliedPromo();
  }

  renderCart();
}


/* =========================================================
   GET SUBTOTAL
========================================================= */

function calculateSubtotal(
  cartItems
) {
  return cartItems.reduce(
    (total, item) =>
      total +
      (
        Number(
          item.price
        ) || 0
      ) *
      (
        Number(
          item.quantity
        ) || 0
      ),
    0
  );
}


/* =========================================================
   SUMMARY
========================================================= */

function updateSummary(
  cartItems
) {

  const subtotalAmount =
    document.getElementById(
      "subtotalAmount"
    );

  const shippingAmount =
    document.getElementById(
      "shippingAmount"
    );

  const taxAmount =
    document.getElementById(
      "taxAmount"
    );

  const discountAmount =
    document.getElementById(
      "discountAmount"
    );

  const totalAmount =
    document.getElementById(
      "totalAmount"
    );


  const subtotal =
    calculateSubtotal(
      cartItems
    );

  const shipping =
    0;

  const tax =
    0;


  let discount =
    0;

  if (
    appliedPromo &&
    appliedPromo.discount_amount
  ) {

    discount =
      Math.min(
        Number(
          appliedPromo.discount_amount
        ) || 0,
        subtotal
      );
  }


  const total =
    Math.max(
      0,
      subtotal +
      shipping +
      tax -
      discount
    );


  if (subtotalAmount) {
    subtotalAmount.textContent =
      formatPrice(
        subtotal
      );
  }

  if (shippingAmount) {
    shippingAmount.textContent =
      formatPrice(
        shipping
      );
  }

  if (taxAmount) {
    taxAmount.textContent =
      formatPrice(
        tax
      );
  }

  if (discountAmount) {

    discountAmount.textContent =
      discount > 0
        ? `-${formatPrice(
          discount
        )}`
        : formatPrice(
          0
        );
  }

  if (totalAmount) {
    totalAmount.textContent =
      formatPrice(
        total
      );
  }


  const discountRow =
    document.getElementById(
      "discountRow"
    );

  if (discountRow) {
    discountRow.hidden =
      discount <= 0;
  }
}


/* =========================================================
   CART COUNT
========================================================= */

async function updateCartCount(
  forcedCount = null
) {

  const cartCountElements =
    document.querySelectorAll(
      "[data-cart-count], .cart-count, .cart-pill"
    );

  let count =
    forcedCount;

  if (count === null) {

    if (currentUser) {

      count =
        currentDbCartItems.reduce(
          (total, item) =>
            total +
            (
              Number(
                item.quantity
              ) || 0
            ),
          0
        );

    } else {

      count =
        getGuestCart().reduce(
          (total, item) =>
            total +
            (
              Number(
                item.quantity
              ) || 0
            ),
          0
        );
    }
  }

  count =
    Number(count) || 0;

  cartCountElements.forEach(
    element => {

      if (
        element.classList.contains(
          "cart-pill"
        )
      ) {

        element.textContent =
          `CART (${count})`;

      } else {

        element.textContent =
          String(count);
      }
    }
  );
}


/* =========================================================
   VALIDATE PROMO
========================================================= */

async function validatePromo(
  code,
  subtotal
) {

  if (!code) {
    return null;
  }

  const {
    data,
    error
  } = await supabase.rpc(
    "validate_promo_code",
    {
      p_code:
        code,

      p_order_subtotal:
        subtotal
    }
  );

  if (error) {
    console.error(
      "Promo validation error:",
      error
    );

    throw error;
  }

  if (
    !data ||
    data.valid !== true
  ) {
    return {
      valid: false,
      message:
        data?.message ||
        "کد تخفیف نامعتبر است."
    };
  }

  return {
    valid: true,

    code:
      String(
        data.code || code
      ).toUpperCase(),

    discount_type:
      data.discount_type,

    discount_value:
      Number(
        data.discount_value
      ) || 0,

    discount_amount:
      Number(
        data.discount_amount
      ) || 0,

    minimum_order:
      Number(
        data.minimum_order
      ) || 0
  };
}


/* =========================================================
   APPLY PROMO CODE
========================================================= */

async function applyPromoCode() {

  const promoInput =
    document.getElementById(
      "promoInput"
    ) ||
    document.getElementById(
      "promoCode"
    );

  if (!promoInput) {
    return;
  }

  const code =
    promoInput.value
      .trim()
      .toUpperCase();

  if (!code) {

    clearStoredPromo();

    renderCart();

    return;
  }


  const cartItems =
    getCartItemsForDisplay();

  const subtotal =
    calculateSubtotal(
      cartItems
    );


  if (subtotal <= 0) {

    alert(
      "سبد خرید شما خالی است."
    );

    return;
  }


  try {

    const promo =
      await validatePromo(
        code,
        subtotal
      );


    if (
      !promo ||
      promo.valid !== true
    ) {

      clearStoredPromo();

      alert(
        promo?.message ||
        "کد تخفیف نامعتبر است."
      );

      renderCart();

      return;
    }


    saveStoredPromo(
      promo
    );


    renderCart();


    alert(
      `کد تخفیف اعمال شد.\nمبلغ تخفیف: ${formatPrice(
        promo.discount_amount
      )}`
    );

  } catch (error) {

    console.error(
      "Apply promo error:",
      error
    );

    alert(
      "خطایی هنگام بررسی کد تخفیف رخ داد."
    );
  }
}


/* =========================================================
   REFRESH APPLIED PROMO
========================================================= */

async function refreshAppliedPromo() {

  if (!appliedPromo?.code) {
    return;
  }

  const cartItems =
    getCartItemsForDisplay();

  const subtotal =
    calculateSubtotal(
      cartItems
    );

  if (subtotal <= 0) {
    clearStoredPromo();
    return;
  }

  try {

    const promo =
      await validatePromo(
        appliedPromo.code,
        subtotal
      );

    if (
      !promo ||
      promo.valid !== true
    ) {

      clearStoredPromo();

      return;
    }

    saveStoredPromo(
      promo
    );

  } catch (error) {

    console.error(
      "Failed to refresh promo:",
      error
    );
  }
}


/* =========================================================
   CHECKOUT
========================================================= */

async function handleCheckout() {

  if (!currentUser) {

    window.location.href =
      "/login?redirect=/cart";

    return;
  }


  if (
    !currentDbCartItems ||
    currentDbCartItems.length === 0
  ) {

    alert(
      "Your cart is empty."
    );

    return;
  }


  /*
   * Make sure the promo is still valid
   * before entering checkout.
   */
  if (appliedPromo) {
    await refreshAppliedPromo();
  }


  window.location.href =
    "/checkout";
}


/* =========================================================
   EVENT LISTENERS
========================================================= */

function setupEventListeners() {

  const promoButton =
    document.getElementById(
      "promoBtn"
    ) ||
    document.getElementById(
      "applyPromoBtn"
    );

  if (promoButton) {

    promoButton.addEventListener(
      "click",
      applyPromoCode
    );
  }


  const promoInput =
    document.getElementById(
      "promoInput"
    ) ||
    document.getElementById(
      "promoCode"
    );

  if (promoInput) {

    promoInput.addEventListener(
      "keydown",
      event => {

        if (
          event.key ===
          "Enter"
        ) {

          event.preventDefault();

          applyPromoCode();
        }
      }
    );
  }


  const checkoutButton =
    document.getElementById(
      "checkoutBtn"
    );

  if (checkoutButton) {

    checkoutButton.addEventListener(
      "click",
      handleCheckout
    );
  }
}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


/* =========================================================
   STOCK POPUP
========================================================= */

function showStockPopup(
  stock
) {

  let popup =
    document.getElementById(
      "stockPopup"
    );

  if (!popup) {

    popup =
      document.createElement(
        "div"
      );

    popup.id =
      "stockPopup";

    popup.innerHTML = `
      <div class="stock-popup-backdrop"></div>

      <div class="stock-popup">

        <button
          type="button"
          class="stock-popup-close"
          aria-label="Close"
        >
          ×
        </button>

        <div class="stock-popup-icon">
          !
        </div>

        <div class="stock-popup-content">

          <div class="stock-popup-label">
            STOCK LIMIT
          </div>

          <h3>
            موجودی کافی نیست
          </h3>

          <p>
            فقط
            <strong
              class="stock-popup-number"
            ></strong>
            عدد از این محصول موجود است.
          </p>

        </div>

        <button
          type="button"
          class="stock-popup-ok"
        >
          متوجه شدم
        </button>

      </div>
    `;

    document.body.appendChild(
      popup
    );

    const closePopup =
      () => {

        popup.classList.remove(
          "show"
        );

        setTimeout(
          () => {

            if (
              popup &&
              popup.parentNode
            ) {
              popup.remove();
            }

          },
          250
        );
      };

    popup
      .querySelector(
        ".stock-popup-backdrop"
      )
      .addEventListener(
        "click",
        closePopup
      );

    popup
      .querySelector(
        ".stock-popup-close"
      )
      .addEventListener(
        "click",
        closePopup
      );

    popup
      .querySelector(
        ".stock-popup-ok"
      )
      .addEventListener(
        "click",
        closePopup
      );
  }


  const numberElement =
    popup.querySelector(
      ".stock-popup-number"
    );

  numberElement.textContent =
    new Intl.NumberFormat(
      "fa-IR"
    ).format(
      Number(stock)
    );


  popup.classList.remove(
    "show"
  );

  requestAnimationFrame(
    () => {
      popup.classList.add(
        "show"
      );
    }
  );
}


/* =========================================================
   INITIALIZE
========================================================= */

async function initCart() {

  try {

    await loadProducts();

    currentUser =
      await getCurrentUser();


    appliedPromo =
      getStoredPromo();


    if (currentUser) {

      currentUserCart =
        await getOrCreateUserCart();


      if (currentUserCart) {

        await loadUserCartItems();

        await mergeGuestCartIntoUserCart();
      }

    } else {

      currentUserCart =
        null;

      currentDbCartItems =
        [];
    }


    /*
     * Revalidate previously applied promo
     * against the current subtotal.
     */
    if (appliedPromo) {
      await refreshAppliedPromo();
    }


    setupEventListeners();

    renderCart();

    await updateCartCount();

  } catch (error) {

    console.error(
      "Cart initialization failed:",
      error
    );
  }
}


/* =========================================================
   AUTH STATE CHANGES
========================================================= */

supabase.auth.onAuthStateChange(
  (
    event,
    session
  ) => {

    if (
      event ===
      "INITIAL_SESSION"
    ) {
      return;
    }


    setTimeout(
      async () => {

        try {

          currentUser =
            session?.user ||
            null;


          if (currentUser) {

            currentUserCart =
              await getOrCreateUserCart();


            if (currentUserCart) {

              await loadUserCartItems();

              await mergeGuestCartIntoUserCart();
            }

          } else {

            currentUserCart =
              null;

            currentDbCartItems =
              [];
          }


          if (appliedPromo) {
            await refreshAppliedPromo();
          }


          renderCart();

          await updateCartCount();

        } catch (error) {

          console.error(
            "Auth state cart synchronization failed:",
            error
          );
        }

      },
      0
    );
  }
);


/* =========================================================
   START
========================================================= */

initCart();
