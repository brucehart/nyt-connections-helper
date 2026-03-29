(function () {
  'use strict';

  const shared = globalThis.NytConnectionsHelperShared;
  const categoryCountInput = document.getElementById('category-count');
  const categoryFields = document.getElementById('category-fields');
  const status = document.getElementById('status');
  const saveSettingsButton = document.getElementById('save-settings');
  const restoreDefaultsButton = document.getElementById('restore-defaults');

  let workingSettings = shared.getDefaultSettings();

  init().catch(error => {
    console.error('Failed to initialize options page.', error);
    setStatus('Unable to load settings.', true);
  });

  async function init() {
    workingSettings = await shared.loadSettings();
    render();

    categoryCountInput.addEventListener('change', onCategoryCountChange);
    categoryFields.addEventListener('input', onCategoryFieldsInput);
    saveSettingsButton.addEventListener('click', onSaveSettings);
    restoreDefaultsButton.addEventListener('click', onRestoreDefaults);

    shared.subscribeToSettingsChanges(nextSettings => {
      workingSettings = nextSettings;
      render();
      setStatus('Settings updated.');
    });
  }

  function render() {
    categoryCountInput.value = String(workingSettings.categoryCount);
    renderCategoryRows();
  }

  function renderCategoryRows() {
    categoryFields.replaceChildren();
    workingSettings = shared.ensureCategorySlots(workingSettings, workingSettings.categoryCount);

    for (let index = 0; index < workingSettings.categoryCount; index += 1) {
      const category = workingSettings.categories[index];
      const row = document.createElement('div');
      row.className = 'category-row category-row-preview';
      row.style.borderLeftColor = category.backgroundColor;

      row.appendChild(createTextField(index, 'label', 'Label', category.label));
      row.appendChild(createColorField(index, 'backgroundColor', 'Tile color', category.backgroundColor));
      row.appendChild(createColorField(index, 'textColor', 'Text color', category.textColor));
      row.appendChild(createPreviewField(category));

      categoryFields.appendChild(row);
    }
  }

  function createTextField(index, field, label, value) {
    const wrapper = document.createElement('div');
    wrapper.className = 'field';

    const fieldLabel = document.createElement('label');
    fieldLabel.setAttribute('for', `${field}-${index}`);
    fieldLabel.textContent = label;

    const input = document.createElement('input');
    input.id = `${field}-${index}`;
    input.type = 'text';
    input.value = value;
    input.dataset.index = String(index);
    input.dataset.field = field;

    wrapper.appendChild(fieldLabel);
    wrapper.appendChild(input);
    return wrapper;
  }

  function createColorField(index, field, label, value) {
    const wrapper = document.createElement('div');
    wrapper.className = 'field';

    const fieldLabel = document.createElement('label');
    fieldLabel.setAttribute('for', `${field}-${index}`);
    fieldLabel.textContent = label;

    const input = document.createElement('input');
    input.id = `${field}-${index}`;
    input.type = 'color';
    input.value = value;
    input.dataset.index = String(index);
    input.dataset.field = field;

    wrapper.appendChild(fieldLabel);
    wrapper.appendChild(input);
    return wrapper;
  }

  function createPreviewField(category) {
    const wrapper = document.createElement('div');
    wrapper.className = 'field';

    const fieldLabel = document.createElement('label');
    fieldLabel.textContent = 'Preview';

    const preview = document.createElement('div');
    preview.className = 'preview-tile';
    preview.textContent = category.label;
    preview.style.backgroundColor = category.backgroundColor;
    preview.style.color = category.textColor;

    wrapper.appendChild(fieldLabel);
    wrapper.appendChild(preview);
    return wrapper;
  }

  function onCategoryCountChange() {
    const desiredCount = Number(categoryCountInput.value);
    if (!Number.isInteger(desiredCount)) {
      categoryCountInput.value = String(workingSettings.categoryCount);
      return;
    }

    const bounded = Math.min(Math.max(desiredCount, shared.MIN_CATEGORIES), shared.MAX_CATEGORIES);
    workingSettings = shared.ensureCategorySlots(workingSettings, bounded);
    workingSettings.categoryCount = bounded;
    renderCategoryRows();
    setStatus('');
  }

  function onCategoryFieldsInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const index = Number(target.dataset.index);
    const field = target.dataset.field;
    if (!Number.isInteger(index) || !field) {
      return;
    }

    workingSettings = shared.ensureCategorySlots(workingSettings, index + 1);
    workingSettings.categories[index][field] = target.value;
    updateRowPreview(index);
    setStatus('');
  }

  async function onSaveSettings() {
    try {
      const savedSettings = await shared.saveSettings(workingSettings);
      workingSettings = savedSettings;
      render();
      setStatus('Settings saved.');
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Unable to save settings.', true);
    }
  }

  async function onRestoreDefaults() {
    try {
      const restored = await shared.saveSettings(shared.getDefaultSettings());
      workingSettings = restored;
      render();
      setStatus('Defaults restored.');
    } catch (error) {
      console.error(error);
      setStatus('Unable to restore defaults.', true);
    }
  }

  function setStatus(message, isError) {
    status.textContent = message;
    status.classList.toggle('error', Boolean(isError));
  }

  function updateRowPreview(index) {
    const row = categoryFields.children[index];
    const category = workingSettings.categories[index];
    if (!(row instanceof HTMLElement) || !category) {
      return;
    }

    row.style.borderLeftColor = category.backgroundColor;

    const preview = row.querySelector('.preview-tile');
    if (!(preview instanceof HTMLElement)) {
      return;
    }

    preview.textContent = category.label;
    preview.style.backgroundColor = category.backgroundColor;
    preview.style.color = category.textColor;
  }
}());
