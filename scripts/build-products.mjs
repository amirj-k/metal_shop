#!/usr/bin/env node
import * as fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = "https://nicherz.ir";
const DEFAULTS = {
  supabaseUrl: "https://upuqgnysdzqlxpfehqhp.supabase.co",
  publishableKey: "sb_publishable_6LUu00I0Jyqvufr7RC9Llg_asKqCMTF",
  bucket: "product_image"
};
const PUBLIC_FILES = new Set([
  "404.html", "account.html", "admin.html", "cart.html", "checkout.html", "contact.html",
  "index.html", "index-shop.html", "login.html", "orders.html", "payment.html",
  "product-detail.html", "recovery.html", "register.html", "reset-password.html",
  "account.css", "admin-custom-orders.css", "admin-payment.css", "admin-products.css", "admin.css", "auth.css",
  "cart.css", "checkout.css", "home.css", "index-header-fix.css", "manual-payment.css",
  "orders-payment.css", "orders.css", "password-reset.css", "payment.css",
  "product-detail.css", "style-shop.css", "style.css", "toast.css", "ui-ux-overrides.css",
  "account.js", "admin-custom-orders.js", "admin-products.js", "admin.js", "auth.js", "cart.js", "checkout.js",
  "config.js", "custom-order.js", "header-auth.js", "home-search.js", "home.js", "orders-custom.js", "orders-payment.js", "orders.js", "payment.js",
  "product-detail.js", "products.js", "recovery.js", "reset-password.js", "script.js",
  "shop.js", "toast.js", ".htaccess", "robots.txt"
]);
const SELECT = "id,name,slug,description,type,material,price,is_active,updated_at,categories(name,slug),product_variants(size,stock),product_images(storage_path,alt_text,is_primary,sort_order)";
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
const text = value => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const json = value => JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const regexEscape = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const productUrl = slug => `${SITE_URL}/product/${encodeURIComponent(slug)}`;

export function validateSlug(slug) {
  if (typeof slug !== "string" || !/^[\p{L}\p{N}][\p{L}\p{N}\p{M}_\-\u200c]*$/u.test(slug) || Buffer.byteLength(slug) > 200) {
    throw new Error(`Invalid product slug: ${JSON.stringify(slug)}`);
  }
  return slug;
}

function validateId(id) {
  if ((typeof id !== "string" && typeof id !== "number") || !/^[1-9][0-9]*$/.test(String(id)) || (typeof id === "number" && !Number.isSafeInteger(id))) {
    throw new Error("Invalid product id");
  }
  return String(id);
}

export function outputFilename(slug) {
  return `${createHash("sha256").update(validateSlug(slug)).digest("hex")}.html`;
}

export function validateCatalog(products) {
  const slugs = new Set();
  const ids = new Set();
  for (const product of products) {
    const key = validateSlug(product.slug).normalize("NFC").toLowerCase();
    const id = validateId(product.id);
    if (slugs.has(key) || ids.has(id)) throw new Error("Duplicate product slug or id");
    if (/^id-[1-9][0-9]*$/.test(product.slug) && product.slug !== `id-${id}`) throw new Error("Slug conflicts with legacy id route");
    slugs.add(key);
    ids.add(id);
  }
  return products;
}

export function resolveImage(value, options = {}) {
  const { supabaseUrl, bucket } = { ...DEFAULTS, ...options };
  let raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^(?:https?:)?\/\//i.test(raw)) {
    const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
    if (url.username || url.password) return "";
    const localHost = /^(localhost|127\.[\d.]+|10\.[\d.]+|192\.168\.[\d.]+|172\.(1[6-9]|2\d|3[01])\.[\d.]+|\[::1\])$/i.test(url.hostname);
    const knownHost = localHost || url.origin === new URL(supabaseUrl).origin || /\.supabase\.(co|in)$/i.test(url.hostname);
    if (!knownHost) return url.href;
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i);
    if (!match || !new Set([bucket, "product_image", "product-images"]).has(match[1])) {
      return !localHost && /^\/storage\/v1\/object\/public\//i.test(url.pathname) ? url.href : "";
    }
    raw = match[2];
  } else {
    if (/^[a-z][a-z\d+.-]*:/i.test(raw)) return "";
    raw = raw.replace(/^\/+/, "").replace(/^storage\/v1\/object\/(?:public|sign|authenticated)\//i, "");
    for (const prefix of new Set([bucket, "product_image", "product-images"])) {
      if (raw.startsWith(`${prefix}/`)) {
        raw = raw.slice(prefix.length + 1);
        break;
      }
    }
  }
  try {
    const parts = raw.split("/").map(part => decodeURIComponent(part));
    if (parts.some(part => !part || part === "." || part === ".." || /[\\/\x00-\x1f]/.test(part))) return "";
    return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(bucket)}/${parts.map(encodeURIComponent).join("/")}`;
  } catch {
    return "";
  }
}

export function formatPrice(value) {
  return Number.isFinite(Number(value)) && value !== null && value !== "" && Number(value) >= 0
    ? `${Math.round(Number(value)).toLocaleString("fa-IR")} تومان`
    : "قیمت در حال بررسی";
}

export function normalizeProduct(row, options = {}) {
  if (row?.is_active !== true) throw new Error("Catalog contains a non-public product");
  const variants = Array.isArray(row.product_variants) ? row.product_variants : [];
  const images = [...(Array.isArray(row.product_images) ? row.product_images : [])].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
  const image = images.find(item => item.is_primary) || images[0];
  const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  return {
    id: validateId(row.id), slug: validateSlug(row.slug),
    name: text(row.name) || `محصول ${row.id}`, description: text(row.description),
    type: text(row.type), material: text(row.material), categoryName: text(category?.name),
    price: row.price, stock: variants.reduce((sum, variant) => sum + Math.max(0, Number(variant.stock) || 0), 0),
    image: resolveImage(image?.storage_path, options), imageAlt: text(image?.alt_text) || text(row.name),
    updatedAt: row.updated_at
  };
}

export async function fetchProducts(options = {}) {
  const { supabaseUrl, publishableKey, fetchImpl = globalThis.fetch, timeoutMs = 15000, pageSize = 500, maxPages = 10000 } = { ...DEFAULTS, ...options };
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) throw new Error("A publishable Supabase key is required");
  if (!Number.isInteger(pageSize) || pageSize < 1 || !Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error("Invalid pagination or timeout settings");
  const products = [];
  let offset = 0;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/products`);
    url.search = new URLSearchParams({ select: SELECT, is_active: "eq.true", order: "id.asc", limit: String(pageSize), offset: String(offset) });
    const controller = new AbortController();
    let timer;
    try {
      const rows = await Promise.race([
        (async () => {
          const response = await fetchImpl(url, { headers: { apikey: publishableKey, Accept: "application/json" }, signal: controller.signal });
          if (!response.ok) throw new Error(`Supabase request failed (${response.status})`);
          const body = await response.json();
          if (!Array.isArray(body)) throw new Error("Expected a public catalog array");
          return body;
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("Public catalog request timed out"));
          }, timeoutMs);
        })
      ]);
      if (!rows.length) return validateCatalog(products);
      products.push(...rows.map(row => normalizeProduct(row, options)));
      validateCatalog(products);
      offset += rows.length;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Public catalog pagination limit reached");
}

export function seoFor(product) {
  const details = [product.type, product.material, product.categoryName].map(text).filter(Boolean).join(" · ");
  const description = /[\u0600-\u06ff]/.test(product.description)
    ? product.description
    : `${product.name}${details ? ` — ${details}` : ""} را از فروشگاه NICHERZ ببینید و خریداری کنید.`;
  return { title: `${purchaseLabel(product)} ${product.name} | NICHERZ`, description, details, url: productUrl(product.slug) };
}

export function purchaseLabel(product) {
  const type = text(product?.type).toLowerCase();
  const category = text(product?.categoryName).toLowerCase();
  return type === "album" || type === "albums" || type === "آلبوم" || category === "albums" || category === "آلبوم"
    ? "خرید آلبوم"
    : "خرید";
}

export function offerFor(product, url) {
  const price = Number(product?.price);
  if (!Number.isFinite(price) || price < 0) return null;
  return {
    "@type": "Offer",
    url,
    priceCurrency: "IRR",
    price: String(Math.round(price)),
    itemCondition: "https://schema.org/NewCondition",
    availability: Number(product?.stock) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
  };
}

function replaceContent(html, id, content) {
  const pattern = new RegExp(`(<([a-z][a-z0-9]*)\\b[^>]*\\bid=["']${id}["'][^>]*>)[\\s\\S]*?(<\\/\\2\\s*>)`, "gi");
  let count = 0;
  const result = html.replace(pattern, (_, open, tag, close) => {
    count++;
    return `${open}${content}${close}`;
  });
  if (count !== 1) throw new Error(`Template requires exactly one ${id}`);
  return result;
}

export function renderProductPage(product, template) {
  const id = validateId(product.id);
  const { title, description, url } = seoFor(product);
  const data = { "@context": "https://schema.org", "@type": "Product", name: product.name, description, url };
  if (product.categoryName) data.category = product.categoryName;
  if (product.image) data.image = product.image;
  const offer = offerFor(product, url);
  if (offer) data.offers = offer;
  const breadcrumbs = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "خانه", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "فروشگاه", item: `${SITE_URL}/shop` },
      { "@type": "ListItem", position: 3, name: product.name, item: url }
    ]
  };
  let html = template.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<body\b[^>]*>/i, tag => tag.replace(/\sdata-product-id\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/>$/, ` data-product-id="${id}">`))
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\b[^>]*(?:name|property)=["'](?:description|robots|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, "")
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, "")
    .replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\b(href|src)=("|')([^"']*)\2/gi, (match, attr, quote, value) => {
      if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#|\?)/i.test(value)) return match;
      return `${attr}=${quote}/${value.replace(/^\/?(?:\.\/)*|^\//, "")}${quote}`;
    });
  const values = { productBreadcrumbName: product.name, productName: product.name, productDescription: product.description || description, productType: product.type || "—", productPrice: formatPrice(product.price), productStock: `${product.stock > 0 ? "موجود" : "ناموجود"} — بررسی مجدد هنگام انتخاب`, productBand: product.categoryName };
  for (const [id, value] of Object.entries(values)) html = replaceContent(html, id, esc(value));
  html = replaceContent(html, "sizeOptions", "");
  let imageCount = 0;
  html = html.replace(/<img\b[^>]*\bid=["']productImage["'][^>]*>/gi, tag => {
    imageCount++;
    return tag.replace(/\s(?:src|alt|loading|fetchpriority)=["'][^"']*["']/gi, "").replace(/\s*\/?>$/, `${product.image ? ` src="${esc(product.image)}"` : ""} alt="${esc(product.imageAlt)}" loading="eager" fetchpriority="high">`);
  });
  if (imageCount !== 1) throw new Error("Template requires exactly one productImage");
  let buttonCount = 0;
  html = html.replace(/<button\b[^>]*\bid=["']addToCartBtn["'][^>]*>/gi, tag => {
    buttonCount++;
    return /\sdisabled(?:\s|=|>)/i.test(tag) ? tag : tag.replace(/>$/, " disabled>");
  });
  if (buttonCount !== 1 || !/<script\b[^>]*src=["']\/product-detail\.js(?:[?#][^"']*)?["']/i.test(html)) throw new Error("Template is missing live product hydration");
  html = html.replace(/(<section\b[^>]*class=["'][^"']*product-detail-container[^"']*["'][^>]*>)([\s\S]*?)(<\/section>)/i, (_, open, body, close) => {
    const balance = (body.match(/<div\b/gi) || []).length - (body.match(/<\/div\s*>/gi) || []).length;
    if (balance < 0 || balance > 1) throw new Error("Unexpected product template markup");
    return `${open}${body}${balance ? "</div>\n" : ""}${close}`;
  });
  const metadata = `<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="product">
<meta property="og:url" content="${esc(url)}">
<meta property="og:locale" content="fa_IR">
<meta property="og:site_name" content="NICHERZ">
<meta name="twitter:card" content="${product.image ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
${product.image ? `<meta property="og:image" content="${esc(product.image)}">\n<meta name="twitter:image" content="${esc(product.image)}">` : ""}
<script id="productJsonLd" type="application/ld+json">${json(data)}</script>
<script id="breadcrumbJsonLd" type="application/ld+json">${json(breadcrumbs)}</script>`;
  if (!/<\/head>/i.test(html)) throw new Error("Template has no head");
  return html.replace(/<\/head>/i, () => `${metadata}\n</head>`);
}

export function renderSitemap(products) {
  const urls = ["/", "/shop", "/contact"].map(path => `<url><loc>${SITE_URL}${path}</loc></url>`);
  for (const product of products) {
    const date = product.updatedAt;
    const valid = typeof date === "string" && /^\d{4}-\d\d-\d\d(?:T| )\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d(?::?\d\d)?)$/.test(date) && Number.isFinite(Date.parse(date));
    urls.push(`<url><loc>${esc(productUrl(product.slug))}</loc>${valid ? `<lastmod>${new Date(date).toISOString()}</lastmod>` : ""}</url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

export function mergeHistory(history, products) {
  if (!history || typeof history !== "object" || Array.isArray(history)) throw new Error("Invalid slug history");
  const next = Object.create(null);
  for (const [slug, id] of Object.entries(history)) {
    next[validateSlug(slug)] = validateId(id);
    if (/^id-[1-9][0-9]*$/.test(slug) && slug !== `id-${id}`) throw new Error("Historical slug conflicts with legacy id route");
  }
  for (const product of validateCatalog(products)) {
    if (Object.hasOwn(next, product.slug) && next[product.slug] !== String(product.id)) throw new Error("Historical slug belongs to another product");
    next[product.slug] = String(product.id);
  }
  const keys = new Set();
  for (const slug of Object.keys(next)) {
    const key = slug.normalize("NFC").toLowerCase();
    if (keys.has(key)) throw new Error("Colliding historical slugs");
    keys.add(key);
  }
  return next;
}

export function renderHtaccess(source, products, history) {
  if (!/^RewriteEngine\s+On\s*$/im.test(source)) throw new Error("Root routing requires RewriteEngine On");
  const active = new Map(products.map(product => [String(product.id), product]));
  const rules = [];
  for (const product of products) {
    const id = regexEscape(validateId(product.id));
    const target = productUrl(product.slug);
    rules.push(`RewriteCond %{QUERY_STRING} (?:^|&)id=0*${id}(?:&|$) [NC]`, `RewriteRule ^(?:product(?:-detail)?(?:\\.html)?)/?$ ${target} [R=301,L,NE,QSD]`);
    if (product.slug !== `id-${product.id}`) rules.push(`RewriteRule ^product/id-${id}(?:\\.html)?/?$ ${target} [R=301,L,NE,QSD]`);
  }
  for (const [slug, id] of Object.entries(history)) {
    const product = active.get(String(id));
    if (!product) rules.push(`RewriteRule ^product/${regexEscape(slug)}(?:\\.html)?/?$ - [R=404,L]`);
    else if (slug !== product.slug) rules.push(`RewriteRule ^product/${regexEscape(slug)}(?:\\.html)?/?$ ${productUrl(product.slug)} [R=301,L,NE,QSD]`);
  }
  for (const product of products) {
    const slug = regexEscape(product.slug);
    const target = productUrl(product.slug);
    rules.push(`RewriteRule ^product/${slug}/$ ${target} [R=301,L,NE]`);
    rules.push(`RewriteCond %{HTTPS} on`, `RewriteCond %{HTTP_HOST} ^nicherz\\.ir$ [NC]`);
    rules.push(`RewriteRule ^product/${slug}$ product/${outputFilename(product.slug)} [END]`);
  }
  return source.replace(/^RewriteEngine\s+On[^\S\r\n]*$/im, match => `${match}\n${rules.join("\n")}\n`);
}

async function readHistory(io, path) {
  try {
    return JSON.parse(await io.readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function copyPublic(io, root, stage) {
  for (const entry of await io.readdir(root, { withFileTypes: true })) {
    if (PUBLIC_FILES.has(entry.name)) {
      if (!entry.isFile()) throw new Error(`Public file is not a regular file: ${entry.name}`);
      await io.copyFile(join(root, entry.name), join(stage, entry.name));
    }
  }
  async function copyDirectory(from, to, extensions) {
    let entries;
    try {
      entries = await io.readdir(from, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    await io.mkdir(to, { recursive: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isSymbolicLink()) throw new Error("Symlinks are not allowed in public assets");
      if (entry.isDirectory()) await copyDirectory(join(from, entry.name), join(to, entry.name), extensions);
      else if (entry.isFile() && extensions.test(entry.name)) await io.copyFile(join(from, entry.name), join(to, entry.name));
    }
  }
  for (const [directory, extensions] of [["js", /\.js$/i], ["Images", /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm)$/i]]) {
    const source = join(root, directory);
    try {
      if ((await io.lstat(source)).isSymbolicLink()) throw new Error("Public asset directory cannot be a symlink");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await copyDirectory(source, join(stage, directory), extensions);
  }
}

export async function buildProducts(options = {}) {
  const { root = ROOT, io = fs } = options;
  const output = join(root, "dist");
  const historyPath = join(root, "scripts", "slug-history.json");
  const lock = join(root, "scripts", ".build-products-lock");
  const token = randomUUID();
  const stage = join(root, `.dist-stage-${token}`);
  const backup = join(root, `.dist-backup-${token}`);
  const historyTemp = join(root, "scripts", `.slug-history-${token}.json`);
  await io.mkdir(lock);
  let previous = false;
  let promoted = false;
  let committed = false;
  try {
    const products = await fetchProducts(options);
    const history = mergeHistory(await readHistory(io, historyPath), products);
    const template = await io.readFile(join(root, "product-detail.html"), "utf8");
    const routing = await io.readFile(join(root, ".htaccess"), "utf8");
    await io.readFile(join(root, "robots.txt"), "utf8");
    await io.mkdir(stage);
    await copyPublic(io, root, stage);
    await io.mkdir(join(stage, "product"));
    for (const product of products) await io.writeFile(join(stage, "product", outputFilename(product.slug)), renderProductPage(product, template), "utf8");
    await io.writeFile(join(stage, "sitemap.xml"), renderSitemap(products), "utf8");
    await io.writeFile(join(stage, ".htaccess"), renderHtaccess(routing, products, history), "utf8");
    await io.writeFile(historyTemp, `${JSON.stringify(history, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    try {
      await io.rename(output, backup);
      previous = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await io.rename(stage, output);
    promoted = true;
    await io.rename(historyTemp, historyPath);
    committed = true;
    return { products: products.length, output };
  } catch (error) {
    if (promoted) await io.rm(output, { recursive: true, force: true });
    if (previous) await io.rename(backup, output);
    throw error;
  } finally {
    await Promise.all([stage, historyTemp, lock, ...(committed ? [backup] : [])].map(path => io.rm(path, { recursive: true, force: true }).catch(() => {})));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildProducts({
    supabaseUrl: process.env.SUPABASE_URL || DEFAULTS.supabaseUrl,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || DEFAULTS.publishableKey,
    bucket: process.env.SUPABASE_PRODUCT_BUCKET || DEFAULTS.bucket
  }).then(result => console.log(`Built ${result.products} public product pages in ${result.output}`)).catch(error => {
    console.error(`Product build failed: ${error.message}`);
    process.exitCode = 1;
  });
}
