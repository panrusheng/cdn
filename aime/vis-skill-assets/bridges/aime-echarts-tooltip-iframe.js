/**
 * ECharts tooltip bridge (iframe side).
 *
 * Load after a global ECharts bundle for automatic patching, or call
 * `AimeEChartsTooltipBridge.attach(echartsInstance)` for wrapped/private ECharts.
 */
(function installAimeEChartsTooltipBridge(global) {
  "use strict";

  if (global.AimeEChartsTooltipBridge) return;

  var CHANNEL = "aime-echarts-tooltip";
  var VERSION = 1;
  var SOURCE_CLASS = "__aime_echarts_tooltip_source__";
  var PATCHED_INSTANCE = "__aimeTooltipBridgePatched__";
  var PATCHED_GLOBAL = "__aimeTooltipBridgeGlobalPatched__";
  var activeId = null;
  var nextId = 1;
  var scheduled = false;

  var SAFE_TAGS = {
    B: true, BR: true, DIV: true, EM: true, I: true, LI: true, OL: true,
    P: true, SPAN: true, STRONG: true, TABLE: true, TBODY: true,
    TD: true, TH: true, THEAD: true, TR: true, UL: true
  };
  var STYLE_PROPS = [
    "alignItems", "background", "backgroundColor", "border", "borderBottom",
    "borderLeft", "borderRadius", "borderRight", "borderTop", "boxSizing",
    "color", "columnGap", "display", "flex", "flexDirection", "flexWrap",
    "fontFamily", "fontSize", "fontStyle", "fontWeight", "gap", "height",
    "justifyContent", "letterSpacing", "lineHeight", "margin", "marginBottom",
    "marginLeft", "marginRight", "marginTop", "maxHeight", "maxWidth",
    "minHeight", "minWidth", "padding", "paddingBottom", "paddingLeft",
    "paddingRight", "paddingTop", "rowGap", "textAlign", "textDecoration",
    "verticalAlign", "whiteSpace", "width", "wordBreak"
  ];

  function post(payload) {
    try {
      global.parent.postMessage(Object.assign({
        channel: CHANNEL,
        version: VERSION
      }, payload), "*");
    } catch (_) {}
  }

  function appendClassName(value) {
    var names = String(value || "").split(/\s+/).filter(function (name) {
      return Boolean(name) && name !== "undefined" && name !== "null";
    });
    if (names.indexOf(SOURCE_CLASS) < 0) names.push(SOURCE_CLASS);
    return names.join(" ");
  }

  function patchTooltip(tooltip) {
    if (!tooltip || typeof tooltip !== "object") return tooltip;
    return Object.assign({}, tooltip, {
      appendToBody: true,
      className: appendClassName(tooltip.className),
      confine: false,
      renderMode: "html"
    });
  }

  function normalizeOption(option) {
    if (!option || typeof option !== "object") return option;
    var normalized = Object.assign({}, option);

    if (option.tooltip !== undefined) {
      normalized.tooltip = Array.isArray(option.tooltip)
        ? option.tooltip.map(patchTooltip)
        : patchTooltip(option.tooltip);
    }

    var hasCartesianAxes = option.xAxis !== undefined || option.yAxis !== undefined;
    var grids = option.grid === undefined
      ? (hasCartesianAxes ? [{ containLabel: true }] : [])
      : (Array.isArray(option.grid) ? option.grid : [option.grid]).map(function (grid) {
          if (!grid || typeof grid !== "object" || grid.containLabel !== undefined) return grid;
          return Object.assign({}, grid, { containLabel: true });
        });
    if (grids.length) normalized.grid = Array.isArray(option.grid) ? grids : grids[0];

    var axes = option.yAxis == null ? [] : (Array.isArray(option.yAxis) ? option.yAxis : [option.yAxis]);
    if (axes.length) {
      var nextAxes = axes.map(function (axis) {
        if (!axis || typeof axis !== "object" || !axis.name || (axis.nameLocation || "end") !== "end") {
          return axis;
        }
        var textStyle = Object.assign({}, axis.nameTextStyle || {});
        if (textStyle.align === undefined) {
          textStyle.align = axis.position === "right" ? "right" : "left";
        }
        return Object.assign({}, axis, {
          nameGap: axis.nameGap === undefined ? 14 : axis.nameGap,
          nameTextStyle: textStyle
        });
      });
      normalized.yAxis = Array.isArray(option.yAxis) ? nextAxes : nextAxes[0];
    }
    return normalized;
  }

  function attach(instance) {
    if (!instance || typeof instance.setOption !== "function" || instance[PATCHED_INSTANCE]) {
      return instance;
    }
    instance[PATCHED_INSTANCE] = true;
    var rawSetOption = instance.setOption;
    instance.setOption = function (option) {
      var args = Array.prototype.slice.call(arguments, 1);
      try { option = normalizeOption(option); } catch (_) {}
      return rawSetOption.apply(this, [option].concat(args));
    };
    startObserver();
    return instance;
  }

  function patchGlobalECharts(echarts) {
    if (!echarts || typeof echarts.init !== "function" || echarts[PATCHED_GLOBAL]) return;
    echarts[PATCHED_GLOBAL] = true;
    var rawInit = echarts.init;
    echarts.init = function () {
      return attach(rawInit.apply(this, arguments));
    };
  }

  function copyComputedStyle(source, target) {
    var computed = global.getComputedStyle(source);
    STYLE_PROPS.forEach(function (property) {
      var value = computed[property];
      if (value) target.style[property] = value;
    });
  }

  function cloneSafe(node) {
    if (node.nodeType === 3) return document.createTextNode(node.nodeValue || "");
    if (node.nodeType !== 1) return null;
    var tag = node.tagName.toUpperCase();
    var clone = document.createElement(SAFE_TAGS[tag] ? tag.toLowerCase() : "span");
    copyComputedStyle(node, clone);
    Array.prototype.forEach.call(node.childNodes, function (child) {
      var safeChild = cloneSafe(child);
      if (safeChild) clone.appendChild(safeChild);
    });
    return clone;
  }

  function snapshotHtml(source) {
    var container = document.createElement("div");
    Array.prototype.forEach.call(source.childNodes, function (child) {
      var clone = cloneSafe(child);
      if (clone) container.appendChild(clone);
    });
    return container.innerHTML;
  }

  function tooltipStyle(source) {
    var computed = global.getComputedStyle(source);
    return {
      background: computed.background,
      border: computed.border,
      borderRadius: computed.borderRadius,
      boxShadow: computed.boxShadow,
      boxSizing: computed.boxSizing,
      color: computed.color,
      font: computed.font,
      lineHeight: computed.lineHeight,
      maxWidth: computed.maxWidth,
      padding: computed.padding,
      whiteSpace: computed.whiteSpace
    };
  }

  function isVisible(element) {
    var rect = element.getBoundingClientRect();
    return Boolean(
      element.innerHTML.trim() &&
      element.style.display !== "none" &&
      element.style.visibility !== "hidden" &&
      element.style.opacity !== "0" &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function registerTooltipSource(node) {
    if (
      !node ||
      node.nodeType !== 1 ||
      node.tagName !== "DIV" ||
      node.domBelongToZr !== true
    ) {
      return;
    }
    if (!node.classList.contains(SOURCE_CLASS)) node.classList.add(SOURCE_CLASS);
  }

  function discoverTooltipSources(node) {
    if (!node || node.nodeType !== 1) return;
    registerTooltipSource(node);
    Array.prototype.forEach.call(node.querySelectorAll("div"), registerTooltipSource);
  }

  function syncTooltip() {
    scheduled = false;
    var sources = document.querySelectorAll("." + SOURCE_CLASS);
    var source = null;
    for (var index = sources.length - 1; index >= 0; index -= 1) {
      if (isVisible(sources[index])) {
        source = sources[index];
        break;
      }
    }

    if (!source) {
      if (activeId !== null) post({ type: "hide", id: activeId });
      activeId = null;
      return;
    }

    if (!source.dataset.aimeTooltipId) {
      source.dataset.aimeTooltipId = String(nextId++);
    }
    activeId = source.dataset.aimeTooltipId;
    var rect = source.getBoundingClientRect();
    post({
      type: "show",
      id: activeId,
      html: snapshotHtml(source),
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      },
      viewport: {
        width: global.innerWidth || document.documentElement.clientWidth,
        height: global.innerHeight || document.documentElement.clientHeight
      },
      style: tooltipStyle(source)
    });
  }

  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    global.requestAnimationFrame(syncTooltip);
  }

  var observerStarted = false;
  function startObserver() {
    if (observerStarted || !document.documentElement) return;
    observerStarted = true;
    var style = document.createElement("style");
    style.textContent = "." + SOURCE_CLASS + "{opacity:0!important;pointer-events:none!important}";
    (document.head || document.documentElement).appendChild(style);
    discoverTooltipSources(document.documentElement);
    new MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.type === "attributes") registerTooltipSource(record.target);
        Array.prototype.forEach.call(record.addedNodes || [], discoverTooltipSources);
      });
      scheduleSync();
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
      characterData: true,
      childList: true,
      subtree: true
    });
    global.addEventListener("pagehide", function () {
      post({ type: "hide", id: activeId });
    });
  }

  global.AimeEChartsTooltipBridge = {
    attach: attach,
    channel: CHANNEL,
    version: VERSION
  };

  patchGlobalECharts(global.echarts);
  startObserver();
})(window);
