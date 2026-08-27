/**
 * Horizon overrides for Shopify.actions:
 * - updateCart: emit events from the cart drawer scope.
 * - openCart: open the cart drawer (fall back to /cart when absent).
 */

function init() {
  const actions = window.Shopify?.actions;
  if (!actions) return;

  actions.updateCart.configure({
    eventTarget: () => document.querySelector('theme-drawer#cart-drawer') ?? document,
  });

  actions.openCart.configure({
    async handler() {
      /** @type {HTMLElement & {open?: () => void} | null} */
      const drawer = document.querySelector('theme-drawer#cart-drawer');

      if (drawer?.open) {
        drawer.open();
      } else {
        window.location.href = Theme.routes.cart_url || '/cart';
      }
    },
  });
}

// Run immediately if the standard-actions bundle has already attached
// `Shopify.actions`; otherwise wait for DOMContentLoaded, which fires after
// all module scripts have executed regardless of document order.
if (window.Shopify?.actions) {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init, { once: true });
}

/**
 * Old publisher links from search pages can still contain `filter.p.vendor`.
 * Collection/category pages must keep `filter.p.vendor` as an in-page filter,
 * so this safeguard only normalizes search-page links.
 */
function normalizePublisherVendorUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    const vendor = parsed.searchParams.get('filter.p.vendor');

    if (!vendor) return null;

    if (parsed.pathname === '/search') {
      return `/collections/vendors?q=${encodeURIComponent(vendor)}${parsed.hash || ''}`;
    }
  } catch (error) {
    return null;
  }

  return null;
}

function rewritePublisherVendorLinks() {
  document.querySelectorAll('a[href*="filter.p.vendor"]').forEach((link) => {
    const normalizedUrl = normalizePublisherVendorUrl(link.href);

    if (normalizedUrl) {
      link.href = normalizedUrl;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', rewritePublisherVendorLinks, { once: true });
} else {
  rewritePublisherVendorLinks();
}

document.addEventListener(
  'click',
  (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const link = target ? target.closest('a[href*="filter.p.vendor"]') : null;

    if (!link) return;

    const normalizedUrl = normalizePublisherVendorUrl(link.href);

    if (!normalizedUrl) return;

    event.preventDefault();
    window.location.href = normalizedUrl;
  },
  true
);

document.addEventListener('shopify:section:load', rewritePublisherVendorLinks);

/**
 * Publisher chips inside collection heroes use the same in-page search box.
 * Clicking a chip simply places the publisher name in the collection search and
 * runs the already-working catalogue filter on the same page.
 */
function initCollectionPublisherChips() {
  const chips = Array.from(document.querySelectorAll('.bookstore-category-publishers a'));
  const input = document.querySelector('[data-bookstore-collection-search-input], input[name="collection_search"]');
  const url = new URL(window.location.href);
  const initialVendor = url.searchParams.get('filter.p.vendor') || '';
  const initialSearch = url.searchParams.get('collection_search') || '';

  if (!chips.length) return;

  const getChipSearchValue = (link) => {
    try {
      const parsed = new URL(link.href, window.location.origin);
      return parsed.searchParams.get('collection_search') || parsed.searchParams.get('filter.p.vendor') || link.textContent.trim();
    } catch (error) {
      return link.textContent.trim();
    }
  };

  const setActiveChip = (value) => {
    const normalizedValue = normalizeCollectionSearchText(value);

    chips.forEach((chip) => {
      const normalizedChip = normalizeCollectionSearchText(getChipSearchValue(chip));
      const isActive = normalizedValue && normalizedChip === normalizedValue;

      chip.style.display = normalizedValue && !isActive ? 'none' : '';

      if (isActive) {
        chip.setAttribute('aria-current', 'page');
      } else {
        chip.removeAttribute('aria-current');
      }
    });
  };

  chips.forEach((link) => {
    if (link.dataset.publisherChipFilterReady === 'true') return;

    link.dataset.publisherChipFilterReady = 'true';
    link.addEventListener('click', (event) => {
      event.preventDefault();

      const searchValue = getChipSearchValue(link);

      if (input) {
        input.value = searchValue;
        input.focus();
      }

      applyCollectionPageSearch(searchValue, true, true);
      setActiveChip(searchValue);
    });
  });

  if (initialVendor && input) {
    input.value = initialSearch;
    applyCollectionVendorFilterFromURL(true);
    setActiveChip(initialVendor);
  } else {
    setActiveChip(initialSearch);
  }
}

function getCollectionVendorFilter() {
  const url = new URL(window.location.href);
  return url.searchParams.get('filter.p.vendor') || '';
}

function getCollectionPublisherChipValue(link) {
  try {
    const parsed = new URL(link.href, window.location.origin);
    return parsed.searchParams.get('collection_search') || parsed.searchParams.get('filter.p.vendor') || link.textContent.trim();
  } catch (error) {
    return link.textContent.trim();
  }
}

function syncCollectionPublisherChips(query) {
  const chips = Array.from(document.querySelectorAll('.bookstore-category-publishers a'));
  const normalizedQuery = normalizeCollectionSearchText(query);

  if (!chips.length) return;

  const hasExactPublisher = normalizedQuery && chips.some((chip) => {
    return normalizeCollectionSearchText(getCollectionPublisherChipValue(chip)) === normalizedQuery;
  });

  chips.forEach((chip) => {
    const isActive = hasExactPublisher && normalizeCollectionSearchText(getCollectionPublisherChipValue(chip)) === normalizedQuery;

    chip.style.display = hasExactPublisher && !isActive ? 'none' : '';

    if (isActive) {
      chip.setAttribute('aria-current', 'page');
    } else {
      chip.removeAttribute('aria-current');
    }
  });
}

function productItemMatchesVendor(item, vendor) {
  const normalizedVendor = normalizeCollectionSearchText(vendor);
  if (!normalizedVendor) return true;

  const exactVendor = normalizeCollectionSearchText(item.getAttribute('data-bookstore-product-vendor') || '');
  if (exactVendor) return exactVendor === normalizedVendor;

  const rawText = item.getAttribute('data-collection-search-text') || item.textContent || '';
  const searchableText = normalizeCollectionSearchText(rawText);

  return normalizedVendor.split(' ').filter(Boolean).every((token) => searchableText.includes(token));
}

function productItemMatchesSearch(item, query) {
  const normalizedQuery = normalizeCollectionSearchText(query);
  if (!normalizedQuery) return true;

  const rawText = item.getAttribute('data-collection-search-text') || item.textContent || '';
  const searchableText = normalizeCollectionSearchText(rawText);
  const words = searchableText.split(' ').filter(Boolean);

  return normalizedQuery.split(' ').filter(Boolean).every((token) => {
    return words.some((word) => word.startsWith(token));
  });
}

function getCollectionTotalCount() {
  const countNode = document.querySelector('main[data-template^="collection"] [data-bookstore-visible-count]');
  const rawCount = countNode?.getAttribute('data-bookstore-total-count') || countNode?.dataset.bookstoreOriginalCount || '';
  const parsed = Number(String(rawCount).replace(/[^\d]/g, ''));

  if (Number.isFinite(parsed) && parsed > 0) return parsed;

  const grid = getCollectionSearchGrid();
  const fallback = Number(grid?.dataset.bookstoreOriginalItemCount || 0);

  return Number.isFinite(fallback) && fallback > 0 ? fallback : getCollectionSearchItems().length;
}

function setCollectionVisibleCount(count) {
  const safeCount = Number.isFinite(Number(count)) ? Number(count) : getCollectionTotalCount();

  document.querySelectorAll('main[data-template^="collection"] [data-bookstore-visible-count]').forEach((node) => {
    node.textContent = String(safeCount);
  });

  document.querySelectorAll('main[data-template^="collection"] .products-count-wrapper span[role="status"]').forEach((node) => {
    node.textContent = `${safeCount} ${safeCount === 1 ? 'item' : 'items'}`;
  });
}

function filterExistingCollectionItemsByVendor(vendor) {
  const items = getCollectionSearchItems();
  const grid = getCollectionSearchGrid();
  const wrapper = document.querySelector('main[data-template^="collection"] collection-component');
  let visibleCount = 0;

  items.forEach((item) => {
    const isMatch = productItemMatchesVendor(item, vendor);

    item.hidden = !isMatch;
    item.style.display = isMatch ? '' : 'none';

    if (isMatch) visibleCount += 1;
  });

  if (wrapper) {
    wrapper.classList.toggle('bookstore-collection-vendor-filter-active', Boolean(vendor));
  }

  const message = ensureCollectionSearchMessage(grid);

  if (message) {
    message.textContent = vendor ? `No books found for ${vendor} in this collection.` : 'No books found for this search in this collection.';
    message.hidden = !vendor || visibleCount > 0;
  }

  setCollectionVisibleCount(vendor ? visibleCount : items.length);

  return visibleCount;
}

async function loadAllCollectionPagesForVendorFilter(vendor) {
  if (!vendor) return;

  const resultsList = document.querySelector('main[data-template^="collection"] results-list[section-id]');
  const grid = getCollectionSearchGrid();

  if (!resultsList || !grid || grid.dataset.vendorFilterLoaded === vendor) return;

  const sectionId = resultsList.getAttribute('section-id');
  const lastPage = Number(grid.dataset.lastPage || 1);

  if (!sectionId || !lastPage || lastPage <= 1) {
    grid.dataset.vendorFilterLoaded = vendor;
    return;
  }

  const existingIds = new Set(
    Array.from(grid.querySelectorAll('.product-grid__item[data-product-id]')).map((item) => item.getAttribute('data-product-id'))
  );

  const matchedPages = [];
  let nextPage = 2;

  async function loadVendorPage(page) {
    const url = buildBookstoreSectionPageUrl(page, sectionId);
    try {
      const response = await fetch(url.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (!response.ok) return;

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const nextItems = Array.from(doc.querySelectorAll('.product-grid__item[data-product-id]'));
      const matchingItems = nextItems.filter((item) => productItemMatchesVendor(item, vendor));

      matchedPages.push({ page, items: matchingItems });
    } catch (error) {
      // Keep current visible matches if one extra page request fails.
    }
  }

  const workerCount = Math.min(6, Math.max(1, lastPage - 1));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextPage <= lastPage) {
        const page = nextPage;
        nextPage += 1;
        await loadVendorPage(page);
      }
    })
  );

  matchedPages
    .sort((a, b) => a.page - b.page)
    .forEach(({ items: pageItems }) => {
      pageItems.forEach((item) => {
        const productId = item.getAttribute('data-product-id');
        if (!productId || existingIds.has(productId)) return;
        existingIds.add(productId);

        item.hidden = false;
        item.style.display = '';
        grid.appendChild(item);
      });
    });

  grid.dataset.vendorFilterLoaded = vendor;
}

async function applyCollectionVendorFilterFromURL(loadAllPages = false) {
  const vendor = getCollectionVendorFilter();

  document.querySelectorAll('.bookstore-category-publishers a[href*="filter.p.vendor"]').forEach((link) => {
    const linkVendor = new URL(link.href, window.location.origin).searchParams.get('filter.p.vendor') || '';
    if (vendor && linkVendor === vendor) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });

  let visibleCount = filterExistingCollectionItemsByVendor(vendor);

  if (vendor && loadAllPages) {
    await loadAllCollectionPagesForVendorFilter(vendor);
    visibleCount = filterExistingCollectionItemsByVendor(vendor);
  }

  document.documentElement.classList.remove('bookstore-filtering-pending');

  return visibleCount;
}

function initBookstoreCollectionVendorFilter() {
  const selectedVendors = new URL(window.location.href).searchParams
    .getAll('filter.p.vendor')
    .filter((value) => value && value.trim());

  if (selectedVendors.length > 1) {
    document.documentElement.classList.remove('bookstore-filtering-pending');
    return;
  }

  const vendor = getCollectionVendorFilter();
  if (!vendor) {
    document.documentElement.classList.remove('bookstore-filtering-pending');
    return;
  }

  applyCollectionVendorFilterFromURL(true);
  initBookstoreVendorFilterObserver();
}

function initBookstoreVendorFilterObserver() {
  const vendor = getCollectionVendorFilter();
  if (!vendor || window.__bookstoreVendorFilterObserverReady) return;

  const grid = getCollectionSearchGrid();
  if (!grid) return;

  window.__bookstoreVendorFilterObserverReady = true;
  let timer = 0;

  const observer = new MutationObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      filterExistingCollectionItemsByVendor(getCollectionVendorFilter());
    }, 50);
  });

  observer.observe(grid, { childList: true });
}

async function loadAllCollectionPagesForSearch(query) {
  const normalizedQuery = normalizeCollectionSearchText(query);
  if (!normalizedQuery) return;

  const resultsList = document.querySelector('main[data-template^="collection"] results-list[section-id]');
  const grid = getCollectionSearchGrid();

  if (!resultsList || !grid) return;

  const sectionId = resultsList.getAttribute('section-id');
  const lastPage = Number(grid.dataset.lastPage || 1);
  const loadedKey = `search:${normalizedQuery}`;

  if (!sectionId || !lastPage || lastPage <= 1 || grid.dataset.collectionSearchLoaded === loadedKey) return;

  const existingIds = new Set(
    Array.from(grid.querySelectorAll('.product-grid__item[data-product-id]')).map((item) => item.getAttribute('data-product-id'))
  );

  for (let page = 2; page <= lastPage; page += 1) {
    const url = buildBookstoreSectionPageUrl(page, sectionId);

    try {
      const response = await fetch(url.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (!response.ok) continue;

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const nextItems = Array.from(doc.querySelectorAll('.product-grid__item[data-product-id]'));

      nextItems.forEach((item) => {
        const productId = item.getAttribute('data-product-id');
        if (!productId || existingIds.has(productId)) return;
        existingIds.add(productId);

        if (productItemMatchesSearch(item, query)) {
          item.hidden = false;
          item.style.display = '';
          grid.appendChild(item);
        }
      });
    } catch (error) {
      // Keep already loaded matches if one extra page request fails.
    }
  }

  grid.dataset.collectionSearchLoaded = loadedKey;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCollectionPublisherChips, { once: true });
} else {
  initCollectionPublisherChips();
}

document.addEventListener('shopify:section:load', initCollectionPublisherChips);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBookstoreCollectionVendorFilter, { once: true });
} else {
  initBookstoreCollectionVendorFilter();
}

document.addEventListener('shopify:section:load', initBookstoreCollectionVendorFilter);

/**
 * Collection/vendor hero search should filter the products on the same page.
 * Shopify's normal product search goes to /search, but the client requested
 * category and publisher pages to stay in place and behave like an in-page
 * catalogue search.
 */
function normalizeCollectionSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0900-\u097f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyIsbnSearch(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 8;
}

function getCollectionSearchItems() {
  return Array.from(document.querySelectorAll('main[data-template^="collection"] .product-grid__item'));
}

function getCollectionSearchGrid() {
  return document.querySelector('main[data-template^="collection"] .product-grid');
}

function buildBookstoreSectionPageUrl(page, sectionId) {
  const url = new URL(window.location.href);
  url.searchParams.delete('page');
  url.searchParams.delete('section_id');
  url.searchParams.set('page', String(page));
  url.searchParams.set('section_id', sectionId);
  return url;
}

function rememberOriginalCollectionGrid() {
  const grid = getCollectionSearchGrid();
  const countNode = document.querySelector('main[data-template^="collection"] [data-bookstore-visible-count]');

  if (countNode && !countNode.dataset.bookstoreOriginalCount) {
    countNode.dataset.bookstoreOriginalCount = countNode.getAttribute('data-bookstore-total-count') || countNode.textContent.trim();
  }

  if (grid && !grid.dataset.bookstoreOriginalHtml) {
    grid.dataset.bookstoreOriginalHtml = grid.innerHTML;
    grid.dataset.bookstoreOriginalItemCount = String(getCollectionSearchItems().length);
  }
}

function restoreOriginalCollectionGrid() {
  const grid = getCollectionSearchGrid();
  const wrapper = document.querySelector('main[data-template^="collection"] collection-component');
  const message = document.querySelector('[data-bookstore-collection-search-empty]');

  if (grid?.dataset.bookstoreOriginalHtml) {
    grid.innerHTML = grid.dataset.bookstoreOriginalHtml;
    delete grid.dataset.collectionSearchMode;
    delete grid.dataset.collectionSearchLoaded;
  }

  if (wrapper) {
    wrapper.classList.remove('bookstore-collection-search-active');
  }

  if (message) {
    message.hidden = true;
  }

  setCollectionVisibleCount(getCollectionTotalCount());
}

function ensureCollectionSearchMessage(grid) {
  if (!grid) return null;

  let message = document.querySelector('[data-bookstore-collection-search-empty]');

  if (!message) {
    message = document.createElement('p');
    message.setAttribute('data-bookstore-collection-search-empty', '');
    message.className = 'bookstore-collection-search-empty';
    message.textContent = 'No books found for this search in this collection.';
    grid.insertAdjacentElement('afterend', message);
  }

  return message;
}

function updateCollectionSearchUrl(query) {
  const url = new URL(window.location.href);

  if (query) {
    url.searchParams.set('collection_search', query);
  } else {
    url.searchParams.delete('collection_search');
  }

  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  renderBookstoreActiveQueryPills();
}

function renderBookstoreActiveQueryPills() {
  const url = new URL(window.location.href);
  const query = (url.searchParams.get('collection_search') || '').trim();

  document.querySelectorAll('[data-bookstore-query-pill]').forEach((pill) => pill.remove());

  if (!query) return;

  document.querySelectorAll('.facets-remove').forEach((container) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'pills__pill pills__pill--desktop-small facets-remove__pill bookstore-active-query-pill';
    pill.setAttribute('data-bookstore-query-pill', '');
    pill.innerHTML = `<span>Search: ${escapeCollectionSearchHtml(query)}</span><span aria-hidden="true">×</span><span class="visually-hidden">Remove search filter</span>`;

    pill.addEventListener('click', () => {
      document.querySelectorAll('[data-bookstore-collection-search-input], input[name="collection_search"]').forEach((input) => {
        input.value = '';
      });
      applyCollectionPageSearch('', true, false);
      renderBookstoreActiveQueryPills();
    });

    container.prepend(pill);
  });
}

function getBookstoreFilterLabel(param) {
  const labels = {
    collection_search: 'Search',
    'filter.p.vendor': 'Publisher',
    'filter.p.m.custom.author': 'Author',
    'filter.p.m.custom.language': 'Language',
    'filter.p.m.custom.format': 'Format',
    'filter.v.availability': 'Availability',
    'filter.p.product_type': 'Category',
    'filter.p.m.custom.categories': 'Category',
    'filter.p.tag': 'Category',
  };

  if (labels[param]) return labels[param];

  return param
    .replace(/^filter\.[a-z]\./, '')
    .replace(/^m\.custom\./, '')
    .replace(/^custom\./, '')
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getBookstoreFilterValueLabel(param, value) {
  if (param === 'filter.v.availability') {
    if (value === '1') return 'In stock';
    if (value === '0') return 'Out of stock';
  }

  return value;
}

function getBookstoreCollectionPathFilter(url) {
  const pathParts = url.pathname.split('/').filter(Boolean);
  if (pathParts[0] !== 'collections') return null;

  const handle = pathParts[1] || '';
  if (!handle || handle === 'all' || handle === 'vendors' || handle === 'frontpage') return null;

  const decodedHandle = decodeURIComponent(handle.replace(/\+/g, ' '));
  const heading = document.querySelector('main h1');
  const headingText = (heading?.textContent || '').trim();
  const fallbackLabel = decodedHandle
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return {
    param: 'bookstore_collection_page',
    label: 'Category',
    value: handle,
    displayValue: headingText || fallbackLabel,
  };
}

function removeSingleBookstoreSearchParam(params, name, value) {
  const values = params.getAll(name);
  let removed = false;

  params.delete(name);

  values.forEach((currentValue) => {
    if (!removed && currentValue === value) {
      removed = true;
      return;
    }

    params.append(name, currentValue);
  });
}

function renderBookstoreActiveQueryPills() {
  const url = new URL(window.location.href);
  const activeFilters = [];
  const handledParams = new Set(['filter.v.price.gte', 'filter.v.price.lte']);
  const query = (url.searchParams.get('collection_search') || '').trim();
  const minPrice = (url.searchParams.get('filter.v.price.gte') || '').trim();
  const maxPrice = (url.searchParams.get('filter.v.price.lte') || '').trim();
  const collectionPathFilter = getBookstoreCollectionPathFilter(url);

  if (collectionPathFilter) {
    activeFilters.push(collectionPathFilter);
  }

  if (query && query !== '*') {
    activeFilters.push({
      param: 'collection_search',
      label: 'Search',
      value: query,
    });
  }

  if (minPrice || maxPrice) {
    activeFilters.push({
      param: 'bookstore_price_range',
      label: 'Price',
      value: `${minPrice || '0'} - ${maxPrice || 'Max'}`,
    });
  }

  if (url.pathname === '/collections/vendors' && !url.searchParams.has('filter.p.vendor')) {
    const currentVendor = (url.searchParams.get('q') || '').trim();

    if (currentVendor && currentVendor !== '*') {
      activeFilters.push({
        param: 'bookstore_vendor_page',
        label: 'Publisher',
        value: currentVendor,
      });
    }
  }

  for (const [param, rawValue] of url.searchParams.entries()) {
    const value = (rawValue || '').trim();
    if (!param.startsWith('filter.') || handledParams.has(param) || !value || value === '*') continue;

    activeFilters.push({
      param,
      label: getBookstoreFilterLabel(param),
      value,
      displayValue: getBookstoreFilterValueLabel(param, value),
    });
  }

  if (!url.searchParams.has('filter.p.m.custom.author')) {
    const author = (url.searchParams.get('author') || '').trim();
    if (author && author !== '*') {
      activeFilters.push({
        param: 'author',
        label: 'Author',
        value: author,
      });
    }
  }

  document.querySelectorAll('[data-bookstore-query-pill]').forEach((pill) => pill.remove());

  if (!activeFilters.length) return;

  document.querySelectorAll('.facets-remove').forEach((container) => {
    activeFilters.slice().reverse().forEach((filter) => {
      const normalizedContainerText = normalizeCollectionSearchText(container.textContent || '');
      const normalizedValue = normalizeCollectionSearchText(filter.value);
      if (normalizedValue && normalizedContainerText.includes(normalizedValue)) return;

      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'pills__pill pills__pill--desktop-small facets-remove__pill bookstore-active-query-pill';
      pill.setAttribute('data-bookstore-query-pill', '');
      pill.setAttribute('data-bookstore-query-param', filter.param);
      pill.innerHTML = `<span>${escapeCollectionSearchHtml(filter.label)}: ${escapeCollectionSearchHtml(filter.value)}</span><span aria-hidden="true">×</span><span class="visually-hidden">Remove ${escapeCollectionSearchHtml(filter.label)} filter</span>`;

      pill.innerHTML = `<span>${escapeCollectionSearchHtml(filter.label)}: ${escapeCollectionSearchHtml(filter.displayValue || filter.value)}</span><span aria-hidden="true">&times;</span><span class="visually-hidden">Remove ${escapeCollectionSearchHtml(filter.label)} filter</span>`;

      pill.addEventListener('click', () => {
        const nextUrl = new URL(window.location.href);

        if (filter.param === 'collection_search') {
          nextUrl.searchParams.delete(filter.param);
          document.querySelectorAll('[data-bookstore-collection-search-input], input[name="collection_search"]').forEach((input) => {
            input.value = '';
          });
          applyCollectionPageSearch('', true, false);
          renderBookstoreActiveQueryPills();
          return;
        }

        if (filter.param === 'bookstore_price_range') {
          nextUrl.searchParams.delete('filter.v.price.gte');
          nextUrl.searchParams.delete('filter.v.price.lte');
        } else if (filter.param === 'bookstore_vendor_page') {
          nextUrl.pathname = '/collections/all';
          nextUrl.searchParams.delete('q');
          nextUrl.searchParams.delete('type');
          nextUrl.searchParams.delete('view');
          nextUrl.searchParams.delete('options[prefix]');
        } else if (filter.param === 'bookstore_collection_page') {
          nextUrl.pathname = '/collections/all';
        } else {
          removeSingleBookstoreSearchParam(nextUrl.searchParams, filter.param, filter.value);
        }

        if (filter.param === 'filter.p.m.custom.author' || filter.param === 'author') {
          nextUrl.searchParams.delete('author');
          if (nextUrl.searchParams.get('view') === 'author') nextUrl.searchParams.delete('view');
        }

        nextUrl.searchParams.delete('page');
        window.location.href = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      });

      container.prepend(pill);
    });
  });
}

function isExactCollectionPublisherQuery(query) {
  const normalizedQuery = normalizeCollectionSearchText(query);
  if (!normalizedQuery) return false;

  return Array.from(document.querySelectorAll('.bookstore-category-publishers a')).some((chip) => {
    return normalizeCollectionSearchText(getCollectionPublisherChipValue(chip)) === normalizedQuery;
  });
}

function shouldUseGlobalCollectionSearch(query) {
  const normalizedQuery = normalizeCollectionSearchText(query);
  if (!normalizedQuery) return false;
  if (isExactCollectionPublisherQuery(query)) return false;
  if (isLikelyIsbnSearch(query)) return false;

  return window.location.pathname.replace(/\/$/, '') === '/collections/all';
}

function escapeCollectionSearchHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[char]);
}

function formatPredictiveSearchPrice(product) {
  const price = product?.price_min || product?.price || '';
  const numericPrice = Number(String(price).replace(/,/g, ''));

  if (Number.isFinite(numericPrice)) {
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: window.Shopify?.currency?.active || 'INR',
        maximumFractionDigits: numericPrice % 1 === 0 ? 0 : 2,
      }).format(numericPrice);
    } catch (error) {
      return `Rs. ${numericPrice.toFixed(numericPrice % 1 === 0 ? 0 : 2)}`;
    }
  }

  return price ? `Rs. ${price}` : '';
}

function renderPredictiveCollectionSearchItem(product) {
  const productId = product?.id || product?.handle || product?.url || '';
  const title = product?.title || '';
  const vendor = product?.vendor || '';
  const productType = product?.type || '';
  const url = product?.url || (product?.handle ? `/products/${product.handle}` : '#');
  const image = product?.featured_image?.url || product?.image || '';
  const price = formatPredictiveSearchPrice(product);
  const searchText = [title, vendor, productType, product?.tags?.join?.(' ')].filter(Boolean).join(' ');

  return `
    <li
      class="product-grid__item bookstore-predictive-collection-item"
      data-product-id="${escapeCollectionSearchHtml(productId)}"
      data-collection-search-text="${escapeCollectionSearchHtml(searchText)}"
    >
      <product-card class="product-card size-style bookstore-predictive-collection-card" data-product-id="${escapeCollectionSearchHtml(productId)}">
        <a class="bookstore-predictive-collection-card__image" href="${escapeCollectionSearchHtml(url)}" aria-label="${escapeCollectionSearchHtml(title)}">
          ${
            image
              ? `<img src="${escapeCollectionSearchHtml(image)}" alt="${escapeCollectionSearchHtml(title)}" loading="lazy">`
              : `<span>${escapeCollectionSearchHtml(title.slice(0, 1) || 'B')}</span>`
          }
        </a>
        <div class="bookstore-predictive-collection-card__body">
          ${vendor ? `<p>${escapeCollectionSearchHtml(vendor)}</p>` : ''}
          <h3><a href="${escapeCollectionSearchHtml(url)}">${escapeCollectionSearchHtml(title)}</a></h3>
          ${price ? `<div class="bookstore-predictive-collection-card__price">${escapeCollectionSearchHtml(price)}</div>` : ''}
        </div>
      </product-card>
    </li>
  `;
}

async function loadPredictiveCollectionProducts(query) {
  const url = new URL('/search/suggest.json', window.location.origin);
  url.searchParams.set('q', query);
  url.searchParams.set('resources[type]', 'product');
  url.searchParams.set('resources[limit]', '10');
  url.searchParams.set('resources[limit_scope]', 'each');
  url.searchParams.set('resources[options][unavailable_products]', 'last');
  url.searchParams.set('resources[options][fields]', 'title,product_type,variants.title,variants.sku,vendor');

  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!response.ok) return null;

  const payload = await response.json();
  return payload?.resources?.results?.products || [];
}

async function loadGlobalCollectionSearch(query) {
  const normalizedQuery = normalizeCollectionSearchText(query);
  if (!normalizedQuery) return false;

  const grid = getCollectionSearchGrid();
  const wrapper = document.querySelector('main[data-template^="collection"] collection-component');
  const message = ensureCollectionSearchMessage(grid);

  if (!grid) return false;

  rememberOriginalCollectionGrid();

  if (message) {
    message.textContent = 'Finding matching books...';
    message.hidden = false;
  }

  try {
    const predictiveProducts = await loadPredictiveCollectionProducts(query);

    if (Array.isArray(predictiveProducts)) {
      grid.innerHTML = predictiveProducts.map(renderPredictiveCollectionSearchItem).join('');
      grid.dataset.collectionSearchMode = 'predictive';

      if (wrapper) {
        wrapper.classList.toggle('bookstore-collection-search-active', true);
      }

      setCollectionVisibleCount(predictiveProducts.length);

      if (message) {
        message.textContent = 'No books found for this search in this collection.';
        message.hidden = predictiveProducts.length > 0;
      }

      return true;
    }
  } catch (error) {
    // Fall back to full search page parsing below if the predictive endpoint is unavailable.
  }

  const url = new URL('/search', window.location.origin);
  url.searchParams.set('type', 'product');
  url.searchParams.set('q', query);
  url.searchParams.set('options[prefix]', 'last');

  try {
    const response = await fetch(url.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!response.ok) return false;

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const searchItems = Array.from(doc.querySelectorAll('main[data-template^="search"] .product-grid__item[data-product-id], .product-grid__item[data-product-id]'))
      .filter((item) => productItemMatchesSearch(item, query));
    const resultCount = searchItems.length;

    grid.innerHTML = '';
    searchItems.forEach((item) => {
      item.hidden = false;
      item.style.display = '';
      grid.appendChild(item);
    });

    grid.dataset.collectionSearchMode = 'global';

    if (wrapper) {
      wrapper.classList.toggle('bookstore-collection-search-active', true);
    }

    setCollectionVisibleCount(resultCount);

    if (message) {
      message.textContent = 'No books found for this search in this collection.';
      message.hidden = resultCount > 0;
    }

    return true;
  } catch (error) {
    if (message) {
      message.textContent = 'No books found for this search in this collection.';
      message.hidden = true;
    }
  }

  return false;
}

async function applyCollectionPageSearch(query, updateUrl = true, loadAllPages = false) {
  rememberOriginalCollectionGrid();
  syncCollectionPublisherChips(query);

  const normalizedQuery = normalizeCollectionSearchText(query);
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  const items = getCollectionSearchItems();
  const grid = getCollectionSearchGrid();
  const wrapper = document.querySelector('main[data-template^="collection"] collection-component');
  let visibleCount = 0;

  if (!items.length) return;

  if (tokens.length === 0) {
    restoreOriginalCollectionGrid();

    if (updateUrl) {
      updateCollectionSearchUrl('');
    }

    return;
  }

  if (loadAllPages && shouldUseGlobalCollectionSearch(query)) {
    if (updateUrl) {
      updateCollectionSearchUrl(query);
    }

    const usedGlobalSearch = await loadGlobalCollectionSearch(query);
    if (usedGlobalSearch) return;
  }

  items.forEach((item) => {
    const isMatch = productItemMatchesSearch(item, query);

    item.hidden = !isMatch;
    item.style.display = isMatch ? '' : 'none';

    if (isMatch) visibleCount += 1;
  });

  const message = ensureCollectionSearchMessage(grid);

  if (message) {
    message.hidden = tokens.length === 0 || visibleCount > 0;
    if (tokens.length > 0 && visibleCount === 0 && loadAllPages) {
      message.textContent = 'Finding matching books...';
      message.hidden = false;
    } else {
      message.textContent = 'No books found for this search in this collection.';
    }
  }

  if (wrapper) {
    wrapper.classList.toggle('bookstore-collection-search-active', tokens.length > 0);
  }

  setCollectionVisibleCount(visibleCount);

  if (updateUrl) {
    updateCollectionSearchUrl(query);
  }

  if (tokens.length > 0 && loadAllPages) {
    await loadAllCollectionPagesForSearch(query);

    if (getCollectionSearchItems().length !== items.length) {
      return applyCollectionPageSearch(query, false, false);
    }

    if (message) {
      message.textContent = 'No books found for this search in this collection.';
      message.hidden = visibleCount > 0;
    }
  }
}

function initCollectionPageSearch() {
  const forms = Array.from(document.querySelectorAll('[data-bookstore-collection-search]'));

  forms.forEach((form) => {
    const input = form.querySelector('[data-bookstore-collection-search-input], input[name="collection_search"]');

    if (!input || form.dataset.collectionSearchReady === 'true') return;

    form.dataset.collectionSearchReady = 'true';

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      applyCollectionPageSearch(input.value || '', true, true);
    });

    input.addEventListener('input', () => {
      window.clearTimeout(input._bookstoreCollectionSearchTimer);
      input._bookstoreCollectionSearchTimer = window.setTimeout(() => {
        applyCollectionPageSearch(input.value || '', true, true);
      }, 180);
    });

    const initialQuery = new URL(window.location.href).searchParams.get('collection_search') || input.value || '';

    if (initialQuery) {
      input.value = initialQuery;
      applyCollectionPageSearch(initialQuery, false, true);
    }
  });

  renderBookstoreActiveQueryPills();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCollectionPageSearch, { once: true });
} else {
  initCollectionPageSearch();
}

document.addEventListener('shopify:section:load', initCollectionPageSearch);

function upsertHiddenInput(form, name, value) {
  if (!form || !name || value == null) return;

  let input = Array.from(form.querySelectorAll(`input[type="hidden"][name="${CSS.escape(name)}"]`)).find((candidate) => {
    return candidate.dataset.bookstoreInjected === 'true' || candidate.value === value;
  });

  if (!input) {
    input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.dataset.bookstoreInjected = 'true';
    form.prepend(input);
  }

  input.value = value;
}

function initBookstoreAuthorFilterLock() {
  const url = new URL(window.location.href);

  if (url.pathname !== '/search') return;

  const view = url.searchParams.get('view') || '';
  const author = url.searchParams.get('author') || url.searchParams.get('filter.p.m.custom.author') || '';

  if (view !== 'author' || !author || author === '*') return;

  document.querySelectorAll('form[id^="FacetFiltersForm--"]').forEach((form) => {
    upsertHiddenInput(form, 'view', 'author');
    upsertHiddenInput(form, 'type', 'product');
    upsertHiddenInput(form, 'q', '*');
    upsertHiddenInput(form, 'author', author);
    upsertHiddenInput(form, 'filter.p.m.custom.author', author);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBookstoreAuthorFilterLock, { once: true });
} else {
  initBookstoreAuthorFilterLock();
}

document.addEventListener('shopify:section:load', initBookstoreAuthorFilterLock);

function initBookstoreSortPills() {
  document.querySelectorAll('[data-bookstore-sort-pill]').forEach((pill) => {
    if (pill.dataset.bookstoreSortReady === 'true') return;

    pill.dataset.bookstoreSortReady = 'true';
    pill.addEventListener('click', (event) => {
      const sortValue = pill.getAttribute('data-sort-value');

      if (!sortValue) return;

      event.preventDefault();

      const url = new URL(window.location.href);
      url.searchParams.set('sort_by', sortValue);
      url.searchParams.delete('page');
      window.location.href = `${url.pathname}${url.search}${url.hash}`;
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBookstoreSortPills, { once: true });
} else {
  initBookstoreSortPills();
}

document.addEventListener('shopify:section:load', initBookstoreSortPills);

const titleCaseBookstoreAuthorName = (authorName) => String(authorName || '')
  .trim()
  .toLowerCase()
  .replace(/\b([a-z])/g, (match) => match.toUpperCase());

function initBookstoreAuthorUrlCanonicalizer() {
  const url = new URL(window.location.href);
  if (url.pathname !== '/search' || url.searchParams.get('view') !== 'author') return;

  const authorName = (url.searchParams.get('author') || url.searchParams.get('filter.p.m.custom.author') || '').trim();
  if (!authorName || authorName === '*' || /[A-Z]/.test(authorName)) return;

  const canonicalAuthorName = titleCaseBookstoreAuthorName(authorName);
  if (!canonicalAuthorName || canonicalAuthorName === authorName) return;

  url.searchParams.set('author', canonicalAuthorName);
  url.searchParams.set('filter.p.m.custom.author', canonicalAuthorName);
  url.searchParams.delete('page');
  window.location.replace(`${url.pathname}${url.search}${url.hash}`);
}

function initBookstoreAuthorSidebarSearch() {
  document.querySelectorAll('[data-author-sidebar-search]').forEach((container) => {
    if (container.dataset.bookstoreAuthorSidebarReady === 'true') return;

    container.dataset.bookstoreAuthorSidebarReady = 'true';
    const input = container.querySelector('[data-author-search-input], input[name="author"]');
    const button = container.querySelector('[data-author-search-submit], button[type="submit"], button');
    const filterInput = container.querySelector('[data-author-sidebar-filter-value]');
    const details = container.closest('.bookstore-entity-facet--author-search');
    const rows = Array.from(details?.querySelectorAll('.bookstore-author-filter-row') || []);

    const getAuthorName = () => String(input?.value || '').trim();

    const findVisibleCanonicalAuthor = (authorName) => {
      const normalizedAuthor = normalizeCollectionSearchText(authorName);
      if (!normalizedAuthor) return '';

      const exactRow = rows.find((row) => {
        return normalizeCollectionSearchText(row.textContent || '') === normalizedAuthor;
      });

      if (exactRow) return String(exactRow.textContent || '').trim();

      const startsWithRow = rows.find((row) => {
        return normalizeCollectionSearchText(row.textContent || '').startsWith(normalizedAuthor);
      });

      return startsWithRow ? String(startsWithRow.textContent || '').trim() : '';
    };

    const syncAuthorValue = () => {
      const authorName = getAuthorName();
      if (filterInput) filterInput.value = authorName;
      return authorName;
    };

    const filterAuthorRows = () => {
      const query = normalizeCollectionSearchText(getAuthorName());
      rows.forEach((row) => {
        const item = row.closest('.facets__inputs-list-item');
        const label = normalizeCollectionSearchText(row.textContent || '');
        const isMatch = !query || label.includes(query);
        if (item) item.hidden = !isMatch;
      });
    };

    const openAuthorSearch = () => {
      const typedAuthorName = syncAuthorValue();
      const authorName = findVisibleCanonicalAuthor(typedAuthorName) || titleCaseBookstoreAuthorName(typedAuthorName);
      if (!authorName) return;

      const url = new URL('/search', window.location.origin);
      url.searchParams.set('view', 'author');
      url.searchParams.set('type', 'product');
      url.searchParams.set('q', '*');
      url.searchParams.set('filter.p.m.custom.author', authorName);
      url.searchParams.set('author', authorName);
      window.location.href = `${url.pathname}${url.search}`;
    };

    input?.addEventListener('input', () => {
      syncAuthorValue();
      filterAuthorRows();
    });

    const handleAuthorSearchEnter = (event) => {
      if (event.key !== 'Enter' && event.code !== 'Enter' && event.code !== 'NumpadEnter') return;
      event.preventDefault();
      event.stopPropagation();
      openAuthorSearch();
    };

    input?.addEventListener('keydown', handleAuthorSearchEnter, true);
    input?.addEventListener('keypress', handleAuthorSearchEnter, true);
    input?.addEventListener('keyup', handleAuthorSearchEnter, true);

    button?.addEventListener('click', (event) => {
      event.preventDefault();
      openAuthorSearch();
    });

    container.addEventListener('submit', (event) => {
      event.preventDefault();
      openAuthorSearch();
    });

  });

  if (!window.__bookstoreAuthorSearchEnterFallbackReady) {
    window.__bookstoreAuthorSearchEnterFallbackReady = true;
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Enter' && event.code !== 'Enter' && event.code !== 'NumpadEnter') return;
        const target = event.target instanceof Element ? event.target : null;
        const input = target?.closest?.('[data-author-search-input]');
        if (!input) return;

        const container = input.closest('[data-author-sidebar-search]');
        const button = container?.querySelector('[data-author-search-submit]');
        if (!button) return;

        event.preventDefault();
        event.stopPropagation();
        button.click();
      },
      true
    );
  }

  document.querySelectorAll('[data-author-filter-option]').forEach((input) => {
    if (input.dataset.bookstoreAuthorOptionReady === 'true') return;

    input.dataset.bookstoreAuthorOptionReady = 'true';
    input.addEventListener('change', () => {
      const targetUrl = input.getAttribute('data-author-url');
      if (targetUrl) window.location.href = targetUrl;
    });
  });
}

function initBookstorePolicyHeadings() {
  const path = window.location.pathname.replace(/\/$/, '');
  const title =
    document.querySelector('.shopify-policy__title h1') ||
    document.querySelector('.shopify-policy__title') ||
    document.querySelector('main h1');

  if (!title) return;

  if (path === '/policies/terms-of-service') {
    title.textContent = 'Terms & Conditions';
  }

  if (path === '/policies/legal-notice') {
    title.textContent = 'Copyright Policy';
  }
}

function initBookstoreDocChangeFixes() {
  initBookstoreAuthorUrlCanonicalizer();
  initBookstoreAuthorSidebarSearch();
  initBookstorePolicyHeadings();
  renderBookstoreActiveQueryPills();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBookstoreDocChangeFixes, { once: true });
} else {
  initBookstoreDocChangeFixes();
}

document.addEventListener('shopify:section:load', initBookstoreDocChangeFixes);

/**
 * A few imported book records contain mojibake fragments in visible card text
 * (for example: "Madan Lal √¢ ,Ç¨ÀÜ..."). Until the source data is cleaned,
 * remove the visibly broken suffix from cards so customers do not see garbage
 * characters in collection/homepage grids.
 */
function cleanBookstoreMojibakeText(value) {
  const text = String(value || '');
  if (!/[√�]|‚Ç|,Ç|ÀÜ/.test(text)) return text;

  return text
    .split('√')[0]
    .replace(/�+/g, '')
    .replace(/\s*,?Ç[^\s]*/g, '')
    .replace(/\s*‚Ç[^\s]*/g, '')
    .replace(/\s*ÀÜ[^\s]*/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

function sanitizeBookstoreVisibleText(root = document) {
  const scope = root instanceof Element ? root : document;
  const nodes = scope.querySelectorAll?.(
    [
      '.product-grid__item h3',
      '.product-grid__item h4',
      '.product-grid__item p',
      '.product-grid__item span',
      '.product-grid__item strong',
      '.sb-publisher-book strong',
      '.sb-publisher-book small',
      '.rk-product-card__author',
      '.rk-product-card__title',
      '.rk-product-card__publisher',
      '.sb-book-card h3',
      '.sb-book-card p',
    ].join(',')
  );

  if (!nodes) return;

  nodes.forEach((node) => {
    if (node.children.length > 0) return;
    const cleaned = cleanBookstoreMojibakeText(node.textContent);
    if (cleaned && cleaned !== node.textContent) {
      node.textContent = cleaned;
    }
  });
}

function initBookstoreTextSanitizer() {
  sanitizeBookstoreVisibleText(document);

  if (window.__bookstoreTextSanitizerReady) return;
  window.__bookstoreTextSanitizerReady = true;

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) sanitizeBookstoreVisibleText(node);
      });
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBookstoreTextSanitizer, { once: true });
} else {
  initBookstoreTextSanitizer();
}

document.addEventListener('shopify:section:load', () => sanitizeBookstoreVisibleText(document));

function getBookstorePreservedCategoryParams() {
  const current = new URL(window.location.href);
  const params = new URLSearchParams();

  for (const [name, value] of current.searchParams.entries()) {
    if (!value || name === 'page' || name === 'section_id') continue;

    if (
      name.startsWith('filter.') ||
      name === 'author' ||
      name === 'collection_search' ||
      name === 'sort_by'
    ) {
      params.append(name, value);
    }
  }

  if (current.pathname === '/collections/vendors') {
    const vendor = current.searchParams.get('q') || '';
    if (vendor && !params.has('filter.p.vendor')) {
      params.set('filter.p.vendor', vendor);
    }
  }

  return params;
}

function rewriteBookstoreCategoryFilterLinks(root = document) {
  const scope = root instanceof Element ? root : document;
  const preserved = getBookstorePreservedCategoryParams();

  if ([...preserved.keys()].length === 0) return;

  scope.querySelectorAll?.('.bookstore-collection-facet__link[href*="/collections/"]').forEach((link) => {
    if (!(link instanceof HTMLAnchorElement)) return;

    const target = new URL(link.href, window.location.origin);
    if (!target.pathname.startsWith('/collections/')) return;
    if (target.pathname === '/collections/vendors') return;

    preserved.forEach((value, name) => {
      if (!target.searchParams.has(name)) {
        target.searchParams.append(name, value);
      }
    });

    target.searchParams.delete('page');
    link.href = `${target.pathname}${target.search}${target.hash}`;
  });
}

function rewriteBookstoreSortPillLinks(root = document) {
  const scope = root instanceof Element ? root : document;
  const current = new URL(window.location.href);

  scope.querySelectorAll?.('[data-bookstore-sort-pill]').forEach((link) => {
    if (!(link instanceof HTMLAnchorElement)) return;

    const target = new URL(current.href);
    const pillUrl = new URL(link.href, window.location.origin);
    const sortValue = link.dataset.sortValue || pillUrl.searchParams.get('sort_by') || '';

    if (!sortValue) return;

    target.searchParams.set('sort_by', sortValue);
    target.searchParams.delete('page');
    link.href = `${target.pathname}${target.search}${target.hash}`;
  });
}

function initBookstoreCategoryFilterLinks() {
  rewriteBookstoreCategoryFilterLinks(document);
  rewriteBookstoreSortPillLinks(document);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBookstoreCategoryFilterLinks, { once: true });
} else {
  initBookstoreCategoryFilterLinks();
}

document.addEventListener('shopify:section:load', (event) => {
  const target = event.target instanceof Element ? event.target : document;
  rewriteBookstoreCategoryFilterLinks(target);
  rewriteBookstoreSortPillLinks(target);
});

function initBookstoreEntityFilterTools(root = document) {
  const scope = root instanceof Element ? root : document;

  scope.querySelectorAll?.('[data-entity-filter-search]').forEach((container) => {
    if (container.dataset.bookstoreEntitySearchReady === 'true') return;

    container.dataset.bookstoreEntitySearchReady = 'true';
    const input = container.querySelector('[data-entity-filter-search-input]');
    const button = container.querySelector('[data-entity-filter-search-button]');
    const details = container.closest('.bookstore-entity-facet');
    const rows = Array.from(details?.querySelectorAll('.facets__inputs-list-item') || []);

    const applySearch = () => {
      const query = normalizeCollectionSearchText(input?.value || '');
      rows.forEach((row) => {
        const label = normalizeCollectionSearchText(row.textContent || '');
        const matches = !query || label.includes(query);
        row.hidden = !matches;
        if (matches) row.removeAttribute('data-entity-extra-item');
      });
    };

    input?.addEventListener('input', applySearch);
    input?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.code !== 'Enter' && event.code !== 'NumpadEnter') return;
      event.preventDefault();
      event.stopPropagation();
      applySearch();
    });
    button?.addEventListener('click', (event) => {
      event.preventDefault();
      applySearch();
    });
  });

  scope.querySelectorAll?.('[data-entity-show-more]').forEach((button) => {
    if (button.dataset.bookstoreEntityShowMoreReady === 'true') return;

    button.dataset.bookstoreEntityShowMoreReady = 'true';
    button.addEventListener('click', () => {
      const details = button.closest('.bookstore-entity-facet');
      details?.querySelectorAll('[data-entity-extra-item]').forEach((item) => {
        item.hidden = false;
        item.removeAttribute('data-entity-extra-item');
      });
      button.remove();
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initBookstoreEntityFilterTools(document), { once: true });
} else {
  initBookstoreEntityFilterTools(document);
}

document.addEventListener('shopify:section:load', (event) => {
  initBookstoreEntityFilterTools(event.target instanceof Element ? event.target : document);
});
