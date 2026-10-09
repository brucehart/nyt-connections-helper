(function () {
  'use strict';

  const shared = globalThis.NytConnectionsHelperShared;
  const CARD_SELECTOR = 'label[data-testid="card-label"]';
  const CYCLE_CLASS = 'nch-connections-cycle';
  const CYCLE_ATTR = 'data-nch-connections-cycle';
  const TOOLBAR_ID = 'nch-connections-toolbar';
  const TOOLBAR_FLOAT_ATTR = 'data-nch-floating';
  const STYLE_ID = 'nch-connections-styles';
  // Classic Connections and the Athletic's Sports Edition mark selected tiles
  // with different CSS module classes. Sports Edition swaps the selected class
  // for its shake/shuffle variants while those animations run.
  const SELECTED_CLASS_FRAGMENTS = [
    'Card-module_selected',
    'Card_cardAnimationSelected',
    'Card_cardAnimationShake',
    'Card_shuffleSelected'
  ];
  const SELECTED_CLASS_SELECTOR = SELECTED_CLASS_FRAGMENTS
    .map(fragment => `[class*="${fragment}"]`).join(', ');
  const CLASS_TRACKED_CARD_SELECTOR = '[class*="Card-module_"], [class*="Card_cardAnimation"]';
  const customStateByCardKey = new Map();
  const pointerDownPhaseByKey = new Map();

  let currentSettings = shared.getDefaultSettings();
  let reapplyQueued = false;
  let toolbarDeselecting = false;
  let labelClickKey = '';
  let gameHooksAttached = false;
  let gameObserver = null;
  let bootstrapObserver = null;

  init().catch(error => {
    console.error('NYT Connections Helper failed to initialize.', error);
  });

  async function init() {
    currentSettings = await shared.loadSettings();
    pruneCustomStates();
    updateStyles();
    activateWhenReady();

    shared.subscribeToSettingsChanges(nextSettings => {
      currentSettings = nextSettings;
      pruneCustomStates();
      updateStyles();
      activateWhenReady();
      queueReapply();
    });
  }

  function activateWhenReady() {
    if (hasGameCards()) {
      attachGameHooks();
      stopBootstrapObserver();
      queueReapply();
      return;
    }

    removeToolbar();
    startBootstrapObserver();
  }

  function attachGameHooks() {
    if (!gameHooksAttached) {
      window.addEventListener('pointerdown', onPointerDown, true);
      window.addEventListener('click', onCardClick, true);
      gameHooksAttached = true;
    }

    if (gameObserver) {
      return;
    }

    gameObserver = new MutationObserver(() => {
      if (!hasGameCards()) {
        stopGameObserver();
        removeToolbar();
        startBootstrapObserver();
        return;
      }

      queueReapply();
    });
    gameObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function startBootstrapObserver() {
    if (bootstrapObserver || hasGameCards()) {
      return;
    }

    bootstrapObserver = new MutationObserver(() => {
      if (hasGameCards()) {
        attachGameHooks();
        stopBootstrapObserver();
        queueReapply();
      }
    });
    bootstrapObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function stopBootstrapObserver() {
    if (!bootstrapObserver) {
      return;
    }

    bootstrapObserver.disconnect();
    bootstrapObserver = null;
  }

  function stopGameObserver() {
    if (!gameObserver) {
      return;
    }

    gameObserver.disconnect();
    gameObserver = null;
  }

  function getActiveCategories() {
    return currentSettings.categories.slice(0, currentSettings.categoryCount);
  }

  function getMaxColorState() {
    return getActiveCategories().length;
  }

  function getMaxCyclePhase() {
    return getMaxColorState() + 1;
  }

  function pruneCustomStates() {
    const maxState = getMaxColorState();
    for (const [key, state] of customStateByCardKey.entries()) {
      if (state > maxState) {
        customStateByCardKey.delete(key);
      }
    }
  }

  function onPointerDown(event) {
    if (!event.isTrusted) {
      return;
    }

    const card = getCardFromTarget(event.target);
    if (!card || isDisabled(card)) {
      return;
    }

    const key = getCardKey(card);
    if (!key) {
      return;
    }

    const phase = getCyclePhase(key, card);
    pointerDownPhaseByKey.set(key, phase);

    if (phase > 1 && !event.ctrlKey && !toolbarDeselecting) {
      event.stopImmediatePropagation();
    }
  }

  function onCardClick(event) {
    if (!event.isTrusted) {
      return;
    }

    const card = getCardFromTarget(event.target);
    if (!card || isDisabled(card)) {
      return;
    }

    const key = getCardKey(card);
    if (!key) {
      return;
    }

    // A label click that isn't cancelled is re-dispatched to the card's
    // checkbox. Sports Edition has already selected the card on pointerdown by
    // then, so the echo would look like a second click on a selected card.
    if (event.target instanceof HTMLInputElement) {
      if (labelClickKey === key) {
        return;
      }
    } else {
      labelClickKey = key;
      setTimeout(() => {
        labelClickKey = '';
      }, 0);
    }

    const savedPhase = pointerDownPhaseByKey.get(key);
    pointerDownPhaseByKey.delete(key);

    const currentPhase = savedPhase !== undefined ? savedPhase : getCyclePhase(key, card);
    const liveSelected = isSelectedByGame(card);
    const ctrlPressed = event.ctrlKey;

    if (ctrlPressed) {
      if (currentPhase === 1) {
        setCustomState(key, 0);
        if (!liveSelected) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        queueReapplyAfterDeselection(key);
        queueFallbackDeselection(key);
        return;
      }

      setCustomState(key, 0);
      queueReapply();
      return;
    }

    if (currentPhase === 0) {
      setCustomState(key, 0);
      return;
    }

    if (currentPhase === 1) {
      setCustomState(key, 1);
      if (!liveSelected) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      queueReapplyAfterDeselection(key);
      queueFallbackDeselection(key);
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    const nextPhase = currentPhase >= getMaxCyclePhase() ? 0 : currentPhase + 1;
    applyPhase(key, nextPhase);
  }

  function getCardFromTarget(target) {
    if (!(target instanceof Element)) {
      return null;
    }
    return target.closest(CARD_SELECTOR);
  }

  function getCardKey(card) {
    const text = extractStableTileText(card);
    return text ? `text:${text}` : '';
  }

  function extractStableTileText(card) {
    const ariaLabel = card.getAttribute('aria-label');
    if (ariaLabel) {
      const ariaText = normalizeText(stripStateWords(ariaLabel.split(',')[0] || ''));
      if (ariaText) {
        return ariaText;
      }
    }

    const rawText = card.innerText || card.textContent || '';
    const lines = rawText.split(/\n+/);
    for (const line of lines) {
      const cleaned = normalizeText(stripStateWords(line));
      if (cleaned) {
        return cleaned;
      }
    }

    // Sports Edition image tiles (player headshots) have no visible text.
    const input = card.querySelector('input');
    return input ? normalizeText(input.value || '') : '';
  }

  function stripStateWords(text) {
    return text.replace(/\b(?:SELECTED|UNSELECTED|NOT\s+SELECTED)\b/gi, ' ');
  }

  function findCardByKey(key) {
    if (!key) {
      return null;
    }

    const cards = document.querySelectorAll(CARD_SELECTOR);
    for (const card of cards) {
      if (getCardKey(card) === key) {
        return card;
      }
    }

    return null;
  }

  function normalizeText(text) {
    return text.replace(/\s+/g, ' ').trim().toUpperCase();
  }

  function setCustomState(key, state) {
    if (state === 0) {
      customStateByCardKey.delete(key);
      return;
    }

    customStateByCardKey.set(key, state);
  }

  function getCyclePhase(key, card) {
    if (isSelectedByGame(card)) {
      return 1;
    }

    const customState = customStateByCardKey.get(key) || 0;
    if (customState > 0) {
      return customState + 1;
    }

    return 0;
  }

  function applyPhase(key, phase) {
    if (phase === 0 || phase === 1) {
      setCustomState(key, 0);
      queueReapply();
      return;
    }

    setCustomState(key, phase - 1);
    queueReapply();
  }

  function queueReapplyAfterDeselection(key, attempt) {
    const currentAttempt = typeof attempt === 'number' ? attempt : 0;

    requestAnimationFrame(() => {
      const card = findCardByKey(key);
      if (!card || isDisabled(card)) {
        queueReapply();
        return;
      }

      if (!isSelectedByGame(card) || currentAttempt >= 8) {
        queueReapply();
        return;
      }

      queueReapplyAfterDeselection(key, currentAttempt + 1);
    });
  }

  function queueReapply() {
    if (reapplyQueued) {
      return;
    }

    reapplyQueued = true;
    requestAnimationFrame(() => {
      reapplyQueued = false;
      protectInterstitialControls();
      if (!hasGameCards()) {
        removeToolbar();
        return;
      }
      compactGameLayout();
      ensureToolbar();
      reapplyAllStates();
    });
  }

  function reapplyAllStates() {
    const cards = document.querySelectorAll(CARD_SELECTOR);
    for (const card of cards) {
      const key = getCardKey(card);
      const state = key ? (customStateByCardKey.get(key) || 0) : 0;
      applyStateToCard(card, state);
    }
  }

  function applyStateToCard(card, state) {
    if (!card) {
      return;
    }

    if (state === 0) {
      card.classList.remove(CYCLE_CLASS);
      card.removeAttribute(CYCLE_ATTR);
      return;
    }

    card.classList.add(CYCLE_CLASS);
    card.setAttribute(CYCLE_ATTR, String(state));
  }

  function isDisabled(card) {
    if (card.getAttribute('aria-disabled') === 'true') {
      return true;
    }

    const input = card.querySelector('input');
    return Boolean(input && input.disabled);
  }

  function isSelectedByGame(card) {
    if (
      card.getAttribute('aria-pressed') === 'true' ||
      card.getAttribute('aria-selected') === 'true' ||
      card.getAttribute('aria-checked') === 'true' ||
      card.getAttribute('data-state') === 'selected'
    ) {
      return true;
    }

    if (card.matches(SELECTED_CLASS_SELECTOR)) {
      return true;
    }

    // Both games leave the hidden checkbox checked after Deselect, so when the
    // card carries the game's CSS module classes, trust those alone.
    if (card.matches(CLASS_TRACKED_CARD_SELECTOR)) {
      return false;
    }

    const selectedDescendant = card.querySelector(
      `input:checked, [aria-checked="true"], [aria-pressed="true"], [aria-selected="true"], [data-state="selected"], ${SELECTED_CLASS_SELECTOR}`
    );
    if (selectedDescendant) {
      return true;
    }

    const input = card.querySelector('input');
    return Boolean(input && input.checked);
  }

  function ensureToolbar() {
    if (!document.body) {
      return;
    }

    if (!hasGameCards()) {
      removeToolbar();
      return;
    }

    const mountPoint = findToolbarMountPoint();
    let toolbar = document.getElementById(TOOLBAR_ID);

    if (!toolbar) {
      toolbar = createToolbar();
    }

    const signature = getToolbarSignature();
    if (toolbar.getAttribute('data-nch-signature') !== signature) {
      toolbar.replaceChildren(buildToolbarContent());
      toolbar.setAttribute('data-nch-signature', signature);
    }

    if (mountPoint) {
      toolbar.removeAttribute(TOOLBAR_FLOAT_ATTR);
      matchNativeButtonFont(toolbar, mountPoint);
      // Share the native controls' normal flow. The animated tile board can
      // contain absolutely positioned layers that are unsafe toolbar anchors.
      if (toolbar.parentElement !== mountPoint || mountPoint.firstElementChild !== toolbar) {
        mountPoint.prepend(toolbar);
      }
      return;
    }

    toolbar.setAttribute(TOOLBAR_FLOAT_ATTR, 'true');
    if (toolbar.parentElement !== document.body) {
      document.body.appendChild(toolbar);
    }
  }

  function matchNativeButtonFont(toolbar, mountPoint) {
    // Sports Edition's page font is a serif, unlike its control buttons.
    const nativeButton = mountPoint.querySelector(`button:not(#${TOOLBAR_ID} button)`);
    const fontFamily = nativeButton ? getComputedStyle(nativeButton).fontFamily : '';
    if (fontFamily && toolbar.style.fontFamily !== fontFamily) {
      toolbar.style.fontFamily = fontFamily;
    }
  }

  function hasGameCards() {
    const cards = document.querySelectorAll(CARD_SELECTOR);
    for (const card of cards) {
      if (isCardVisible(card)) {
        return true;
      }
    }

    return false;
  }

  function isCardVisible(card) {
    if (!(card instanceof Element)) {
      return false;
    }

    return card.getClientRects().length > 0;
  }

  function removeToolbar() {
    document.documentElement.removeAttribute('data-nch-game-ready');
    const toolbar = document.getElementById(TOOLBAR_ID);
    if (toolbar) {
      toolbar.remove();
    }
  }

  function getToolbarSignature() {
    return JSON.stringify(getActiveCategories());
  }

  function protectInterstitialControls() {
    // Ad banners often contain advertiser links or a close button. Preserve
    // the entry/skip controls specifically, rather than every clickable ad.
    for (const control of document.querySelectorAll('button, a, input, [role="button"]')) {
      const label = [control.getAttribute('aria-label'), control.textContent, control.value]
        .filter(Boolean).join(' ');
      control.toggleAttribute('data-nch-ad-continue', /\b(?:continue|skip|play)\b/i.test(label));
    }
  }

  function markAdvertisementSpace() {
    // The visible "advertisement" label survives even when NYT changes the
    // slot's identifiers. Collapse its ad-only ancestors, not just the label.
    const protectedContent = `${CARD_SELECTOR}, button, input, [role="button"], [data-nch-ad-continue], dialog, [role="dialog"], [aria-modal="true"], nav, header, h1, h2`;
    for (const previous of document.querySelectorAll('[data-nch-ad-space]')) {
      previous.removeAttribute('data-nch-ad-space');
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const labels = [];
    while (walker.nextNode()) {
      if (normalizeText(walker.currentNode.textContent) === 'ADVERTISEMENT') {
        labels.push(walker.currentNode.parentElement);
      }
    }
    for (const label of labels) {
      if (label.closest('script, style, dialog, [role="dialog"], [aria-modal="true"]')) {
        continue;
      }
      let container = label;
      while (container && container !== document.body && container !== document.documentElement) {
        if (normalizeText(container.textContent) !== 'ADVERTISEMENT' ||
            container.matches(protectedContent) || container.querySelector(protectedContent)) {
          break;
        }
        container.setAttribute('data-nch-ad-space', '');
        container = container.parentElement;
      }
    }
  }

  function findToolbarMountPoint() {
    const controlsButton = document.querySelector(
      'button[data-testid="shuffle-btn"], button[data-testid="submit-btn"], button[aria-label="Shuffle"], button[aria-label="Submit"]'
    ) || findControlButton('SHUFFLE') || findControlButton('SUBMIT');
    if (!controlsButton) {
      return null;
    }

    let node = controlsButton.parentElement;
    while (node && node !== document.body) {
      // Never insert the toolbar above the board or into a page-wide wrapper.
      if (node.querySelector(CARD_SELECTOR)) {
        return null;
      }
      if (node.querySelectorAll(`button:not(#${TOOLBAR_ID} button)`).length >= 2) {
        return node;
      }
      node = node.parentElement;
    }

    return null;
  }

  function compactGameLayout() {
    const card = Array.from(document.querySelectorAll(CARD_SELECTOR)).find(isCardVisible);
    const controls = findToolbarMountPoint();
    if (!card || !controls) {
      return;
    }

    // Find the shared game wrapper without depending on hashed site classes.
    let game = card.parentElement;
    while (game && game !== document.body && !game.contains(controls)) {
      game = game.parentElement;
    }
    if (!game || game === document.body || game === document.documentElement) {
      return;
    }

    controls.setAttribute('data-nch-compact-controls', '');
    markAdvertisementSpace();
    document.documentElement.setAttribute('data-nch-game-ready', '');
    game.setAttribute('data-nch-compact-game', '');
    // Leave all board-internal dimensions intact, including animation layers.
    let wrapper = controls.parentElement;
    while (wrapper && wrapper !== game && game.contains(wrapper)) {
      wrapper.setAttribute('data-nch-compact-shell', '');
      wrapper = wrapper.parentElement;
    }
    let shell = game;
    while (shell && shell !== document.body && shell !== document.documentElement) {
      shell.setAttribute('data-nch-compact-shell', '');
      const layout = getComputedStyle(shell);
      shell.toggleAttribute('data-nch-column-shell',
        layout.display.includes('flex') && layout.flexDirection === 'column');
      if (shell.matches('main, [role="main"]')) {
        break;
      }
      shell = shell.parentElement;
    }
  }

  function createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = TOOLBAR_ID;
    toolbar.appendChild(buildToolbarContent());
    toolbar.setAttribute('data-nch-signature', getToolbarSignature());
    return toolbar;
  }

  function buildToolbarContent() {
    const fragment = document.createDocumentFragment();
    const activeCategories = getActiveCategories();

    for (let index = 0; index < activeCategories.length; index += 1) {
      const category = activeCategories[index];
      fragment.appendChild(createToolbarButton(category.label, category.backgroundColor, category.textColor, () => {
        applyColorToSelectedCards(index + 1);
      }));
    }

    fragment.appendChild(createToolbarButton('Clear', '#ffffff', '#1d1d1d', () => {
      applyColorToSelectedCards(0);
    }));
    fragment.appendChild(createToolbarButton('Clear All', '#ffffff', '#1d1d1d', clearAllCustomColors));
    return fragment;
  }

  function createToolbarButton(label, backgroundColor, textColor, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = 'nch-toolbar-button';
    button.style.setProperty('--nch-button-bg', backgroundColor);
    button.style.setProperty('--nch-button-text', textColor);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  function applyColorToSelectedCards(state) {
    const selectedCards = getSelectedCards();
    if (selectedCards.length === 0) {
      return;
    }

    for (const selected of selectedCards) {
      setCustomState(selected.key, state);
      queueReapplyAfterDeselection(selected.key);
    }

    toolbarDeselecting = true;
    try {
      if (!clickDeselectAllButton()) {
        for (const selected of selectedCards) {
          toggleCardSelectionOff(selected.card);
        }
      }
    } finally {
      toolbarDeselecting = false;
    }

    queueReapply();
  }

  function getSelectedCards() {
    const cards = document.querySelectorAll(CARD_SELECTOR);
    const selectedCards = [];

    for (const card of cards) {
      if (isDisabled(card) || !isSelectedByGame(card)) {
        continue;
      }

      const key = getCardKey(card);
      if (!key) {
        continue;
      }

      selectedCards.push({ card, key });
    }

    return selectedCards;
  }

  function toggleCardSelectionOff(card) {
    const input = card.querySelector('input');
    if (input && !input.disabled && typeof input.click === 'function') {
      input.click();
      return;
    }

    if (typeof card.click === 'function') {
      card.click();
    }
  }

  function queueFallbackDeselection(key) {
    requestAnimationFrame(() => {
      const card = findCardByKey(key);
      if (!card || isDisabled(card) || !isSelectedByGame(card)) {
        return;
      }

      toggleCardSelectionOff(card);
      queueReapplyAfterDeselection(key);
    });
  }

  function clickDeselectAllButton() {
    // Sports Edition labels this control "Deselect".
    const button = findControlButton('DESELECT ALL') || findControlButton('DESELECT');
    if (!button || button.disabled) {
      return false;
    }

    button.click();
    return true;
  }

  function findControlButton(labelText) {
    const normalizedLabel = normalizeText(labelText);
    const buttons = document.querySelectorAll('button');

    for (const button of buttons) {
      const ariaLabel = button.getAttribute('aria-label');
      if (ariaLabel && normalizeText(ariaLabel) === normalizedLabel) {
        return button;
      }

      const text = button.textContent || '';
      if (normalizeText(text) === normalizedLabel) {
        return button;
      }
    }

    return null;
  }

  function clearAllCustomColors() {
    if (customStateByCardKey.size === 0) {
      return;
    }

    customStateByCardKey.clear();
    queueReapply();
  }

  function updateStyles() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }

    const activeCategories = getActiveCategories();
    const notSelected = `:not(${SELECTED_CLASS_SELECTOR})`;
    let colorRules = '';

    for (let index = 0; index < activeCategories.length; index += 1) {
      const category = activeCategories[index];
      colorRules += `
      .${CYCLE_CLASS}[${CYCLE_ATTR}="${index + 1}"]${notSelected} {
        background-color: ${category.backgroundColor} !important;
        color: ${category.textColor} !important;
      }`;
    }

    style.textContent = `
      .${CYCLE_CLASS}${notSelected} {
        border-color: rgba(0, 0, 0, 0.35) !important;
        box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.22) !important;
      }
      ${colorRules}
      #${TOOLBAR_ID} {
        display: flex;
        flex: 0 0 100%;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-width: 100%;
        grid-column: 1 / -1;
        box-sizing: border-box;
        margin: 6px 0;
      }
      #${TOOLBAR_ID}[${TOOLBAR_FLOAT_ATTR}="true"] {
        position: fixed;
        z-index: 10;
        right: 16px;
        bottom: 16px;
        left: auto;
        width: auto;
        min-width: 0;
        max-width: calc(100vw - 32px);
        margin-top: 0;
        padding: 10px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
      }
      #${TOOLBAR_ID} .nch-toolbar-button {
        appearance: none;
        border: 1px solid rgba(0, 0, 0, 0.2);
        border-radius: 999px;
        min-height: 36px;
        max-width: 100%;
        overflow-wrap: anywhere;
        padding: 6px 10px;
        font: inherit;
        font-weight: 700;
        color: var(--nch-button-text);
        background: var(--nch-button-bg);
        cursor: pointer;
      }
      #${TOOLBAR_ID} .nch-toolbar-button:hover {
        filter: brightness(0.97);
      }
    `;
  }
}());
