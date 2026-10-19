const fs = require("fs");
const path = require("path");

const PROJECTS_DIR = path.resolve(__dirname, "..", "projects");
const DEFAULT_SIMILARITY_THRESHOLD = 0.6;

function getJsFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of list) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      results.push(fullPath);
    }
  }
  return results;
}

function normalizeCode(code) {
  // Strip comments
  const noComments = code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "");

  // Normalize lines
  const lines = noComments
    .split("\n")
    .map(line => line.trim())
    .filter(
      line => line.length > 0 && line !== "{" && line !== "}" && line !== "};"
    );

  return lines;
}

function tokenize(lines) {
  const tokens = [];
  lines.forEach(line => {
    // Break line into identifier/keyword tokens
    const words = line.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g);
    if (words) {
      tokens.push(...words);
    }
  });
  return tokens;
}

function calculateJaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersectionSize = 0;
  for (const elem of setA) {
    if (setB.has(elem)) {
      intersectionSize++;
    }
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize > 0 ? intersectionSize / unionSize : 0;
}

function analyzeDuplicateModules(threshold = DEFAULT_SIMILARITY_THRESHOLD) {
  const files = getJsFiles(PROJECTS_DIR);
  const fileData = [];

  for (const filePath of files) {
    const rawCode = fs.readFileSync(filePath, "utf-8");
    const normalizedLines = normalizeCode(rawCode);
    if (normalizedLines.length < 5) continue;

    const lineSet = new Set(normalizedLines);
    const tokenSet = new Set(tokenize(normalizedLines));
    const relPath = path.relative(path.resolve(__dirname, ".."), filePath);

    fileData.push({
      filePath,
      relPath,
      lineCount: normalizedLines.length,
      lineSet,
      tokenSet,
    });
  }

  const duplicates = [];

  for (let i = 0; i < fileData.length; i++) {
    for (let j = i + 1; j < fileData.length; j++) {
      const f1 = fileData[i];
      const f2 = fileData[j];

      const lineSim = calculateJaccardSimilarity(f1.lineSet, f2.lineSet);
      const tokenSim = calculateJaccardSimilarity(f1.tokenSet, f2.tokenSet);

      // Combined weighted similarity metric
      const score = lineSim * 0.7 + tokenSim * 0.3;

      if (score >= threshold) {
        duplicates.push({
          file1: f1.relPath,
          file2: f2.relPath,
          lines1: f1.lineCount,
          lines2: f2.lineCount,
          similarity: (score * 100).toFixed(1),
          lineSimilarity: (lineSim * 100).toFixed(1),
          tokenSimilarity: (tokenSim * 100).toFixed(1),
        });
      }
    }
  }

  duplicates.sort(
    (a, b) => parseFloat(b.similarity) - parseFloat(a.similarity)
  );
  return duplicates;
}

function main() {
  const args = process.argv.slice(2);
  let threshold = DEFAULT_SIMILARITY_THRESHOLD;
  let failOnDup = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--threshold" && args[i + 1]) {
      threshold = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === "--fail-on-dup") {
      failOnDup = true;
    }
  }

  console.log(
    `Scanning JS modules across projects for code duplication (Threshold: ${(threshold * 100).toFixed(0)}%)...`
  );
  const duplicates = analyzeDuplicateModules(threshold);

  if (duplicates.length > 0) {
    console.log(
      `\n🔍 Found ${duplicates.length} duplicate or near-identical JS module pair(s):\n`
    );
    duplicates.forEach(dup => {
      console.log(
        `  - [${dup.similarity}% Overall Similarity | Lines: ${dup.lineSimilarity}% | Tokens: ${dup.tokenSimilarity}%]`
      );
      console.log(`    File A: ${dup.file1} (${dup.lines1} lines)`);
      console.log(`    File B: ${dup.file2} (${dup.lines2} lines)\n`);
    });
    console.log(
      "💡 Recommendation: Extract shared logic into reusable utility modules under scripts/ or a common directory."
    );

    if (failOnDup) {
      process.exit(1);
    }
  } else {
    console.log("\n✅ No duplicate JS modules found across project minis!");
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  getJsFiles,
  normalizeCode,
  tokenize,
  calculateJaccardSimilarity,
  analyzeDuplicateModules,
};
