(function () {
  'use strict';

  const shared = globalThis.NytConnectionsHelperShared;
  const categoryList = document.getElementById('category-list');
  const status = document.getElementById('status');
  const openSettingsButton = document.getElementById('open-settings');
  const restoreDefaultsButton = document.getElementById('restore-defaults');

  init().catch(error => {
    console.error('Failed to initialize popup.', error);
    status.textContent = 'Unable to load settings.';
  });

  async function init() {
    renderCategories(await shared.loadSettings());

    openSettingsButton.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });

    restoreDefaultsButton.addEventListener('click', async () => {
      try {
        const defaults = await shared.saveSettings(shared.getDefaultSettings());
        renderCategories(defaults);
        setStatus('Defaults restored.');
      } catch (error) {
        console.error(error);
        setStatus('Unable to restore defaults.');
      }
    });

    shared.subscribeToSettingsChanges(renderCategories);
  }

  function renderCategories(settings) {
    const activeCategories = settings.categories.slice(0, settings.categoryCount);
    categoryList.replaceChildren();

    for (const category of activeCategories) {
      const card = document.createElement('div');
      card.className = 'category-card';

      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.backgroundColor = category.backgroundColor;
      swatch.style.color = category.textColor;

      const name = document.createElement('span');
      name.className = 'category-name';
      name.textContent = category.label;

      const meta = document.createElement('span');
      meta.className = 'category-meta';
      meta.textContent = category.backgroundColor;

      card.appendChild(swatch);
      card.appendChild(name);
      card.appendChild(meta);
      categoryList.appendChild(card);
    }
  }

  function setStatus(message) {
    status.textContent = message;
    window.setTimeout(() => {
      if (status.textContent === message) {
        status.textContent = '';
      }
    }, 2000);
  }
}());
