/**
 * Cradle UI — SVG Sanitization & Security Utility
 * ────────────────────────────────────────────────
 * Hardens SVG content (such as project gallery thumbnails and user SVGs)
 * against script execution, event handler triggers, and unexpected external
 * resource fetches.
 *
 * Browser:  window.CradleSanitize.sanitizeSvg(svgContent)
 *           window.CradleSanitize.isSvgSafe(svgContent)
 *           window.CradleSanitize.validateSvgThumbnail(svgContent)
 * Node:     const { sanitizeSvg, isSvgSafe, validateSvgThumbnail } = require("./sanitizeSvg.js");
 *
 * Blocked Threats:
 *   - <script> tags and CDATA script blocks
 *   - Inline event handlers (onload, onclick, onmouseover, onbegin, onend, etc.)
 *   - <foreignObject> embedding arbitrary HTML / DOM contexts
 *   - Dangerous pseudo-protocols (javascript:, vbscript:, data:text/html)
 *   - External network references (<use>, <image>, <feImage>, @import)
 *   - XML Entity Expansion (XXE) and <!DOCTYPE> declarations
 *   - SMIL animation hijacking (<set attributeName="href">)
 */
(function (exports) {
  "use strict";

  /**
   * Elements completely disallowed in safe SVGs because they execute
   * code or embed foreign execution contexts.
   */
  const BLOCKED_ELEMENTS = [
    "script",
    "foreignObject",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "textarea",
    "select",
    "button",
    "link",
    "meta",
    "base",
    "applet",
    "audio",
    "video",
    "source",
    "track",
    "handler",
    "listener",
  ];

  const BLOCKED_ELEMENTS_REGEX = new RegExp(
    `<(?:/)?\\s*(?:${BLOCKED_ELEMENTS.join("|")})\\b[^>]*>`,
    "gi"
  );

  const BLOCKED_CONTAINER_REGEX = new RegExp(
    `<\\s*(${BLOCKED_ELEMENTS.join("|")})\\b[^>]*>[\\s\\S]*?<\\s*/\\s*\\1\\s*>`,
    "gi"
  );

  /**
   * Event handlers on any tag (standard DOM events + SVG animation events like onbegin, onend, onrepeat).
   */
  const EVENT_HANDLER_REGEX =
    /\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

  /**
   * Dangerous pseudo-protocols in href, xlink:href, src, etc.
   */
  const DANGEROUS_PROTOCOL_REGEX =
    /\b(?:href|xlink:href|src|action)\s*=\s*(?:"\s*(?:javascript|vbscript|data:(?!image\/(?:png|jpeg|jpg|gif|webp|svg\+xml)))[^"]*"|'\s*(?:javascript|vbscript|data:(?!image\/(?:png|jpeg|jpg|gif|webp|svg\+xml)))[^']*'|(?:javascript|vbscript):[^\s>]+)/gi;

  /**
   * External remote references in <use>, <image>, <feImage> that trigger unexpected HTTP fetches.
   */
  const EXTERNAL_RESOURCE_ATTR_REGEX =
    /<(use|image|feImage)\b([^>]*?)\s+(?:href|xlink:href)\s*=\s*(?:"\s*(?:https?:|\/\/)[^"]*"|'\s*(?:https?:|\/\/)[^']*')([^>]*?)>/gi;

  /**
   * XML Entity declarations (XXE) and DOCTYPE blocks.
   */
  const DOCTYPE_ENTITY_REGEX =
    /<!DOCTYPE\b[\s\S]*?>|<!ENTITY\b[\s\S]*?>|<\?xml-stylesheet\b[\s\S]*?\?>/gi;

  /**
   * Remote stylesheet imports and external url() in CSS styles.
   */
  const STYLE_IMPORT_REGEX =
    /@import\s+(?:url\([^)]+\)|"[^"]+"|'[^']+')\s*;?/gi;

  const DANGEROUS_STYLE_URL_REGEX =
    /\burl\(\s*(?:"\s*(?:https?:|\/\/|javascript:|data:)[^"]*"|'\s*(?:https?:|\/\/|javascript:|data:)[^']*'|(?:https?:|\/\/|javascript:|data:)[^)]*)\s*\)/gi;

  const CSS_EXPRESSION_REGEX =
    /(?:expression|-moz-binding|behavior)\s*:[^;}"']+/gi;

  /**
   * SMIL animations modifying attributes that could redirect navigation or execute code.
   */
  const SMIL_DANGEROUS_ATTR_REGEX =
    /<(?:animate|set|animateTransform)\b[^>]*?\s+attributeName\s*=\s*(?:"(?:href|xlink:href|on\w+)"|'(?:href|xlink:href|on\w+)'|(?:href|xlink:href|on\w+))[^>]*>/gi;

  /**
   * Validates whether an SVG string contains any prohibited or dangerous constructs.
   *
   * @param {string} svgContent - Raw SVG string to test.
   * @param {Object} [options={}] - Validation options.
   * @param {boolean} [options.allowExternal=false] - Allow remote image/use references.
   * @returns {{ safe: boolean, violations: Array<string> }}
   */
  function validateSvgThumbnail(svgContent, options = {}) {
    if (typeof svgContent !== "string" || !svgContent.trim()) {
      return {
        safe: false,
        violations: ["Empty or non-string SVG content."],
      };
    }

    const trimmed = svgContent.trim();
    const violations = [];

    // Basic SVG format check
    if (!/<svg\b[^>]*>/i.test(trimmed)) {
      violations.push("Missing root <svg> element.");
    }

    // Check DOCTYPE and XML entities
    if (DOCTYPE_ENTITY_REGEX.test(trimmed)) {
      violations.push("Contains <!DOCTYPE> or <!ENTITY> declarations (XXE risk).");
    }

    // Check blocked elements
    for (const tag of BLOCKED_ELEMENTS) {
      const tagRegex = new RegExp(`<(?:/)?\\s*${tag}\\b`, "i");
      if (tagRegex.test(trimmed)) {
        violations.push(`Contains disallowed element <${tag}>.`);
      }
    }

    // Check event handlers
    const eventMatch = trimmed.match(/\s+(on[a-z0-9_-]+)\s*=/i);
    if (eventMatch) {
      violations.push(`Contains inline event handler attribute "${eventMatch[1]}".`);
    }

    // Check dangerous protocols (javascript:, vbscript:, data:text/html)
    if (/\b(?:href|xlink:href|src)\s*=\s*["']?\s*(javascript|vbscript|data:(?!image\/))/i.test(trimmed)) {
      violations.push("Contains dangerous protocol (e.g. javascript: or data: URL).");
    }

    // Check external network references
    if (!options.allowExternal) {
      if (/<(use|image|feImage)\b[^>]*?\s+(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/)/i.test(trimmed)) {
        violations.push("Contains external network reference in <use>, <image>, or <feImage>.");
      }
      if (STYLE_IMPORT_REGEX.test(trimmed)) {
        violations.push("Contains @import external stylesheet in <style>.");
      }
      if (DANGEROUS_STYLE_URL_REGEX.test(trimmed)) {
        violations.push("Contains remote or dangerous url() in style declaration.");
      }
    }

    // Check CSS expressions
    if (CSS_EXPRESSION_REGEX.test(trimmed)) {
      violations.push("Contains dangerous dynamic CSS expression/behavior.");
    }

    // Check SMIL animation hijacking
    if (SMIL_DANGEROUS_ATTR_REGEX.test(trimmed)) {
      violations.push("Contains SMIL animation modifying dangerous target attributes.");
    }

    return {
      safe: violations.length === 0,
      violations,
    };
  }

  /**
   * Checks whether an SVG is safe for untrusted rendering.
   *
   * @param {string} svgContent - SVG string to test.
   * @param {Object} [options={}] - Options.
   * @returns {boolean}
   */
  function isSvgSafe(svgContent, options = {}) {
    return validateSvgThumbnail(svgContent, options).safe;
  }

  /**
   * Sanitizes SVG content by stripping scripts, event handlers,
   * foreign objects, XXE directives, and unexpected external references.
   *
   * @param {string} svgContent - Raw SVG string.
   * @param {Object} [options={}] - Options.
   * @param {boolean} [options.allowExternal=false] - Allow external URLs if explicitly enabled.
   * @returns {string} - Clean, sanitized SVG markup.
   */
  function sanitizeSvg(svgContent, options = {}) {
    if (typeof svgContent !== "string" || !svgContent.trim()) {
      return "";
    }

    let clean = svgContent;

    // 1. Strip DOCTYPE, ENTITY, and xml-stylesheet
    clean = clean.replace(DOCTYPE_ENTITY_REGEX, "");

    // 2. Strip blocked container elements and their children (e.g. <script>...</script>, <foreignObject>...</foreignObject>)
    clean = clean.replace(BLOCKED_CONTAINER_REGEX, "");

    // 3. Strip any remaining or self-closing blocked tags
    clean = clean.replace(BLOCKED_ELEMENTS_REGEX, "");

    // 4. Strip all event handlers (onload, onerror, onclick, onbegin, onend, etc.)
    clean = clean.replace(EVENT_HANDLER_REGEX, "");

    // 5. Strip dangerous protocol links (javascript:, vbscript:, etc.)
    clean = clean.replace(DANGEROUS_PROTOCOL_REGEX, "");

    // 6. Neutralize SMIL animations targeting dangerous attributes
    clean = clean.replace(SMIL_DANGEROUS_ATTR_REGEX, "");

    // 7. Neutralize external resource loads unless explicitly permitted
    if (!options.allowExternal) {
      // Remove external <use>, <image>, <feImage> elements entirely
      clean = clean.replace(EXTERNAL_RESOURCE_ATTR_REGEX, "");
      clean = clean.replace(STYLE_IMPORT_REGEX, "");
      clean = clean.replace(DANGEROUS_STYLE_URL_REGEX, "url()");
    }

    // 8. Strip CSS dynamic expressions
    clean = clean.replace(CSS_EXPRESSION_REGEX, "");

    return clean.trim();
  }

  exports.sanitizeSvg = sanitizeSvg;
  exports.isSvgSafe = isSvgSafe;
  exports.validateSvgThumbnail = validateSvgThumbnail;
  exports.BLOCKED_ELEMENTS = BLOCKED_ELEMENTS;
})(
  typeof exports === "undefined"
    ? (window.CradleSanitize = window.CradleSanitize || {})
    : exports
);
