/**
 * Markdown Resume Generator Engine (resumeEngine.js)
 * Parses Markdown resume syntax into semantic HTML, computes ATS completeness scores, and exports standalone HTML.
 * UMD compliant for Node.js test suites and browser execution.
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ResumeEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {

  class ResumeValidationError extends Error {
    constructor(message, details = {}) {
      super(message);
      this.name = "ResumeValidationError";
      this.code = details.code || "CIRCULAR_REFERENCE";
      this.path = details.path || null;
      this.details = details;
      this.success = false;
      this.isValid = false;
    }
  }

  /**
   * Detects circular object references across nested structures.
   * Tracks traversal stack to distinguish genuine cycles from shared DAG references.
   *
   * @param {*} value - The value/object to inspect
   * @param {Object} [options] - Options (maxDepth)
   * @returns {{ hasCircular: boolean, path: string|null, error: string|null }}
   */
  function detectCircularReferences(value, options = {}) {
    const maxDepth = typeof options.maxDepth === "number" ? options.maxDepth : 100;

    function traverse(val, currentPath, depth, stack) {
      if (depth > maxDepth) {
        return {
          hasCircular: true,
          path: currentPath,
          error: `Maximum nesting depth of ${maxDepth} exceeded at ${currentPath}.`,
        };
      }

      if (val === null || typeof val !== "object") {
        return null;
      }

      if (stack.has(val)) {
        return {
          hasCircular: true,
          path: currentPath,
          error: `Circular reference detected at path "${currentPath}".`,
        };
      }

      stack.add(val);

      try {
        if (Array.isArray(val)) {
          for (let i = 0; i < val.length; i++) {
            const itemPath = `${currentPath}[${i}]`;
            const cycle = traverse(val[i], itemPath, depth + 1, stack);
            if (cycle) return cycle;
          }
        } else {
          const keys = Object.keys(val);
          for (const key of keys) {
            const propPath = currentPath === "root" ? key : `${currentPath}.${key}`;
            let propVal;
            try {
              propVal = val[key];
            } catch (_) {
              continue;
            }
            const cycle = traverse(propVal, propPath, depth + 1, stack);
            if (cycle) return cycle;
          }
        }
      } finally {
        stack.delete(val);
      }

      return null;
    }

    const cycle = traverse(value, "root", 0, new Set());
    if (cycle) {
      return {
        hasCircular: true,
        path: cycle.path,
        error: cycle.error,
      };
    }

    return {
      hasCircular: false,
      path: null,
      error: null,
    };
  }

  /**
   * Helper returning true if input structure contains any circular reference.
   */
  function hasCircularReference(value, options = {}) {
    return detectCircularReferences(value, options).hasCircular;
  }

  /**
   * Validates resume object payload before serialization.
   * Emits controlled validation error descriptors if malformed or circular.
   */
  function validateResumeData(data, options = {}) {
    const throwOnError = options.throwOnError === true;

    if (data === undefined || data === null) {
      const errorMsg = "Invalid resume data: payload cannot be null or undefined.";
      const result = {
        isValid: false,
        success: false,
        hasCircular: false,
        error: errorMsg,
        errors: [errorMsg],
        code: "INVALID_INPUT",
        path: null,
      };
      if (throwOnError) {
        const err = new ResumeValidationError(errorMsg, { code: "INVALID_INPUT" });
        Object.assign(err, result);
        throw err;
      }
      return result;
    }

    const cycleInfo = detectCircularReferences(data, options);
    if (cycleInfo.hasCircular) {
      const errorMsg = `Validation error: Circular object reference detected at ${cycleInfo.path}.`;
      const result = {
        isValid: false,
        success: false,
        hasCircular: true,
        error: errorMsg,
        errors: [errorMsg],
        path: cycleInfo.path,
        code: "CIRCULAR_REFERENCE",
      };
      if (throwOnError) {
        const err = new ResumeValidationError(errorMsg, {
          code: "CIRCULAR_REFERENCE",
          path: cycleInfo.path,
        });
        Object.assign(err, result);
        throw err;
      }
      return result;
    }

    return {
      isValid: true,
      success: true,
      hasCircular: false,
      error: null,
      errors: [],
    };
  }

  /**
   * Serializes resume data to a JSON string.
   * Intercepts circular structures before serialization to produce a controlled validation error
   * instead of allowing JSON.stringify to throw an uncaught exception.
   */
  function serializeResume(data, options = {}) {
    const throwOnError = options.throwOnError === true;
    const indent = typeof options.indent === "number" ? options.indent : 2;

    const validation = validateResumeData(data, { ...options, throwOnError: false });

    if (!validation.isValid) {
      if (throwOnError) {
        const err = new ResumeValidationError(validation.error, {
          code: validation.code,
          path: validation.path,
        });
        Object.assign(err, validation);
        throw err;
      }
      return {
        success: false,
        isValid: false,
        error: validation.error,
        errors: validation.errors,
        code: validation.code,
        path: validation.path,
        data: null,
      };
    }

    try {
      const json = JSON.stringify(data, options.replacer || null, indent);
      if (options.returnResult) {
        return {
          success: true,
          isValid: true,
          error: null,
          errors: [],
          data: json,
        };
      }
      return json;
    } catch (err) {
      const msg = `Serialization error: ${err.message}`;
      if (throwOnError) {
        const serializeErr = new ResumeValidationError(msg, {
          code: "SERIALIZATION_FAILED",
          originalError: err,
        });
        throw serializeErr;
      }
      return {
        success: false,
        isValid: false,
        error: msg,
        errors: [msg],
        data: null,
      };
    }
  }

  /**
   * Parse inline Markdown styles (links, bold, italic).
   */
  function parseInlineMarkdown(text) {
    return text
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
      )
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }

  /**
   * Parse Markdown resume text into structured semantic HTML string.
   */
  function parseMarkdownToHTML(markdown) {
    if (!markdown)
      return '<div class="resume-empty">No markdown content entered</div>';

    if (typeof markdown === "object" && markdown !== null) {
      const cycle = detectCircularReferences(markdown);
      if (cycle.hasCircular) {
        return '<div class="resume-error" role="alert">Validation error: Circular reference detected in resume input.</div>';
      }
      if (typeof markdown.markdown === "string") {
        markdown = markdown.markdown;
      } else if (typeof markdown.content === "string") {
        markdown = markdown.content;
      } else if (typeof markdown.text === "string") {
        markdown = markdown.text;
      } else {
        markdown = String(markdown);
      }
    } else if (typeof markdown !== "string") {
      markdown = String(markdown);
    }

    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let listOpen = false;

    lines.forEach(line => {
      const trimmed = line.trim();

      if (trimmed.startsWith("- ")) {
        if (!listOpen) {
          html.push("<ul>");
          listOpen = true;
        }
        const itemContent = parseInlineMarkdown(trimmed.slice(2));
        html.push(`<li>${itemContent}</li>`);
        return;
      }

      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }

      if (!trimmed) {
        return;
      }

      if (trimmed.startsWith("# ")) {
        html.push(
          `<h1 class="resume-title">${parseInlineMarkdown(trimmed.slice(2))}</h1>`
        );
      } else if (trimmed.startsWith("## ")) {
        html.push(
          `<h2 class="section-title">${parseInlineMarkdown(trimmed.slice(3))}</h2>`
        );
      } else if (trimmed.startsWith("### ")) {
        html.push(
          `<h3 class="entry-title">${parseInlineMarkdown(trimmed.slice(4))}</h3>`
        );
      } else {
        html.push(`<p>${parseInlineMarkdown(trimmed)}</p>`);
      }
    });

    if (listOpen) {
      html.push("</ul>");
    }

    return html.join("\n");
  }

  /**
   * Calculate text statistics.
   */
  function calculateWordCount(markdown) {
    if (!markdown) {
      return { words: 0, characters: 0, readTimeMinutes: 0 };
    }

    if (typeof markdown === "object" && markdown !== null) {
      const cycle = detectCircularReferences(markdown);
      if (cycle.hasCircular) {
        return { words: 0, characters: 0, readTimeMinutes: 0, error: cycle.error };
      }
      markdown =
        typeof markdown.markdown === "string"
          ? markdown.markdown
          : typeof markdown.content === "string"
            ? markdown.content
            : "";
    } else if (typeof markdown !== "string") {
      markdown = String(markdown);
    }

    if (!markdown.trim()) {
      return { words: 0, characters: 0, readTimeMinutes: 0 };
    }

    const words = markdown.trim().split(/\s+/).length;
    const characters = markdown.length;
    const readTimeMinutes = Math.ceil(words / 200);

    return { words, characters, readTimeMinutes };
  }

  /**
   * Evaluate ATS resume completeness score (0-100%).
   */
  function calculateATSScore(markdown) {
    if (!markdown) return 0;

    if (typeof markdown === "object" && markdown !== null) {
      const cycle = detectCircularReferences(markdown);
      if (cycle.hasCircular) {
        return { score: 0, breakdown: {}, error: cycle.error };
      }
      markdown =
        typeof markdown.markdown === "string"
          ? markdown.markdown
          : typeof markdown.content === "string"
            ? markdown.content
            : "";
    } else if (typeof markdown !== "string") {
      markdown = String(markdown);
    }

    const lower = markdown.toLowerCase();

    let score = 0;
    const checks = {
      name: /^#\s+[^\n]+/m.test(markdown) ? 15 : 0,
      contact: /@|phone|email|\+?\d{10,}/i.test(markdown) ? 15 : 0,
      summary: /##\s*(summary|profile|about)/i.test(markdown) ? 15 : 0,
      experience: /##\s*(experience|work|employment)/i.test(markdown) ? 20 : 0,
      skills: /##\s*(skills|competencies)/i.test(markdown) ? 15 : 0,
      education: /##\s*(education|academic)/i.test(markdown) ? 10 : 0,
      projects: /##\s*(projects|portfolio)/i.test(markdown) ? 10 : 0,
    };

    score = Object.values(checks).reduce((a, b) => a + b, 0);
    return { score, breakdown: checks };
  }

  /**
   * Export complete standalone HTML document for printing/downloading.
   */
  function generateStandaloneHTML(
    markdown,
    template = "classic",
    theme = "slate"
  ) {
    const parsedBody = parseMarkdownToHTML(markdown);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Resume Export</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #1e293b; padding: 2rem; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 2rem; color: #0f172a; border-bottom: 2px solid #cbd5e1; padding-bottom: 0.5rem; }
    h2 { font-size: 1.25rem; color: #334155; margin-top: 1.5rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0; }
    h3 { font-size: 1rem; color: #475569; margin-top: 1rem; }
    ul { padding-left: 1.25rem; }
    li { margin-bottom: 0.25rem; }
    a { color: #2563eb; text-decoration: none; }
  </style>
</head>
<body class="template-${template} theme-${theme}">
  <main class="resume-content">
    ${parsedBody}
  </main>
</body>
</html>`;
  }

  return {
    ResumeValidationError,
    detectCircularReferences,
    hasCircularReference,
    validateResumeData,
    validateResume: validateResumeData,
    validate: validateResumeData,
    serializeResume,
    serializeResumeData: serializeResume,
    serializeToJSON: serializeResume,
    serialize: serializeResume,
    parseInlineMarkdown,
    parseMarkdownToHTML,
    calculateWordCount,
    calculateATSScore,
    generateStandaloneHTML,
  };
});
