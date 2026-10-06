import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  buildProducts, fetchProducts, formatPrice, mergeHistory, normalizeProduct,
  offerFor, outputFilename, renderHtaccess, renderProductPage, renderSitemap, resolveImage,
  seoFor, validateCatalog, validateSlug
} from "../scripts/build-products.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const template = await fs.readFile(join(root, "product-detail.html"), "utf8");
const row = (id = 1, slug = "test-product") => ({
  id, slug, name: "Test product", description: "A public product description", type: "تی‌شرت",
  material: "پنبه", price: 125000, is_active: true, updated_at: "2026-01-02T03:04:05Z",
  categories: { name: "Band merch", slug: "band-merch" },
  product_variants: [{ size: "M", stock: 3 }],
  product_images: [{ storage_path: "product-images/test.webp", alt_text: "Product image", is_primary: true }]
});
const product = (id = 1, slug = "test-product") => normalizeProduct(row(id, slug));
const mockFetch = rows => async url => ({
  ok: true,
  json: async () => rows.slice(Number(url.searchParams.get("offset")), Number(url.searchParams.get("offset")) + Number(url.searchParams.get("limit")))
});

async function fixture(t) {
  const base = process.platform === "win32" ? join(tmpdir(), "opencode") : tmpdir();
  const path = await fs.mkdtemp(join(base, "build-products-test-"));
  t.after(() => fs.rm(path, { recursive: true, force: true }));
  await fs.mkdir(join(path, "scripts"));
  await fs.mkdir(join(path, "js"));
  await fs.mkdir(join(path, "Images"));
  await fs.writeFile(join(path, "product-detail.html"), template);
  await fs.writeFile(join(path, ".htaccess"), "RewriteEngine On\nRewriteRule ^product/?$ product-detail.html [L,QSA]\n");
  await fs.writeFile(join(path, "robots.txt"), "User-agent: *\nAllow: /\n");
  await fs.writeFile(join(path, "index.html"), "public homepage");
  await fs.writeFile(join(path, "style-shop.css"), "body {}");
  await fs.writeFile(join(path, "product-detail.js"), "export {};");
  await fs.writeFile(join(path, "js", "supabase.js"), "export {};");
  await fs.writeFile(join(path, "Images", "product.webp"), "image");
  return path;
}

async function snapshot(path) {
  const result = {};
  for (const entry of await fs.readdir(path, { withFileTypes: true })) {
    result[entry.name] = entry.isDirectory() ? await snapshot(join(path, entry.name)) : (await fs.readFile(join(path, entry.name))).toString("base64");
  }
  return result;
}

test("PostgREST uses one nested select, apikey only, and continues through server-capped pages", async () => {
  const rows = [row(1, "one"), row(2, "two"), row(3, "سه")];
  const offsets = [];
  const products = await fetchProducts({
    pageSize: 500,
    fetchImpl: async (url, init) => {
      assert.equal(url.searchParams.getAll("select").length, 1);
      assert.match(url.searchParams.get("select"), /categories\(name,slug\),product_variants\(size,stock\),product_images\(/);
      assert.equal(url.searchParams.get("is_active"), "eq.true");
      assert.equal(url.searchParams.get("order"), "id.asc");
      assert.equal([...url.searchParams.keys()].length, 5);
      assert.match(init.headers.apikey, /^sb_publishable_/);
      assert.equal(Object.keys(init.headers).some(key => key.toLowerCase() === "authorization"), false);
      assert.ok(init.signal instanceof AbortSignal);
      const offset = Number(url.searchParams.get("offset"));
      offsets.push(offset);
      return { ok: true, json: async () => rows.slice(offset, offset + 1) };
    }
  });
  assert.deepEqual(offsets, [0, 1, 2, 3]);
  assert.equal(products.length, 3);
});

test("fetch fails closed on HTTP, malformed, inactive, duplicate, and non-public-key inputs", async () => {
  await assert.rejects(fetchProducts({ fetchImpl: async () => ({ ok: false, status: 403 }) }), /403/);
  await assert.rejects(fetchProducts({ fetchImpl: async () => ({ ok: true, json: async () => ({ error: "bad" }) }) }), /array/);
  await assert.rejects(fetchProducts({ fetchImpl: mockFetch([{ ...row(), is_active: false }]) }), /non-public/);
  await assert.rejects(fetchProducts({ fetchImpl: async () => ({ ok: true, json: async () => [row()] }) }), /Duplicate/);
  await assert.rejects(fetchProducts({ publishableKey: "service-role-secret", fetchImpl: () => assert.fail("must not fetch") }), /publishable/);
});

test("timeout covers connection and body reads", async () => {
  for (const bodyStalls of [false, true]) {
    let signal;
    const stalled = () => new Promise(() => {});
    await assert.rejects(fetchProducts({
      timeoutMs: 10,
      fetchImpl: async (_, init) => {
        signal = init.signal;
        return bodyStalls ? { ok: true, json: stalled } : stalled();
      }
    }), /timed out/);
    assert.equal(signal.aborted, true);
  }
});

test("exact Unicode and case identities use portable hashed output filenames", () => {
  for (const slug of ["تی‌شرت-متال", "Été", "e\u0301te", "CON", "Mixed_CASE", "中文-商品"]) {
    assert.equal(validateSlug(slug), slug);
    assert.equal(normalizeProduct(row(1, slug)).slug, slug);
    assert.match(outputFilename(slug), /^[a-f0-9]{64}\.html$/);
  }
  assert.notEqual(outputFilename("Été"), outputFilename("été"));
  for (const slug of [null, "", " ../x", "../x", "a/b", "a\\b", "%2e%2e", "x?y", "x#y", "x\n", "x.", " x", "x ", "x\u202ey", "a".repeat(201)]) {
    assert.throws(() => validateSlug(slug), /Invalid/);
  }
  assert.throws(() => validateCatalog([product(1, "A"), product(2, "a")]), /Duplicate/);
  assert.throws(() => validateCatalog([product(1, "é"), product(2, "e\u0301")]), /Duplicate/);
  assert.throws(() => validateCatalog([product(1, "id-2")]), /legacy/);
  assert.throws(() => normalizeProduct(row(Number.MAX_SAFE_INTEGER + 1)), /id/);
});

test("images migrate local and legacy storage to configured production without rewriting external images", () => {
  const options = { supabaseUrl: "https://production.supabase.co", bucket: "catalog" };
  const expected = "https://production.supabase.co/storage/v1/object/public/catalog/folder/a%20b.webp";
  for (const value of [
    "folder/a b.webp", "product_image/folder/a%20b.webp", "product-images/folder/a b.webp",
    "http://127.0.0.1:54321/storage/v1/object/public/product-images/folder/a%20b.webp",
    "http://localhost:54321/storage/v1/object/sign/product_image/folder/a%20b.webp?token=private",
    "https://legacy.supabase.co/storage/v1/object/authenticated/product_image/folder/a%20b.webp?token=private",
    "/storage/v1/object/public/product_image/folder/a%20b.webp"
  ]) assert.equal(resolveImage(value, options), expected);
  const external = "https://images.example.com/storage/v1/object/public/product-images/photo.webp?width=900";
  assert.equal(resolveImage(external, options), external);
  for (const value of ["javascript:alert(1)", "data:image/png;base64,abc", "../secret", "%2e%2e/secret", "a/%2fsecret", "https://user:pass@example.com/photo", "http://localhost:54321/private", "https://legacy.supabase.co/storage/v1/object/sign/private/a?token=secret"]) {
    assert.equal(resolveImage(value, options), "");
  }
});

test("template hydration IDs, assets, static content and disabled purchase survive generation", () => {
  const item = product(1, "تی‌شرت");
  const html = renderProductPage(item, template);
  for (const id of ["productName", "productDescription", "productType", "productPrice", "productStock", "productBand", "productImage", "sizeOptions", "qtyInput", "qtyDecrease", "qtyIncrease", "addToCartBtn", "relatedProductsGrid", "auth-nav"]) {
    assert.equal([...html.matchAll(new RegExp(`id=["']${id}["']`, "g"))].length, 1, id);
  }
  assert.match(html, /<h1[^>]*id="productName"[^>]*>Test product<\/h1>/);
  assert.match(html, /id="productDescription"[^>]*>A public product description<\/p>/);
  assert.match(html, /<button[^>]*id="addToCartBtn"[^>]*\sdisabled[^>]*>/);
  assert.match(html, /src="\/product-detail\.js(?:[?#][^"]*)?"/);
  assert.match(html, /href="\/style-shop\.css(?:[?#][^"]*)?"/);
  assert.match(html, /src="\/Images\/logo.webp"/);
  assert.equal((html.match(/<div\b/g) || []).length, (html.match(/<\/div>/g) || []).length);
  assert.equal((html.match(/تومان/g) || []).length, 1);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<body data-product-id="1">/);
  assert.match(html, /id="productBreadcrumbName"[^>]*>Test product<\/span>/);
  assert.equal((html.match(/property="og:site_name" content="NICHERZ"/g) || []).length, 1);
  const existingBody = renderProductPage(item, template.replace("<body>", '<body class="detail" data-product-id="999">'));
  assert.match(existingBody, /<body class="detail" data-product-id="1">/);
  assert.throws(() => renderProductPage({ ...item, id: '1" onclick="bad' }, template), /Invalid product id/);
  assert.throws(() => renderProductPage(item, template.replace('id="productType"', 'id="missingType"')), /productType/);
});

test("SEO uses Persian browser intent and JSON-LD cannot close its script", () => {
  const item = { ...product(), name: 'Literal </script><script>alert("x")</script> $&', description: "توضیحات فارسی </script> محصول" };
  const html = renderProductPage(item, template);
  assert.equal(seoFor(item).description, item.description);
  assert.match(seoFor(product()).description, /را از فروشگاه NICHERZ ببینید و خریداری کنید/);
  assert.match(seoFor(product()).title, /^خرید Test product \| NICHERZ$/);
  assert.match(seoFor({ ...product(), type: "Album" }).title, /^خرید آلبوم /);
  assert.match(seoFor({ ...product(), type: "album" }).title, /^خرید آلبوم /);
  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 2);
  const data = blocks.map(match => JSON.parse(match[1]));
  assert.equal(data[0].name, item.name);
  assert.equal(data[0].description, item.description);
  assert.equal(data[1]["@type"], "BreadcrumbList");
  assert.equal(data[1].itemListElement.length, 3);
  for (const field of ["brand", "manufacturer", "aggregateRating", "review", "potentialAction"]) assert.equal(Object.hasOwn(data[0], field), false);
  assert.equal(data[0].offers["@type"], "Offer");
  assert.equal(data[0].offers.priceCurrency, "IRR");
  assert.equal(data[0].offers.price, "125000");
  assert.equal(data[0].offers.availability, "https://schema.org/InStock");
  assert.equal(data[0].offers.url, seoFor(item).url);
  assert.equal(offerFor({ ...product(), price: "bad" }, seoFor(item).url), null);
  assert.equal(html.includes('<script>alert("x")'), false);
  assert.equal(html.includes("SearchAction"), false);
  assert.equal(formatPrice(null), "قیمت در حال بررسی");
});

test("sitemap uses real timestamps only and URL-encodes exact Unicode", () => {
  const xml = renderSitemap([product(1, "تی‌شرت"), { ...product(2, "two"), updatedAt: null }, { ...product(3, "three"), updatedAt: "bad" }]);
  assert.equal((xml.match(/<lastmod>/g) || []).length, 1);
  assert.match(xml, /<lastmod>2026-01-02T03:04:05.000Z<\/lastmod>/);
  assert.ok(xml.includes(encodeURIComponent("تی‌شرت")));
});

test("history keeps removed products, refuses ownership collisions and produces real root redirects", () => {
  const products = [product(1, "تی‌شرت")];
  const history = mergeHistory({ old: 1, inactive: 2 }, products);
  assert.equal(history.inactive, "2");
  assert.throws(() => mergeHistory({ "تی‌شرت": 3 }, products), /another product/);
  assert.throws(() => mergeHistory({ "../bad": 1 }, products), /Invalid/);
  assert.throws(() => mergeHistory([], products), /Invalid/);
  const rules = renderHtaccess("RewriteEngine On\nRewriteRule ^product/?$ product-detail.html [L]\n", products, history);
  assert.match(rules, /QUERY_STRING.*id=0\*1/);
  const queryPattern = new RegExp(rules.match(/RewriteCond %\{QUERY_STRING\} (\S+) \[NC\]/)[1], "i");
  for (const query of ["id=1", "id=0001", "ref=shop&id=01&x=2", "ID=001"]) assert.ok(queryPattern.test(query), query);
  for (const query of ["id=10", "id=0", "id=0002", "otherid=1", "id=1x"]) assert.equal(queryPattern.test(query), false, query);
  assert.match(rules, /RewriteRule \^product\/old.*\[R=301,L,NE,QSD\]/);
  assert.match(rules, /RewriteRule \^product\/id-1/);
  assert.ok(rules.indexOf("QUERY_STRING") < rules.indexOf("product-detail.html"));
  assert.ok(rules.includes(`product/${outputFilename("تی‌شرت")} [END]`));
  assert.ok(rules.includes(encodeURIComponent("تی‌شرت")));
  const retiredRule = rules.split("\n").find(line => line.startsWith("RewriteRule ^product/inactive"));
  assert.ok(retiredRule.endsWith(" - [R=404,L]"));
  const retiredPattern = new RegExp(retiredRule.split(" ")[1]);
  for (const path of ["product/inactive", "product/inactive/", "product/inactive.html", "product/inactive.html/"]) assert.ok(retiredPattern.test(path), path);
  assert.equal(retiredPattern.test("product/inactive-other"), false);
  assert.ok(rules.indexOf(retiredRule) < rules.indexOf("product-detail.html"));
});

test("fresh allowlisted artifact cleans removed pages, preserves history and excludes private files", async t => {
  const path = await fixture(t);
  await fs.mkdir(join(path, ".git"));
  for (const file of ["secret.sql", ".env", "package.json", "private.js"]) await fs.writeFile(join(path, file), "never public");
  await fs.writeFile(join(path, "Images", "secret.sql"), "never public");
  await fs.writeFile(join(path, "js", ".env"), "never public");
  await buildProducts({ root: path, fetchImpl: mockFetch([row(1, "old"), row(2, "removed")]) });
  const result = await buildProducts({ root: path, fetchImpl: mockFetch([row(1, "new")]) });
  assert.equal(result.products, 1);
  assert.deepEqual(await fs.readdir(join(path, "dist", "product")), [outputFilename("new")]);
  const files = await fs.readdir(join(path, "dist"));
  for (const name of ["index.html", "style-shop.css", "product-detail.js", "js", "Images", ".htaccess", "robots.txt", "sitemap.xml", "product"]) assert.ok(files.includes(name), name);
  for (const name of ["scripts", "tests", ".git", ".env", "secret.sql", "package.json", "private.js", "slug-history.json"]) assert.equal(files.includes(name), false, name);
  assert.deepEqual(await fs.readdir(join(path, "dist", "Images")), ["product.webp"]);
  assert.deepEqual(await fs.readdir(join(path, "dist", "js")), ["supabase.js"]);
  const history = JSON.parse(await fs.readFile(join(path, "scripts", "slug-history.json"), "utf8"));
  assert.deepEqual(history, { old: "1", removed: "2", new: "1" });
  const routes = await fs.readFile(join(path, "dist", ".htaccess"), "utf8");
  assert.match(routes, /\^product\/old.*https:\/\/nicherz.ir\/product\/new \[R=301/);
  assert.match(routes, /RewriteRule \^product\/removed.* - \[R=404,L\]/);
  assert.equal((await fs.readdir(path)).some(name => name.startsWith(".dist-")), false);
});

test("network, staging write, swap and history failures preserve previous artifact and history", async t => {
  const path = await fixture(t);
  await buildProducts({ root: path, fetchImpl: mockFetch([row(1, "before")]) });
  const before = await snapshot(join(path, "dist"));
  const historyBefore = await fs.readFile(join(path, "scripts", "slug-history.json"), "utf8");
  for (const mode of ["network", "write", "swap", "history"]) {
    const io = { ...fs };
    if (mode === "write") io.writeFile = async (file, ...args) => {
      if (file.includes(".dist-stage-") && file.endsWith("sitemap.xml")) throw new Error("injected write failure");
      return fs.writeFile(file, ...args);
    };
    if (mode === "swap" || mode === "history") io.rename = async (from, to) => {
      if ((mode === "swap" && from.includes(".dist-stage-")) || (mode === "history" && to.endsWith("slug-history.json"))) throw new Error(`injected ${mode} failure`);
      return fs.rename(from, to);
    };
    await assert.rejects(buildProducts({ root: path, io, fetchImpl: mode === "network" ? async () => { throw new Error("injected network failure"); } : mockFetch([row(1, "after")]) }), /injected/);
    assert.deepEqual(await snapshot(join(path, "dist")), before, mode);
    assert.equal(await fs.readFile(join(path, "scripts", "slug-history.json"), "utf8"), historyBefore, mode);
    assert.equal((await fs.readdir(path)).some(name => name.startsWith(".dist-")), false, mode);
  }
});

test("corrupt history is not silently reset and concurrent build lock fails closed", async t => {
  const path = await fixture(t);
  await fs.writeFile(join(path, "scripts", "slug-history.json"), "not json");
  await assert.rejects(buildProducts({ root: path, fetchImpl: mockFetch([row()]) }), SyntaxError);
  assert.equal(await fs.readFile(join(path, "scripts", "slug-history.json"), "utf8"), "not json");
  await fs.mkdir(join(path, "scripts", ".build-products-lock"));
  await assert.rejects(buildProducts({ root: path, fetchImpl: () => assert.fail("locked build must not fetch") }), { code: "EEXIST" });
});
