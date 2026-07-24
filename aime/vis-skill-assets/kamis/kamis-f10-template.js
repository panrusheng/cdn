(function() {
  'use strict';

  var currentScript = document.currentScript;
  var assetBase = new URL('.', currentScript.src).href;
  var appearance = window.appearance === 'dark' ? 'dark' : 'light';

  document.documentElement.dataset.theme = appearance;
  if (typeof process === 'undefined') window.process = { env: { NODE_ENV: 'production' }, browser: true };
  if (typeof setImmediate === 'undefined') window.setImmediate = function(fn) { return setTimeout(fn, 0); };
  if (typeof clearImmediate === 'undefined') window.clearImmediate = clearTimeout;
  if (typeof global === 'undefined') window.global = window;

  function ensureAinvestNovaThemeBridge() {
    var nova = window.__AINVEST_NOVA__ = window.__AINVEST_NOVA__ || {};
    if (!nova.EventBus || typeof nova.EventBus.on !== 'function') {
      var eventHandlers = new Map();
      nova.EventBus = {
        on: function(name, handler) {
          if (!eventHandlers.has(name)) eventHandlers.set(name, new Map());
          var id = Date.now() + '_' + Math.random().toString(36).slice(2);
          eventHandlers.get(name).set(id, handler);
          return id;
        },
        off: function(name, id) {
          var handlers = eventHandlers.get(name);
          if (handlers) handlers.delete(id);
        },
        emit: function(name, payload) {
          var handlers = eventHandlers.get(name);
          if (handlers) handlers.forEach(function(handler) { handler(payload); });
        }
      };
    }
    nova.Store = nova.Store || {};
    nova.Store.systemInfo_getThemeMode = function() {
      return window.appearance === 'dark' ? 'dark' : 'light';
    };
  }

  function getFinancialsSection(input) {
    if (input.page === 22831) return 'earnings/';
    if (input.page !== 22838) return '';

    var scene = String(input.data.scene || '');
    if (scene.startsWith('Key-Indicators::')) return 'statistics/';
    if (
      scene.startsWith('Income-Statement::')
      || scene.startsWith('Balance-Sheet::')
      || scene.startsWith('Cash-Flow::')
    ) {
      return 'statement/';
    }
    if (scene.startsWith('Revenue-Breakdown-')) return 'revenue-breakdown/';
    return '';
  }

  function configureFrame(input) {
    var isSankey = input.page === 20863;
    var chartWrap = document.querySelector('.chart-wrap');
    var chromeRoot = document.getElementById('chrome-root');
    var exchangeByMarket = { '185': 'NASDAQ', '169': 'NYSE' };
    var exchange = exchangeByMarket[String(input.data.market)];
    var externalLink = document.createElement('a');

    externalLink.className = 'f10-external-link';
    externalLink.target = '_blank';
    externalLink.rel = 'noopener noreferrer';
    externalLink.setAttribute('aria-label', 'Open financials on AInvest');
    externalLink.title = 'Open financials on AInvest';
    externalLink.innerHTML = [
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">',
      '<path d="M14 5h5v5M19 5l-8 8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />',
      '<path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />',
      '</svg>'
    ].join('');
    chartWrap.insertBefore(externalLink, chartWrap.firstChild);

    if (isSankey) {
      var header = document.createElement('div');
      var title = document.createElement('div');
      header.className = 'f10-header';
      title.className = 'ki-module-label f10-section-title';
      title.textContent = 'Revenue & Expenses';
      header.appendChild(title);
      chartWrap.insertBefore(header, chromeRoot);
      externalLink.classList.add('f10-sankey-link');
    }

    if (exchange) {
      externalLink.href = 'https://www.ainvest.com/stocks/'
        + exchange + '-' + encodeURIComponent(input.data.code)
        + '/financials/' + getFinancialsSection(input);
    } else {
      externalLink.hidden = true;
    }
  }

  function loadRenderer(input) {
    var schemaScript = document.createElement('script');
    schemaScript.src = assetBase + 'schema_' + input.page + '.js';
    schemaScript.onload = function() {
      var data = Object.assign({}, input.data);
      data.theme = window.appearance === 'dark' ? 'dark' : 'light';
      if (input.page === 22831 && data.scene && data.scene.startsWith('Earning::')) {
        data.scene = data.scene.replace('Earning::', '');
      }
      ensureAinvestNovaThemeBridge();
      window.KAMIS_CONFIG = {
        schema: window['__KAMIS_SCHEMA_' + input.page],
        data: data,
        page: String(input.page)
      };
      var renderer = document.createElement('script');
      renderer.src = assetBase + 'kamis-renderer.js';
      document.body.appendChild(renderer);
    };
    document.head.appendChild(schemaScript);
  }

  function init() {
    var input = window.KAMIS_INPUT;
    if (!input) return;
    configureFrame(input);
    loadRenderer(input);
  }

  ensureAinvestNovaThemeBridge();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
