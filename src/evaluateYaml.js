import { parseDocument, YAMLMap, Scalar } from "yaml";

// Helper to fetch and parse a YAML file
async function fetchAndParseYaml(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);
  const text = await response.text();
  return await evaluateYaml(text, url.substring(0, url.lastIndexOf("/") + 1));
}

// Helper to fetch all YAML files in a directory (assumes a manifest file listing them)
async function fetchDirNamed(baseUrl) {
  const manifestUrl = baseUrl + "manifest.json";
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`Failed to fetch manifest: ${manifestUrl}`);
  const files = await response.json();
  const result = {};
  for (const file of files) {
    const name = file.replace(/\..*$/, "");
    result[name] = await fetchAndParseYaml(baseUrl + file);
  }
  return result;
}

// Custom tag implementations
const IncludeTag = {
  tag: "!include",
  resolve: (doc, cst) => Scalar.resolve(doc, cst),
  options: {},
  async: true,
  construct: async function (data, doc, tag) {
    const url = doc.options.baseUrl + data;
    return await fetchAndParseYaml(url);
  },
};

const IncludeDirNamedTag = {
  tag: "!include_dir_named",
  resolve: (doc, cst) => Scalar.resolve(doc, cst),
  options: {},
  async: true,
  construct: async function (data, doc, tag) {
    const url = doc.options.baseUrl + data + "/";
    return await fetchDirNamed(url);
  },
};

// Main async YAML evaluator with custom tags
export default async function evaluateYaml(yamlString, baseUrl = "/hacsfiles/streamline-card/") {
  const customTags = [IncludeTag, IncludeDirNamedTag];

  // Attach baseUrl to options so custom tags can access it
  const doc = parseDocument(yamlString, { customTags, baseUrl });

  // Recursively resolve async tags
  async function resolveAsync(node) {
    if (node && typeof node === "object" && node.tag && (node.tag === "!include" || node.tag === "!include_dir_named")) {
      return await node.resolve();
    }
    if (node instanceof YAMLMap) {
      const out = {};
      for (const [k, v] of node.items) {
        out[k] = await resolveAsync(v);
      }
      return out;
    }
    if (Array.isArray(node)) {
      return Promise.all(node.map(resolveAsync));
    }
    return node;
  }

  return await resolveAsync(doc.contents);
}
