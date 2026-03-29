(function () {
  'use strict';

  const STORAGE_KEY = 'settings';
  const MIN_CATEGORIES = 1;
  const MAX_CATEGORIES = 8;
  const DEFAULT_TEXT_COLOR = '#1d1d1d';
  const DEFAULT_CATEGORIES = [
    { label: 'Yellow', backgroundColor: '#f9df6d', textColor: DEFAULT_TEXT_COLOR },
    { label: 'Green', backgroundColor: '#a0c35a', textColor: DEFAULT_TEXT_COLOR },
    { label: 'Blue', backgroundColor: '#b0c4ef', textColor: DEFAULT_TEXT_COLOR },
    { label: 'Purple', backgroundColor: '#ba81c5', textColor: DEFAULT_TEXT_COLOR }
  ];
  const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeHexColor(value) {
    if (typeof value !== 'string') {
      return '';
    }

    const normalized = value.trim();
    return HEX_COLOR_RE.test(normalized) ? normalized.toLowerCase() : '';
  }

  function createCategoryTemplate(index) {
    const defaultCategory = DEFAULT_CATEGORIES[index];
    return {
      id: `category-${index + 1}`,
      label: defaultCategory ? defaultCategory.label : `Category ${index + 1}`,
      backgroundColor: defaultCategory ? defaultCategory.backgroundColor : '#d9d9d9',
      textColor: defaultCategory ? defaultCategory.textColor : DEFAULT_TEXT_COLOR
    };
  }

  function getDefaultSettings() {
    return clone({
      categoryCount: DEFAULT_CATEGORIES.length,
      categories: DEFAULT_CATEGORIES.map((category, index) => ({
        id: `category-${index + 1}`,
        label: category.label,
        backgroundColor: category.backgroundColor,
        textColor: category.textColor
      }))
    });
  }

  function ensureCategorySlots(settings, requiredCount) {
    const normalized = normalizeSettings(settings);
    const nextCount = clamp(requiredCount, MIN_CATEGORIES, MAX_CATEGORIES);
    while (normalized.categories.length < nextCount) {
      normalized.categories.push(createCategoryTemplate(normalized.categories.length));
    }
    return normalized;
  }

  function normalizeSettings(input) {
    const defaults = getDefaultSettings();
    const rawSettings = input && typeof input === 'object' ? input : {};
    const rawCount = Number(rawSettings.categoryCount);
    const categoryCount = Number.isInteger(rawCount)
      ? clamp(rawCount, MIN_CATEGORIES, MAX_CATEGORIES)
      : defaults.categoryCount;
    const rawCategories = Array.isArray(rawSettings.categories)
      ? rawSettings.categories.slice(0, MAX_CATEGORIES)
      : [];
    const targetLength = clamp(
      Math.max(categoryCount, rawCategories.length, defaults.categories.length),
      MIN_CATEGORIES,
      MAX_CATEGORIES
    );
    const categories = [];

    for (let index = 0; index < targetLength; index += 1) {
      const template = createCategoryTemplate(index);
      const rawCategory = rawCategories[index] && typeof rawCategories[index] === 'object'
        ? rawCategories[index]
        : {};

      categories.push({
        id: typeof rawCategory.id === 'string' && rawCategory.id.trim()
          ? rawCategory.id.trim()
          : template.id,
        label: typeof rawCategory.label === 'string' && rawCategory.label.trim()
          ? rawCategory.label.trim()
          : template.label,
        backgroundColor: normalizeHexColor(rawCategory.backgroundColor) || template.backgroundColor,
        textColor: normalizeHexColor(rawCategory.textColor) || template.textColor
      });
    }

    return { categoryCount, categories };
  }

  function validateSettings(input) {
    const errors = [];
    if (!input || typeof input !== 'object') {
      return { ok: false, errors: ['Settings must be an object.'], value: null };
    }

    const rawCount = Number(input.categoryCount);
    if (!Number.isInteger(rawCount) || rawCount < MIN_CATEGORIES || rawCount > MAX_CATEGORIES) {
      errors.push(`Category count must be an integer between ${MIN_CATEGORIES} and ${MAX_CATEGORIES}.`);
    }

    if (!Array.isArray(input.categories)) {
      errors.push('Categories must be an array.');
    }

    if (errors.length > 0) {
      return { ok: false, errors, value: null };
    }

    if (input.categories.length < rawCount) {
      errors.push('Categories array must include at least the active category count.');
      return { ok: false, errors, value: null };
    }

    const seenLabels = new Set();
    const limit = Math.min(input.categories.length, MAX_CATEGORIES);

    for (let index = 0; index < limit; index += 1) {
      const category = input.categories[index];
      if (!category || typeof category !== 'object') {
        errors.push(`Category ${index + 1} must be an object.`);
        continue;
      }

      const label = typeof category.label === 'string' ? category.label.trim() : '';
      const backgroundColor = normalizeHexColor(category.backgroundColor);
      const textColor = normalizeHexColor(category.textColor);

      if (!label) {
        errors.push(`Category ${index + 1} label is required.`);
      } else {
        const labelKey = label.toUpperCase();
        if (seenLabels.has(labelKey)) {
          errors.push(`Category labels must be unique. Duplicate label: ${label}`);
        }
        seenLabels.add(labelKey);
      }

      if (!backgroundColor) {
        errors.push(`Category ${index + 1} background color must be a 6-digit hex color.`);
      }

      if (!textColor) {
        errors.push(`Category ${index + 1} text color must be a 6-digit hex color.`);
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors, value: null };
    }

    return { ok: true, errors: [], value: normalizeSettings(input) };
  }

  function getStorageArea() {
    if (!chrome || !chrome.storage) {
      throw new Error('Chrome storage is unavailable.');
    }

    return chrome.storage.sync;
  }

  function getFromStorage(keys) {
    return new Promise((resolve, reject) => {
      try {
        getStorageArea().get(keys, items => {
          if (chrome.runtime && chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(items);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function setInStorage(items) {
    return new Promise((resolve, reject) => {
      try {
        getStorageArea().set(items, () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function loadSettings() {
    const items = await getFromStorage([STORAGE_KEY]);
    const candidate = items[STORAGE_KEY];
    const validation = validateSettings(candidate);

    if (!validation.ok) {
      const defaults = getDefaultSettings();
      await setInStorage({ [STORAGE_KEY]: defaults });
      return defaults;
    }

    return validation.value;
  }

  async function saveSettings(settings) {
    const validation = validateSettings(settings);
    if (!validation.ok) {
      throw new Error(validation.errors.join(' '));
    }

    await setInStorage({ [STORAGE_KEY]: validation.value });
    return validation.value;
  }

  function subscribeToSettingsChanges(callback) {
    if (!chrome || !chrome.storage || !chrome.storage.onChanged) {
      return function noop() {};
    }

    const listener = function listener(changes, areaName) {
      if (areaName !== 'sync' || !changes[STORAGE_KEY]) {
        return;
      }

      const nextValue = changes[STORAGE_KEY].newValue;
      const validation = validateSettings(nextValue);
      callback(validation.ok ? validation.value : getDefaultSettings());
    };

    chrome.storage.onChanged.addListener(listener);
    return function unsubscribe() {
      chrome.storage.onChanged.removeListener(listener);
    };
  }

  globalThis.NytConnectionsHelperShared = {
    STORAGE_KEY,
    MIN_CATEGORIES,
    MAX_CATEGORIES,
    DEFAULT_TEXT_COLOR,
    getDefaultSettings,
    ensureCategorySlots,
    normalizeSettings,
    validateSettings,
    loadSettings,
    saveSettings,
    subscribeToSettingsChanges
  };
}());
