/**
 * Cradle UI — HTML Escaping Utility
 * ─────────────────────────────────
 * Shared helper for escaping user-controlled text before it is
 * interpolated into innerHTML. Mirrors the UMD shape used across Cradle:
 *
 *   Browser:  window.CradleEscape.escapeHtml(value)
 *             window.CradleEscape.html`<div>${userInput}</div>`
 *   Node:     const { escapeHtml, html, raw } = require("src/components/ui/escapeHtml.js")
 *
 * Escapes & < > " ' so that markup in the input is rendered inert.
 * Returns "" for null/undefined and coerces other values via String().
 *
 * Usage:
 *   el.innerHTML = html`<p class="msg">${userInput}</p>`;
 */
(function (exports) {
  "use strict";

  /**
   * Escape HTML special characters (&, <, >, ", ').
   * @param {*} value
   * @returns {string}
   */
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /**
   * Tagged template literal for safely generating HTML markup.
   * Dynamic interpolated values are automatically encoded.
   *
   * @param {TemplateStringsArray} strings
   * @param {...*} values
   * @returns {string}
   */
  function html(strings, ...values) {
    let result = strings[0];
    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      if (Array.isArray(val)) {
        result += val
          .map(item =>
            item && typeof item === "object" && typeof item.__html === "string"
              ? item.__html
              : escapeHtml(item)
          )
          .join("");
      } else if (
        val &&
        typeof val === "object" &&
        typeof val.__html === "string"
      ) {
        result += val.__html;
      } else {
        result += escapeHtml(val);
      }
      result += strings[i + 1];
    }
    return result;
  }

  /**
   * Wraps an already-sanitized string so the `html` template tag does not re-escape it.
   * @param {*} safeValue
   * @returns {{__html: string}}
   */
  function raw(safeValue) {
    return { __html: String(safeValue ?? "") };
  }

  exports.escapeHtml = escapeHtml;
  exports.html = html;
  exports.raw = raw;
})(typeof exports === "undefined" ? (window.CradleEscape = {}) : exports);
