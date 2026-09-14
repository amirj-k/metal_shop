import { supabase } from "./js/supabase.js";

let products = [];

const productsContainer =
  document.getElementById("products-container");

const categoryButtons =
  document.querySelectorAll(".category-btn");


// ======================================================
// CART - LOCAL STORAGE
// ======================================================

function readCart() {
  try {
    const cart = JSON.parse(
      localStorage.getItem("cart") || "[]"
    );

    return Array.isArray(cart) ? cart : [];
  } catch (error) {
    console.error(
      "Error reading local cart:",
      error
    );

    return [];
  }
}


function saveCart(cart) {
  try {
    localStorage.setItem(
      "cart",
      JSON.stringify(cart)
    );

    return true;
  } catch (error) {
    console.error(
      "Error saving local cart:",
      error
    );

    return false;
  }
}


function getProductQuantity(
  cart,
  productId
) {
  return cart.reduce(
    (total, item) => {

      if (
        String(item.productId) ===
        String(productId)
      ) {
        return (
          total +
          Math.max(
            0,
            Number(item.quantity) || 0
          )
        );
      }

      return total;
    },
    0
  );
}


// ======================================================
// USER CART - SUPABASE
// ======================================================

async function getOrCreateUserCart() {

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();


  if (userError) {

    console.error(
      "Error getting user:",
      userError
    );

    return null;
  }


  // Guest user
  if (!user) {
    return null;
  }


  // ----------------------------------------------
  // Find existing cart
  // ----------------------------------------------

  const {
    data: existingCart,
    error: fetchError
  } = await supabase
    .from("carts")
    .select("id, user_id")
    .eq("user_id", user.id)
    .maybeSingle();


  if (fetchError) {

    console.error(
      "Error loading user cart:",
      fetchError
    );

    return null;
  }


  if (existingCart) {
    return existingCart;
  }


  // ----------------------------------------------
  // Create cart
  // ----------------------------------------------

  const {
    data: newCart,
    error: createError
  } = await supabase
    .from("carts")
    .insert({
      user_id: user.id
    })
    .select("id, user_id")
    .single();


  if (createError) {

    console.error(
      "Error creating user cart:",
      createError
    );

    return null;
  }


  return newCart;
}


// ======================================================
// ADD VARIANT TO USER CART
// ======================================================

async function addVariantToUserCart(
  variantId,
  quantity
) {

  const userCart =
    await getOrCreateUserCart();


  if (!userCart) {

    return {
      success: false,
      loggedIn: false
    };

  }


  // ----------------------------------------------
  // Check existing cart item
  // ----------------------------------------------

  const {
    data: existingItem,
    error: findError
  } = await supabase
    .from("cart_items")
    .select(`
      id,
      quantity,
      product_variant_id
    `)
    .eq("cart_id", userCart.id)
    .eq(
      "product_variant_id",
      variantId
    )
    .maybeSingle();


  if (findError) {

    console.error(
      "Error checking cart item:",
      findError
    );

    return {
      success: false,
      loggedIn: true
    };

  }


  // ----------------------------------------------
  // Update existing item
  // ----------------------------------------------

  if (existingItem) {

    const newQuantity =
      Number(
        existingItem.quantity || 0
      ) +
      Number(quantity || 0);


    const {
      error: updateError
    } = await supabase
      .from("cart_items")
      .update({
        quantity: newQuantity
      })
      .eq(
        "id",
        existingItem.id
      )
      .eq(
        "cart_id",
        userCart.id
      );


    if (updateError) {

      console.error(
        "Error updating cart item:",
        updateError
      );

      return {
        success: false,
        loggedIn: true
      };

    }

  }

  // ----------------------------------------------
  // Insert new item
  // ----------------------------------------------

  else {

    const {
      error: insertError
    } = await supabase
      .from("cart_items")
      .insert({
        cart_id: userCart.id,
        product_variant_id: variantId,
        quantity: quantity
      });


    if (insertError) {

      console.error(
        "Error inserting cart item:",
        insertError
      );

      return {
        success: false,
        loggedIn: true
      };

    }

  }


  return {
    success: true,
    loggedIn: true
  };
}


// ======================================================
// HELPERS
// ======================================================

function normalizeBand(value) {

  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

}


// ======================================================
// URL FILTERS
// ======================================================

function getRequestedFilters() {

  const params =
    new URLSearchParams(
      window.location.search
    );


  return {

    category:
      params.get("category") ||
      "all",

    band:
      normalizeBand(
        params.get("band")
      )

  };

}


// ======================================================
// FILTER PRODUCTS
// ======================================================

function filterProducts(
  category,
  band
) {

  return products.filter(
    (product) => {

      const categoryMatch =
        category === "all" ||
        product.category === category;


      const bandMatch =
        !band ||
        normalizeBand(
          product.band
        ) === band;


      return (
        categoryMatch &&
        bandMatch
      );

    }
  );

}


// ======================================================
// RENDER PRODUCTS
// ======================================================

function renderProducts(
  productsToRender = products
) {

  if (!productsContainer) {

    console.error(
      "products-container not found."
    );

    return;
  }


  productsContainer.innerHTML =
    "";


  // ----------------------------------------------
  // No products
  // ----------------------------------------------

  if (!productsToRender.length) {

    const emptyMessage =
      document.createElement("p");


    emptyMessage.textContent =
      "No products found.";


    emptyMessage.className =
      "no-products";


    productsContainer.appendChild(
      emptyMessage
    );


    return;
  }


  const fragment =
    document.createDocumentFragment();


  // ==================================================
  // PRODUCTS
  // ==================================================

  productsToRender.forEach(
    (product) => {

      // ================================================
      // CARD
      // ================================================

      const card =
        document.createElement(
          "article"
        );


      card.className =
        "product-card";


      card.tabIndex =
        0;


      card.setAttribute(
        "role",
        "link"
      );


      // ================================================
      // IMAGE
      // ================================================

      const imageWrap =
        document.createElement(
          "div"
        );


      imageWrap.className =
        "product-image";


      if (product.image) {

        const image =
          document.createElement(
            "img"
          );


        image.src =
          product.image;


        image.alt =
          product.name ||
          "Product";


        image.loading =
          "lazy";


        image.decoding =
          "async";


        image.addEventListener(
          "error",
          () => {

            imageWrap.classList.add(
              "image-error"
            );

            image.remove();

          },
          {
            once: true
          }
        );


        imageWrap.appendChild(
          image
        );

      }


      // ================================================
      // INFO
      // ================================================

      const info =
        document.createElement(
          "div"
        );


      info.className =
        "product-info";


      // ================================================
      // BAND
      // ================================================

      const band =
        document.createElement(
          "p"
        );


      band.className =
        "product-band";


      band.textContent =
        product.band ||
        "";


      // ================================================
      // NAME
      // ================================================

      const name =
        document.createElement(
          "h2"
        );


      name.className =
        "product-name";


      name.textContent =
        product.name ||
        "";


      // ================================================
      // TYPE
      // ================================================

      const type =
        document.createElement(
          "p"
        );


      type.className =
        "product-type";


      type.textContent =
        product.type ||
        "";


      // ================================================
      // BOTTOM
      // ================================================

      const bottom =
        document.createElement(
          "div"
        );


      bottom.className =
        "product-bottom";


      // ================================================
      // PRICE
      // ================================================

      const price =
        document.createElement(
          "span"
        );


      price.className =
        "product-price";


      price.textContent =
        `${Number(
          product.price
        ).toLocaleString(
          "fa-IR"
        )} تومان`;


      // ================================================
      // ADD TO CART BUTTON
      // ================================================

      const addCartBtn =
        document.createElement(
          "button"
        );


      addCartBtn.type =
        "button";


      addCartBtn.className =
        "add-cart";


      const initialStock =
        Number(
          product.stock || 0
        );


      addCartBtn.textContent =
        initialStock > 0
          ? "ADD TO CART"
          : "OUT OF STOCK";


      addCartBtn.disabled =
        initialStock <= 0;


      // ================================================
      // ADD TO CART
      // ================================================

      addCartBtn.addEventListener(
        "click",
        async (event) => {

          event.stopPropagation();


          // --------------------------------------------
          // Check authentication
          // --------------------------------------------

          const {
            data: { user },
            error: authError
          } = await supabase.auth.getUser();


          if (authError) {

            console.error(
              "Auth check failed:",
              authError
            );

          }


          // ==================================================
          // LOGGED-IN USER
          // ==================================================

          if (user) {

            // --------------------------------------------
            // Find an available variant
            // --------------------------------------------

            const variant =
              product.variants?.find(
                (item) =>
                  Number(
                    item.stock || 0
                  ) > 0
              );


            if (!variant) {

              if (
                typeof showWarning ===
                "function"
              ) {

                showWarning(
                  "This product is out of stock.",
                  "⚠ Out of Stock"
                );

              }

              return;
            }


            // --------------------------------------------
            // Loading state
            // --------------------------------------------

            addCartBtn.disabled =
              true;


            addCartBtn.textContent =
              "ADDING...";


            // --------------------------------------------
            // Add to DB cart
            // --------------------------------------------

            const result =
              await addVariantToUserCart(
                variant.id,
                1
              );


            // --------------------------------------------
            // Error
            // --------------------------------------------

            if (!result.success) {

              addCartBtn.disabled =
                false;


              addCartBtn.textContent =
                "ADD TO CART";


              if (
                typeof showError ===
                "function"
              ) {

                showError(
                  "Could not add this product to your cart.",
                  "Cart Error"
                );

              }

              return;
            }


            // --------------------------------------------
            // Success
            // --------------------------------------------

            if (
              typeof showSuccess ===
              "function"
            ) {

              showSuccess(
                `${product.name} added to cart.`,
                "✓ Added to Cart"
              );

            }


            addCartBtn.textContent =
              "✓ ADDED";


            // --------------------------------------------
            // Refresh cart count
            // --------------------------------------------

            await updateCartCount();


            // --------------------------------------------
            // Reset button
            // --------------------------------------------

            window.setTimeout(
              () => {

                addCartBtn.textContent =
                  product.stock > 0
                    ? "ADD TO CART"
                    : "OUT OF STOCK";


                addCartBtn.disabled =
                  product.stock <= 0;

              },
              1500
            );


            return;
          }


          // ==================================================
          // GUEST USER
          // ==================================================

          const cart =
            readCart();


          const currentQuantity =
            getProductQuantity(
              cart,
              product.id
            );


          // --------------------------------------------
          // Stock limit
          // --------------------------------------------

          if (
            currentQuantity >=
            product.stock
          ) {

            if (
              typeof showWarning ===
              "function"
            ) {

              showWarning(
                "This product is already at its stock limit.",
                "⚠ Stock Limit"
              );

            }

            return;
          }


          // --------------------------------------------
          // Existing item
          // --------------------------------------------

          const existingItem =
            cart.find(
              (item) =>
                String(
                  item.productId
                ) ===
                  String(
                    product.id
                  ) &&
                !item.size
            );


          if (existingItem) {

            existingItem.quantity =
              Math.min(
                product.stock,
                Number(
                  existingItem.quantity ||
                  0
                ) + 1
              );

          }

          // --------------------------------------------
          // New item
          // --------------------------------------------

          else {

            cart.push({

              productId:
                product.id,

              name:
                product.name,

              quantity:
                1,

              price:
                product.price,

              image:
                product.image ||
                ""

            });

          }


          // --------------------------------------------
          // Save
          // --------------------------------------------

          if (!saveCart(cart)) {

            if (
              typeof showError ===
              "function"
            ) {

              showError(
                "Your cart could not be saved in this browser.",
                "Cart Error"
              );

            }

            return;
          }


          // --------------------------------------------
          // Success
          // --------------------------------------------

          if (
            typeof showSuccess ===
            "function"
          ) {

            showSuccess(
              `${product.name} added to cart.`,
              "✓ Added to Cart"
            );

          }


          // --------------------------------------------
          // Update count
          // --------------------------------------------

          updateCartCount();


          // --------------------------------------------
          // Button animation
          // --------------------------------------------

          const originalText =
            addCartBtn.textContent;


          addCartBtn.textContent =
            "✓ ADDED";


          addCartBtn.disabled =
            true;


          window.setTimeout(
            () => {

              addCartBtn.textContent =
                originalText;


              addCartBtn.disabled =
                getProductQuantity(
                  readCart(),
                  product.id
                ) >=
                product.stock;

            },
            1500
          );

        }
      );


      // ================================================
      // BUILD CARD
      // ================================================

      bottom.append(
        price,
        addCartBtn
      );


      info.append(
        band,
        name,
        type,
        bottom
      );


      card.append(
        imageWrap,
        info
      );


      // ================================================
      // OPEN PRODUCT DETAIL
      // ================================================

      const openDetail =
        () => {

          window.location.href =
            `/product?id=${encodeURIComponent(
              product.id
            )}`;

        };


      card.addEventListener(
        "click",
        (event) => {

          if (
            !event.target.closest(
              ".add-cart"
            )
          ) {

            openDetail();

          }

        }
      );


      // ================================================
      // KEYBOARD
      // ================================================

      card.addEventListener(
        "keydown",
        (event) => {

          if (
            event.key === "Enter" ||
            event.key === " "
          ) {

            event.preventDefault();

            openDetail();

          }

        }
      );


      fragment.appendChild(
        card
      );

    }
  );


  productsContainer.appendChild(
    fragment
  );

}


// ======================================================
// APPLY URL FILTER
// ======================================================

function applyFiltersFromUrl() {

  const {
    category,
    band
  } = getRequestedFilters();


  const validCategories = [
    "all",
    "necklaces",
    "pendants"
  ];


  const selectedCategory =
    validCategories.includes(
      category
    )
      ? category
      : "all";


  // ----------------------------------------------
  // Active button
  // ----------------------------------------------

  categoryButtons.forEach(
    (button) => {

      button.classList.toggle(
        "active",
        button.dataset.category ===
        selectedCategory
      );

    }
  );


  // ----------------------------------------------
  // Filter
  // ----------------------------------------------

  const filteredProducts =
    filterProducts(
      selectedCategory,
      band
    );


  renderProducts(
    filteredProducts
  );

}


// ======================================================
// CATEGORY BUTTONS
// ======================================================

categoryButtons.forEach(
  (button) => {

    button.type =
      "button";


    button.addEventListener(
      "click",
      () => {

        const selectedCategory =
          button.dataset.category;


        // ------------------------------------------
        // Active button
        // ------------------------------------------

        categoryButtons.forEach(
          (btn) => {

            btn.classList.remove(
              "active"
            );

          }
        );


        button.classList.add(
          "active"
        );


        // ------------------------------------------
        // Update URL
        // ------------------------------------------

        const url =
          new URL(
            window.location.href
          );


        // تغییر دسته‌بندی
        if (
          selectedCategory ===
          "all"
        ) {

          url.searchParams.delete(
            "category"
          );

        } else {

          url.searchParams.set(
            "category",
            selectedCategory
          );

        }


        // با انتخاب Category،
        // فیلتر Band حذف می‌شود

        url.searchParams.delete(
          "band"
        );


        // بروزرسانی URL بدون رفرش

        window.history.replaceState(
          {},
          "",
          url
        );


        // فقط فیلتر Category اعمال شود

        renderProducts(
          filterProducts(
            selectedCategory,
            ""
          )
        );

      }
    );

  }
);


// ======================================================
// CART COUNT
// ======================================================

async function updateCartCount() {

  const cartPill =
    document.querySelector(
      ".cart-pill"
    );


  if (!cartPill) {
    return;
  }


  // ----------------------------------------------
  // Check logged-in user
  // ----------------------------------------------

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();


  if (error) {

    console.error(
      "Error checking auth for cart count:",
      error
    );

  }


  // ==================================================
  // LOGGED-IN USER
  // ==================================================

  if (user) {

    const userCart =
      await getOrCreateUserCart();


    if (!userCart) {

      cartPill.textContent =
        "CART (0)";

      return;
    }


    const {
      data: cartItems,
      error: cartError
    } = await supabase
      .from("cart_items")
      .select("quantity")
      .eq(
        "cart_id",
        userCart.id
      );


    if (cartError) {

      console.error(
        "Error loading cart count:",
        cartError
      );

      cartPill.textContent =
        "CART (0)";

      return;
    }


    const totalItems =
      (cartItems || []).reduce(
        (sum, item) =>
          sum +
          Math.max(
            0,
            Number(
              item.quantity
            ) || 0
          ),
        0
      );


    cartPill.textContent =
      `CART (${totalItems})`;


    return;
  }


  // ==================================================
  // GUEST USER
  // ==================================================

  const cart =
    readCart();


  const totalItems =
    cart.reduce(
      (sum, item) =>
        sum +
        Math.max(
          0,
          Number(
            item.quantity
          ) || 0
        ),
      0
    );


  cartPill.textContent =
    `CART (${totalItems})`;

}


// ======================================================
// STORAGE EVENT
// ======================================================

window.addEventListener(
  "storage",
  (event) => {

    if (
      event.key ===
      "cart"
    ) {

      updateCartCount();

    }

  }
);


// ======================================================
// AUTH STATE CHANGE
// ======================================================

supabase.auth.onAuthStateChange(
  () => {

    updateCartCount();

  }
);


// ======================================================
// LOAD PRODUCTS FROM SUPABASE
// ======================================================

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
      band_id,

      categories (
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
    );


  console.log(
    "PRODUCTS FROM SUPABASE:",
    data
  );


  console.log(
    "SUPABASE ERROR:",
    error
  );


  // ==================================================
  // ERROR
  // ==================================================

  if (error) {

    console.error(
      "Error loading products:",
      error
    );


    if (productsContainer) {

      productsContainer.innerHTML =
        `
          <p>Failed to load products.</p>
        `;

    }


    return;
  }


  // ==================================================
  // MAP DATA
  // ==================================================

  products =
    (data || []).map(
      (product) => {

        // --------------------------------------------
        // Category
        // --------------------------------------------

        let category =
          "";


        if (
          Array.isArray(
            product.categories
          )
        ) {

          category =
            product.categories[0]?.slug ||
            "";

        } else {

          category =
            product.categories?.slug ||
            "";

        }


        // --------------------------------------------
        // Band
        // --------------------------------------------

        let band =
          "";


        if (
          Array.isArray(
            product.bands
          )
        ) {

          band =
            product.bands[0]?.name ||
            "";

        } else {

          band =
            product.bands?.name ||
            "";

        }


        // --------------------------------------------
        // Variants
        // --------------------------------------------

        const variants =
          Array.isArray(
            product.product_variants
          )
            ? product.product_variants
            : [];


        // --------------------------------------------
        // Stock
        // --------------------------------------------

        const stock =
          variants.reduce(
            (
              total,
              variant
            ) =>
              total +
              Number(
                variant.stock || 0
              ),
            0
          );


        // --------------------------------------------
        // Images
        // --------------------------------------------

        const images =
          Array.isArray(
            product.product_images
          )
            ? product.product_images
            : [];


        const sortedImages =
          [...images].sort(
            (a, b) =>
              (
                Number(
                  a.sort_order
                ) || 0
              ) -
              (
                Number(
                  b.sort_order
                ) || 0
              )
          );


        const primaryImage =
          sortedImages.find(
            (image) =>
              image.is_primary
          ) ||
          sortedImages[0] ||
          null;


        // --------------------------------------------
        // Return normalized product
        // --------------------------------------------

        return {

          id:
            product.id,

          name:
            product.name,

          slug:
            product.slug || "",

          category:
            category,

          band_id:
            product.band_id ||
            null,

          band:
            band,

          type:
            product.type ||
            "",

          price:
            Number(
              product.price || 0
            ),

          image:
            primaryImage?.storage_path ||
            "",

          description:
            product.description ||
            "",

          material:
            product.material ||
            "",

          sizes:
            variants.map(
              (variant) =>
                variant.size
            ),

          variants:
            variants,

          stock:
            stock

        };

      }
    );


  console.log(
    "MAPPED PRODUCTS:",
    products
  );


  // ==================================================
  // APPLY URL FILTERS
  // ==================================================

  applyFiltersFromUrl();

}


// ======================================================
// INITIALIZE
// ======================================================

updateCartCount();

loadProducts();
