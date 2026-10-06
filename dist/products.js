
// // =========================================================
// // PRODUCTS DATA
// // =========================================================

// // لیست محصولات قدیمی پروژه.
// // این بخش برای صفحات قدیمی که از products.js استفاده می‌کنند
// // نگه داشته شده است.
// const products = [
//   {
//     id: 1,
//     name: "Dean Blunt chain",
//     category: "accessories",
//     band: "Dean Blunt",
//     type: "necklace",
//     price: null,
//     image: "Images/products/dean_blunt_chain.webp",
//     description:
//       "dean blunt chain, made of high-quality stainless steel. Perfect for fans of the artist and those who love unique accessories.",
//     sizes: ["X", "XL", "S"],
//     stock: 2,
//   },

//   {
//     id: 2,
//     name: "Aphex Twin chain",
//     category: "accessories",
//     band: "Aphex Twin",
//     type: "necklace",
//     price: null,
//     image: "Images/products/aphex_twin_chain.webp",
//     description:
//       "aphex twin chain, made of high-quality stainless steel. Perfect for fans of the artist and those who love unique accessories.",
//     sizes: ["One size"],
//     stock: null,
//   },

//   {
//     id: 3,
//     name: "Cross Chain",
//     category: "accessories",
//     band: null,
//     type: "Chain",
//     price: null,
//     image: "Images/products/cross_chain.webp",
//     description:
//       "Elegant cross chain necklace made of stainless steel. A timeless accessory for any outfit.",
//     sizes: ["One Size"],
//     stock: null,
//   },
// ];


// // =========================================================
// // PRODUCT HELPERS
// // =========================================================

// // پیدا کردن محصول با شناسه
// function getProductById(id) {
//   return products.find(
//     (product) => Number(product.id) === Number(id)
//   );
// }


// // گرفتن محصولات بر اساس دسته‌بندی
// function getProductsByCategory(category) {
//   if (category === "all") {
//     return products;
//   }

//   return products.filter(
//     (product) => product.category === category
//   );
// }


// // جستجو در نام، گروه و نوع محصول
// function searchProducts(query) {
//   const lowerQuery = String(query || "").toLowerCase();

//   return products.filter(
//     (product) =>
//       product.name?.toLowerCase().includes(lowerQuery) ||
//       product.band?.toLowerCase().includes(lowerQuery) ||
//       product.type?.toLowerCase().includes(lowerQuery)
//   );
// }


// // =========================================================
// // CURRENCY DISPLAY ONLY
// // =========================================================
// //
// // این فایل دیگر سبد خرید را دستکاری نمی‌کند.
// // تمام محاسبات سبد، Promo Code، Discount و Total
// // توسط cart.js انجام می‌شود.
// //

// (function setupCurrencyDisplay() {

//   // تبدیل عدد به تومان
//   function formatToman(value) {
//     const number = Number(value);

//     if (!Number.isFinite(number)) {
//       return value;
//     }

//     return `${new Intl.NumberFormat("fa-IR").format(
//       Math.round(number)
//     )} تومان`;
//   }


//   // تبدیل متن‌های قدیمی مثل "$200" به "۲۰۰ تومان"
//   function formatCurrencyText(root) {

//     if (!root) {
//       return;
//     }

//     const walker = document.createTreeWalker(
//       root,
//       NodeFilter.SHOW_TEXT
//     );

//     const nodes = [];

//     let node;

//     while ((node = walker.nextNode())) {

//       // اسکریپت و CSS را دستکاری نکن
//       if (
//         node.parentElement?.closest(
//           "script, style, noscript"
//         )
//       ) {
//         continue;
//       }

//       if (
//         /\$\d+(?:\.\d{1,2})?/.test(
//           node.nodeValue
//         )
//       ) {
//         nodes.push(node);
//       }
//     }


//     nodes.forEach((textNode) => {

//       textNode.nodeValue =
//         textNode.nodeValue.replace(
//           /\$(\d+(?:\.\d{1,2})?)/g,
//           (_, value) =>
//             formatToman(value)
//         );

//     });

//   }


//   // فقط تبدیل واحد پول را انجام می‌دهیم.
//   // هیچ عنصر سبد خرید حذف یا تغییر داده نمی‌شود.
//   function startFormatting() {

//     if (!document.body) {
//       return;
//     }

//     formatCurrencyText(
//       document.body
//     );

//   }


//   // اجرای اولیه
//   if (
//     document.readyState === "loading"
//   ) {

//     document.addEventListener(
//       "DOMContentLoaded",
//       startFormatting,
//       {
//         once: true
//       }
//     );

//   } else {

//     startFormatting();

//   }

// })();
