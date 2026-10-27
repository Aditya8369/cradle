"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const CsvCleaner = require("../projects/file-tools/csv-data-cleaner/csvCleaner.js");
const attendanceDataHandler = require("../projects/productivity/attendance-tracker/data-handler.js");
const jsonLogic = require("../projects/dev-tools/json-converter/logic.js");
const RegexEngine = require("../projects/dev-tools/regex-visualizer/regexEngine.js");

/* ------------------------------------------------------------------ */
/* Fuzz Testing Utilities & Input Generators                          */
/* ------------------------------------------------------------------ */

// Deterministic pseudo-random number generator for reproducible fuzz runs
function createPrng(seed = 123456789) {
  let s = seed >>> 0;
  return function next() {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const prng = createPrng(0xdeadbeef);

function randomInt(min, max) {
  return Math.floor(prng() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

const CHAR_POOLS = {
  ascii: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  delimiters: ",;\t|:\n\r",
  quotes: "\"\"\"'''`",
  brackets: "{}[]()<>",
  control: "\0\x01\x02\x08\x09\x0a\x0b\x0c\x0d\x1b\x7f",
  whitespace: " \t\r\n\v\f\u00A0\u2028\u2029",
  unicode: "ñçøß日本語🚀🔥✨½µ¶§©®™",
  regexMeta: "^$.*+?()[]{}|\\",
};

const ALL_CHARS = Object.values(CHAR_POOLS).join("");

function randomString(length = 20, pool = ALL_CHARS) {
  let str = "";
  for (let i = 0; i < length; i++) {
    str += pool[randomInt(0, pool.length - 1)];
  }
  return str;
}

function mutateString(str) {
  if (!str || str.length === 0) return randomString(10);
  const arr = str.split("");
  const ops = ["insert", "delete", "substitute", "duplicate", "flipQuote"];
  const op = randomChoice(ops);
  const idx = randomInt(0, arr.length - 1);

  if (op === "insert") {
    arr.splice(idx, 0, randomChoice(ALL_CHARS));
  } else if (op === "delete") {
    arr.splice(idx, 1);
  } else if (op === "substitute") {
    arr[idx] = randomChoice(ALL_CHARS);
  } else if (op === "duplicate") {
    arr.splice(idx, 0, arr[idx]);
  } else if (op === "flipQuote") {
    arr[idx] = arr[idx] === '"' ? "" : '"';
  }
  return arr.join("");
}

/* ------------------------------------------------------------------ */
/* 1. CSV Parser Fuzz Testing                                         */
/* ------------------------------------------------------------------ */

test("CSV Fuzz — CsvCleaner.parseCsv exercises randomized and adversarial payloads", () => {
  const seedCases = [
    // Ragged rows & trailing delimiters
    "a,b,c\n1,2\n3,4,5,6\n,",
    // Quotes with commas, newlines, escaped quotes
    '"quoted,name","escaped ""quote""",simple\n"multi\nline",1,2',
    // Unclosed quote at end of stream
    'col1,col2\n"unclosed quote,value',
    // Unclosed quote in header
    '"unclosed_header,col2',
    // Mixed newline formats (\r\n, \r, \n)
    "h1,h2\r1,2\r\n3,4\n5,6\r\r\n\n7,8",
    // Repeated quotes and edge quotes
    '"""""",",",",,,"\n"""",""""',
    // Whitespace around quotes
    ' "leading space" , "trailing space" \n "val" ',
    // Thousands of commas
    ",".repeat(500),
    // Null bytes and control characters
    "h1,h2\0h3\nval1\x01,\x02val2",
    // Deeply nested quotation
    '""a"",b\n"""c""",d',
    // Empty fields and empty lines
    "\n\n\n,,,\n\n,,,\n\n",
  ];

  // Run structured seed cases
  for (const payload of seedCases) {
    try {
      const result = CsvCleaner.parseCsv(payload);
      assert.ok(Array.isArray(result.headers));
      assert.ok(Array.isArray(result.rows));
      assert.ok(Array.isArray(result.warnings));
    } catch (err) {
      // Must throw an Error instance with descriptive message, not a TypeError or unhandled crash
      assert.ok(err instanceof Error);
      assert.ok(typeof err.message === "string" && err.message.length > 0);
    }
  }

  // Run 100 randomized mutated inputs
  for (let i = 0; i < 100; i++) {
    const base = randomChoice(seedCases);
    const fuzzed = mutateString(base);

    try {
      const result = CsvCleaner.parseCsv(fuzzed);
      assert.ok(Array.isArray(result.headers));
      assert.ok(Array.isArray(result.rows));
      assert.ok(result.headers.every(h => typeof h === "string"));
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.ok(err.message.length > 0);
    }
  }
});

test("CSV Fuzz — CsvCleaner.analyzeCsv and cleanDataset handle adversarial datasets", () => {
  const adversarialDatasets = [
    { headers: [], rows: [] },
    { headers: ["a", "b"], rows: [["1"], ["2", "3", "4"]] }, // Ragged columns
    { headers: ["a"], rows: [[null], [undefined], [123], [{}]] }, // Exotic cell types
    { headers: ["", "  ", "\t"], rows: [["", ""], ["  ", "\t"]] }, // Blank headers and cells
    { headers: null, rows: null }, // Null dataset
    {}, // Empty object dataset
  ];

  for (const ds of adversarialDatasets) {
    const cleaned = CsvCleaner.cleanDataset(ds);
    assert.ok(cleaned.dataset && typeof cleaned.dataset === "object");
    assert.ok(Array.isArray(cleaned.dataset.headers));
    assert.ok(Array.isArray(cleaned.dataset.rows));
    assert.ok(typeof cleaned.summary.beforeRows === "number");
    assert.ok(typeof cleaned.summary.afterRows === "number");

    const exported = CsvCleaner.exportCsv(cleaned.dataset);
    assert.ok(typeof exported === "string");
  }
});

test("CSV Fuzz — Attendance tracker parseCSV survives random and adversarial input", () => {
  const fuzzInputs = [
    null,
    undefined,
    12345,
    {},
    [],
    "",
    "   ",
    "\n\n\n",
    "Subject,Total,Attended,Absent,Target\n",
    'Math,20,18,2,85\n"Physics, Lab",30,25,5\nBrokenLine\n,,\n',
    '"""Adversarial",NaN,Infinity,-50,"NotANumber"\n',
    randomString(200),
    randomString(500, CHAR_POOLS.delimiters + CHAR_POOLS.quotes),
  ];

  for (const input of fuzzInputs) {
    const result = attendanceDataHandler.parseCSV(input);
    assert.ok(Array.isArray(result));
    for (const sub of result) {
      assert.ok(typeof sub.name === "string");
      assert.ok(typeof sub.total === "number" && !Number.isNaN(sub.total));
      assert.ok(typeof sub.p === "number" && !Number.isNaN(sub.p));
      assert.ok(typeof sub.a === "number" && !Number.isNaN(sub.a));
    }
  }
});

/* ------------------------------------------------------------------ */
/* 2. JSON Parser & Converter Fuzz Testing                            */
/* ------------------------------------------------------------------ */

test("JSON Fuzz — parseJSON handles malformed, mutated, and adversarial syntax", () => {
  const seedMalformed = [
    "",
    "   ",
    "{",
    "}",
    "[",
    "]",
    "{a: 1}", // unquoted key
    "{'a': 1}", // single-quoted key
    '{"a": 1,}', // trailing comma
    '{"a": [1, 2,]}', // trailing array comma
    '{"a": undefined}', // undefined token
    '{"a": NaN}', // NaN token
    '{"a": Infinity}', // Infinity token
    '{"a": 0123}', // leading zero
    '{"a": .123}', // leading decimal
    '{"a": 123.}', // trailing decimal
    '{"a": "unclosed string}',
    '{"a": "escaped \\" quote}',
    '{"a": "newline\nin\nstring"}',
    '{"a": "tab\tin\tstring"}',
    '{"a": "\\uD800"}', // lone surrogate
    '{"a": "\\x00"}', // invalid escape
    '{"a": "\\c"}', // invalid escape
    '{"__proto__": {"polluted": true}}', // prototype pollution payload
    '{"constructor": {"prototype": {"polluted": true}}}',
    "true false", // multiple root tokens
    "null 123",
    "[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]",
  ];

  for (const payload of seedMalformed) {
    const res = jsonLogic.parseJSON(payload);
    assert.ok(typeof res.valid === "boolean");

    if (!res.valid) {
      assert.ok(res.error && typeof res.error === "object");
      assert.ok(typeof res.error.message === "string" && res.error.message.length > 0);
      assert.ok(typeof res.error.line === "number" && res.error.line >= 1);
      assert.ok(typeof res.error.column === "number" && res.error.column >= 1);
    }
  }

  // Non-string inputs must be safely handled without throwing
  const nonStringInputs = [null, undefined, 42, true, false, {}, [], () => {}];
  for (const input of nonStringInputs) {
    const res = jsonLogic.parseJSON(input);
    assert.equal(res.valid, false);
    assert.ok(res.error.message);
  }

  // 100 random mutations of valid JSON
  const validSeed = '{"name":"Alice","age":30,"items":[1,2,{"active":true}],"note":"hello"}';
  for (let i = 0; i < 100; i++) {
    const mutated = mutateString(validSeed);
    const res = jsonLogic.parseJSON(mutated);
    assert.ok(typeof res.valid === "boolean");
    if (!res.valid) {
      assert.ok(res.error.line >= 1);
      assert.ok(res.error.column >= 1);
    }
  }

  // Ensure prototype pollution does not affect Object.prototype
  const protoTest = '{"__proto__": {"isAdmin": true}}';
  jsonLogic.parseJSON(protoTest);
  assert.equal(Object.prototype.isAdmin, undefined);
});

test("JSON Fuzz — toYaml, toCsv, and toXml survive adversarial, circular, and deeply nested shapes", () => {
  // Deeply nested object
  let deepObj = { level: 0 };
  let current = deepObj;
  for (let i = 1; i <= 80; i++) {
    current.child = { level: i };
    current = current.child;
  }

  // Circular reference structure
  const circularObj = { name: "loop" };
  circularObj.self = circularObj;

  // Object with adversarial keys and values
  const weirdObj = {
    "": "empty key",
    "   ": "spaces key",
    ":": "colon key",
    "-": "hyphen key",
    "[1,2]": "bracket key",
    "key with 'single' and \"double\" quotes": "quotes",
    "key with\nnewlines\rand\ttabs": "control",
    "<xml>&injection;</test>": "xml chars",
    "null": null,
    "undefined": undefined,
    "nan": NaN,
    "inf": Infinity,
    "bool_true": true,
    "bool_false": false,
  };

  const testObjects = [deepObj, circularObj, weirdObj, null, undefined, "plain string", 12345, true, [], {}];

  for (const obj of testObjects) {
    // toYaml must never throw or infinite loop
    const yaml = jsonLogic.toYaml(obj);
    assert.ok(typeof yaml === "string");

    // toCsv must never throw or infinite loop
    const csv = jsonLogic.toCsv(obj);
    assert.ok(typeof csv === "string");

    // toXml must never throw or infinite loop
    const xml = jsonLogic.toXml(obj, "root");
    assert.ok(typeof xml === "string");
  }
});

test("JSON Fuzz — formatJSON and minifyJSON handle corrupt and extreme payloads", () => {
  const extremePayloads = [
    "",
    "   ",
    "{ corrupt json",
    '{"valid": true}',
    null,
    undefined,
    12345,
    randomString(100),
  ];

  for (const p of extremePayloads) {
    const formatted = jsonLogic.formatJSON(p, 2);
    assert.ok(typeof formatted === "string" || formatted === p);

    const minified = jsonLogic.minifyJSON(p);
    assert.ok(typeof minified === "string" || minified === p);
  }
});

/* ------------------------------------------------------------------ */
/* 3. Regex Parser & Engine Fuzz Testing                              */
/* ------------------------------------------------------------------ */

test("Regex Fuzz — compileRegex and sanitizeFlags handle malformed patterns and flags", () => {
  const malformedPatterns = [
    // Unclosed groups & classes
    "(abc",
    "[a-z",
    "([0-9",
    // Dangling and invalid quantifiers
    "*abc",
    "+abc",
    "?abc",
    "a++",
    "a***",
    "a{1,2,3}",
    "a{5,2}", // invalid range min > max
    // Trailing escapes
    "abc\\",
    "\\",
    "\\\\\\",
    // Invalid escape sequences
    "\\c",
    "\\k",
    "\\p{InvalidProperty}",
    // Lookaround syntax errors
    "(?",
    "(?=",
    "(?!",
    "(?<",
    "(?<=abc",
    // ReDoS candidates (must compile without crashing compiler)
    "(a+)+$",
    "((a|a?)+)+",
    "(a|aa)+",
    "^([a-zA-Z0-9]+)*$",
  ];

  const malformedFlags = [
    "",
    "g",
    "gi",
    "gimmsuy",
    "gimmick", // invalid flag letters
    "1234", // numeric flags
    "g!@#$%", // punctuation in flags
    "gggggg", // repeated flags
    null,
    undefined,
    {},
    [],
  ];

  for (const pattern of malformedPatterns) {
    for (const flags of malformedFlags) {
      const res = RegexEngine.compileRegex(pattern, flags);
      assert.ok(res && typeof res === "object");
      assert.ok("regex" in res);
      assert.ok("error" in res);

      // Either valid regex or error message
      if (res.regex) {
        assert.ok(res.regex instanceof RegExp);
        assert.equal(res.error, null);
      } else {
        assert.ok(typeof res.error === "string" && res.error.length > 0);
      }
    }
  }

  // 100 randomized mutated patterns
  for (let i = 0; i < 100; i++) {
    const randPattern = randomString(randomInt(1, 30), CHAR_POOLS.regexMeta + CHAR_POOLS.ascii);
    const randFlags = randomString(randomInt(0, 5), "gimsuyxyz123");
    const res = RegexEngine.compileRegex(randPattern, randFlags);
    assert.ok(res && typeof res === "object");
  }
});

test("Regex Fuzz — parsePatternTokens handles arbitrary, adversarial, and non-string inputs", () => {
  const adversarialPatterns = [
    "",
    "   ",
    null,
    undefined,
    12345,
    {},
    [],
    "\\",
    "\\\\",
    "\\\\\\",
    "^$.*+?()[]{}|\\",
    "\\d\\w\\s\\b\\D\\W\\S\\B",
    "((((((((((",
    "))))))))))",
    "+++++*****?????",
    randomString(100),
  ];

  for (const pat of adversarialPatterns) {
    const tokens = RegexEngine.parsePatternTokens(pat);
    assert.ok(Array.isArray(tokens));
    for (const tok of tokens) {
      assert.ok(typeof tok.token === "string");
      assert.ok(typeof tok.type === "string");
      assert.ok(typeof tok.explanation === "string");
    }
  }

  // Mutated token parsing
  const seed = "^([a-zA-Z0-9._%-]+)@([a-zA-Z0-9.-]+\\.[a-zA-Z]{2,6})$";
  for (let i = 0; i < 50; i++) {
    const mutated = mutateString(seed);
    const tokens = RegexEngine.parsePatternTokens(mutated);
    assert.ok(Array.isArray(tokens));
  }
});

test("Regex Fuzz — executeReplace handles special replacement sequences and non-string types", () => {
  const replacementSequences = [
    "$$",
    "$&",
    "$`",
    "$'",
    "$1",
    "$2",
    "$99",
    "$<name>",
    "\\n\\r\\t",
    "",
    null,
    undefined,
    123,
    {},
  ];

  for (const rep of replacementSequences) {
    const res = RegexEngine.executeReplace(
      "(\\w+)",
      "g",
      "hello world 123",
      rep
    );
    assert.ok(res && typeof res === "object");
    assert.ok(typeof res.output === "string");
  }

  // Non-string inputStr and replacement
  const exoticInputs = [null, undefined, 42, true, false, {}];
  for (const inp of exoticInputs) {
    const res = RegexEngine.executeReplace("\\d+", "g", inp, "X");
    assert.ok(typeof res.output === "string");
  }
});

/* ------------------------------------------------------------------ */
/* 4. Pathological Performance Fuzzing                                */
/* ------------------------------------------------------------------ */

test("Performance Fuzz — Parsers handle large inputs without hanging", () => {
  // CSV with 1,000 rows
  const largeCsvLines = ["col1,col2,col3,col4,col5"];
  for (let i = 0; i < 1000; i++) {
    largeCsvLines.push(`val_${i},"quoted, ${i}",${i * 2},${i * 3},end`);
  }
  const largeCsv = largeCsvLines.join("\n");

  const startCsv = Date.now();
  const parsedCsv = CsvCleaner.parseCsv(largeCsv);
  const elapsedCsv = Date.now() - startCsv;
  assert.equal(parsedCsv.rows.length, 1000);
  assert.ok(elapsedCsv < 3000, `CSV parse took ${elapsedCsv}ms (expected < 3000ms)`);

  // JSON with 1,000 elements
  const largeJsonArray = [];
  for (let i = 0; i < 1000; i++) {
    largeJsonArray.push({ id: i, name: `item_${i}`, active: i % 2 === 0 });
  }
  const largeJson = JSON.stringify(largeJsonArray);

  const startJson = Date.now();
  const parsedJson = jsonLogic.parseJSON(largeJson);
  const elapsedJson = Date.now() - startJson;
  assert.equal(parsedJson.valid, true);
  assert.equal(parsedJson.value.length, 1000);
  assert.ok(elapsedJson < 2000, `JSON parse took ${elapsedJson}ms (expected < 2000ms)`);

  // Regex pattern tokenizing a 1,000 character pattern
  const longPattern = "^" + "\\d+".repeat(200) + "$";
  const startRegex = Date.now();
  const tokens = RegexEngine.parsePatternTokens(longPattern);
  const elapsedRegex = Date.now() - startRegex;
  assert.ok(tokens.length > 200);
  assert.ok(elapsedRegex < 1000, `Regex tokenize took ${elapsedRegex}ms (expected < 1000ms)`);
});
