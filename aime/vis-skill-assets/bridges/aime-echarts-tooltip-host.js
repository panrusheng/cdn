/**
 * ECharts tooltip portal (host side).
 *
 * It accepts messages only from opted-in iframes and renders one
 * fixed-position tooltip layer per iframe.
 */
(function installAimeEChartsTooltipHost(global) {
  "use strict";

  if (global.AimeEChartsTooltipHost) return;

  var CHANNEL = "aime-echarts-tooltip";
  var VERSION = 1;
  var portals = new Map();
  var SAFE_TAGS = {
    B: true, BR: true, DIV: true, EM: true, I: true, LI: true, OL: true,
    P: true, SPAN: true, STRONG: true, TABLE: true, TBODY: true,
    TD: true, TH: true, THEAD: true, TR: true, UL: true
  };
  var SAFE_OUTER_STYLES = {
    background: true, border: true, borderRadius: true, boxShadow: true,
    boxSizing: true, color: true, font: true, lineHeight: true, maxWidth: true,
    padding: true, whiteSpace: true
  };

  function isSafeCssValue(value) {
    return !/url\s*\(|expression\s*\(|javascript\s*:/i.test(String(value || ""));
  }

  function sanitizeHtml(html) {
    var template = document.createElement("template");
    template.innerHTML = String(html || "");
    Array.prototype.slice.call(template.content.querySelectorAll("*")).forEach(function (element) {
      if (!SAFE_TAGS[element.tagName]) {
        element.replaceWith(document.createTextNode(element.textContent || ""));
        return;
      }
      Array.prototype.slice.call(element.attributes).forEach(function (attribute) {
        if (attribute.name !== "style") element.removeAttribute(attribute.name);
      });
      for (var index = element.style.length - 1; index >= 0; index -= 1) {
        var property = element.style[index];
        if (!isSafeCssValue(element.style.getPropertyValue(property))) {
          element.style.removeProperty(property);
        }
      }
    });
    return template.innerHTML;
  }

  function safeOuterStyle(style) {
    var result = {};
    Object.keys(style || {}).forEach(function (property) {
      var value = style[property];
      if (SAFE_OUTER_STYLES[property] && isSafeCssValue(value)) result[property] = value;
    });
    return result;
  }

  function findFrame(source) {
    var frames = document.querySelectorAll(
      "iframe[data-aime-tooltip-portal], iframe.html-live-iframe"
    );
    for (var index = 0; index < frames.length; index += 1) {
      if (frames[index].contentWindow === source) return frames[index];
    }
    return null;
  }

  function createPortal(frame) {
    var element = document.createElement("div");
    element.setAttribute("data-aime-tooltip-portal-layer", "");
    element.setAttribute("role", "tooltip");
    Object.assign(element.style, {
      display: "none",
      left: "0",
      pointerEvents: "none",
      position: "fixed",
      top: "0",
      zIndex: "2147483647"
    });
    document.body.appendChild(element);
    var portal = { element: element, frame: frame, payload: null };
    portals.set(frame, portal);
    return portal;
  }

  function getPortal(frame) {
    return portals.get(frame) || createPortal(frame);
  }

  function applyPosition(portal) {
    var payload = portal.payload;
    var frame = portal.frame;
    if (!payload || !frame.isConnected) {
      portal.element.style.display = "none";
      return;
    }
    var frameRect = frame.getBoundingClientRect();
    var viewport = payload.viewport || {};
    var scaleX = viewport.width ? frameRect.width / viewport.width : 1;
    var scaleY = viewport.height ? frameRect.height / viewport.height : 1;
    portal.element.style.left = frameRect.left + payload.rect.left * scaleX + "px";
    portal.element.style.top = frameRect.top + payload.rect.top * scaleY + "px";
  }

  function show(frame, payload) {
    var portal = getPortal(frame);
    portal.payload = payload;
    portal.element.innerHTML = sanitizeHtml(payload.html);
    Object.assign(portal.element.style, safeOuterStyle(payload.style), {
      display: "block",
      opacity: "1",
      pointerEvents: "none",
      position: "fixed",
      transform: "none",
      visibility: "visible",
      zIndex: "2147483647"
    });
    applyPosition(portal);
  }

  function hide(frame) {
    var portal = portals.get(frame);
    if (!portal) return;
    portal.payload = null;
    portal.element.style.display = "none";
  }

  function prune() {
    portals.forEach(function (portal, frame) {
      if (frame.isConnected) return;
      portal.element.remove();
      portals.delete(frame);
    });
  }

  global.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.channel !== CHANNEL || data.version !== VERSION) return;
    var frame = findFrame(event.source);
    if (!frame) return;
    if (data.type === "hide") hide(frame);
    if (data.type === "show" && data.rect) show(frame, data);
  });

  global.addEventListener("resize", function () {
    portals.forEach(applyPosition);
  });
  global.addEventListener("scroll", function () {
    portals.forEach(applyPosition);
  }, true);

  new MutationObserver(prune).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  global.AimeEChartsTooltipHost = {
    channel: CHANNEL,
    hideAll: function () { portals.forEach(function (portal) { hide(portal.frame); }); },
    version: VERSION
  };
})(window);
