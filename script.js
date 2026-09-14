import { supabase } from "./js/supabase.js";

const bandsContainer = document.getElementById("bands-container");
const searchInput = document.getElementById("bandSearch");

const placeholder =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="100%25" height="100%25" fill="%230a0a0a"/><text x="50%25" y="50%25" fill="%23ffffff" font-size="28" font-family="Arial" dominant-baseline="middle" text-anchor="middle">No Image</text></svg>';

let bands = [];

const normalizeBand = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

function getBandImageUrl(imageUrl) {
  if (!imageUrl) return "";
  const raw = String(imageUrl).trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) return raw;
  return raw;
}

function renderBands(bandsToRender) {
  bandsContainer.innerHTML = "";

  if (bandsToRender.length === 0) {
    const noResult = document.createElement("p");
    noResult.textContent = "No band found.";
    noResult.classList.add("no-results");
    bandsContainer.appendChild(noResult);
    return;
  }

  const fragment = document.createDocumentFragment();

  bandsToRender.forEach((band) => {
    const newCard = document.createElement("div");
    newCard.classList.add("card");

    const bandImage = document.createElement("img");
    bandImage.classList.add("band-img");
    bandImage.alt = band.name || "Band";
    bandImage.decoding = "async";
    bandImage.loading = "lazy";
    bandImage.src = getBandImageUrl(band.image_url) || placeholder;

    if (!band.image_url) bandImage.classList.add("no-image");

    bandImage.addEventListener("error", () => {
      if (bandImage.src !== placeholder) {
        bandImage.src = placeholder;
        bandImage.classList.add("no-image");
      }
    });

    newCard.appendChild(bandImage);

    const bandName = document.createElement("h3");
    bandName.textContent = band.name || "Unnamed Band";
    newCard.appendChild(bandName);

    const bandQuote = document.createElement("p");
    bandQuote.textContent = band.quote ? `"${band.quote.replace(/^"|"$/g, "")}"` : "";
    bandQuote.classList.add("quote");
    newCard.appendChild(bandQuote);

    const bandInfo = document.createElement("p");
    const genre = band.genre || "";
    const year = band.founded_year ? `Since ${band.founded_year}` : "";
    bandInfo.textContent = [genre, year].filter(Boolean).join(" | ");
    bandInfo.classList.add("info");
    newCard.appendChild(bandInfo);

    const shopLink = document.createElement("a");
    shopLink.classList.add("Bio");
    shopLink.href = `/shop?band=${encodeURIComponent(band.name)}`;
    shopLink.textContent = "Related Products";
    newCard.appendChild(shopLink);

    fragment.appendChild(newCard);
  });

  bandsContainer.appendChild(fragment);
}

async function loadBands() {
  bandsContainer.innerHTML = "<p class=\"no-results\">Loading bands...</p>";

  const { data, error } = await supabase
    .from("bands")
    .select("id, name, slug, description, image_url, quote, genre, founded_year, is_featured, sort_order")
    .eq("is_featured", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to load bands:", error);
    bandsContainer.innerHTML = "";
    const errorMessage = document.createElement("p");
    errorMessage.classList.add("no-results");
    errorMessage.textContent = "Unable to load bands.";
    bandsContainer.appendChild(errorMessage);
    return;
  }

  bands = data || [];
  renderBands(bands);
}

if (searchInput) {
  searchInput.addEventListener("input", () => {
    const searchValue = normalizeBand(searchInput.value);
    if (searchValue === "") {
      renderBands(bands);
      return;
    }
    const filteredBands = bands.filter((band) => normalizeBand(band.name).includes(searchValue));
    renderBands(filteredBands);
  });
}

loadBands();
