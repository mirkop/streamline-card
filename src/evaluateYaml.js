import { Scalar, YAMLMap, YAMLSeq, isScalar, parseDocument } from "yaml";

// Helper to fetch and parse a YAML file
const fetchAndParseYaml = async function fetchAndParseYaml(url) {
  const response = await fetch(url);
  // Only throw if the response is not ok and not 0-length (to allow empty files)
  if (!response.ok && response.status !== 0) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  // If the file is empty, return an empty object
  if (!text.trim()) { return {} };
  // eslint-disable-next-line no-use-before-define
  return await evaluateYaml(text, url.substring(0, url.lastIndexOf("/") + 1));
};

// Custom tag implementation for !include only
const IncludeTag = {
  async: true,
  construct: async function construct(data, doc) {
    const url = doc.options.baseUrl + data;
    return await fetchAndParseYaml(url);
  },
  options: {},
  resolve: (doc, cst) => Scalar.resolve(doc, cst),
  tag: "!include",
};

// Main async YAML evaluator with custom tags
export default async function evaluateYaml(yamlString, baseUrl = "/hacsfiles/streamline-card/") {
  const customTags = [IncludeTag];
  const doc = parseDocument(yamlString, { baseUrl, customTags });

  const resolveAsync = async function resolveAsync(node, docInstance = doc) {
    // Handle custom tag !include only
    if (node && typeof node === "object" && node.tag && node.tag === "!include") {
      const tagHandler = customTags.find(tagObj => tagObj.tag === node.tag);
      if (tagHandler && typeof tagHandler.construct === "function") {
        return await tagHandler.construct(node.value, docInstance);
      }
    }
    if (node instanceof YAMLMap) {
      const out = {};
      // Node.items is an array of Pair objects, each with .key and .value
      const items = await Promise.all(node.items.map(async pair => [
        isScalar(pair.key) ? pair.key.value : pair.key,
        await resolveAsync(pair.value, docInstance)
      ]));
      for (const [key, resolvedValue] of items) {
        out[key] = resolvedValue;
      }
      return out;
    }
    if (node instanceof YAMLSeq) {
      return Promise.all(node.items.map(item => resolveAsync(item, docInstance)));
    }
    if (isScalar(node)) {
      return node.value;
    }
    // For plain JS objects/arrays (shouldn't happen, but for safety)
    if (Array.isArray(node)) {
      return Promise.all(node.map(item => resolveAsync(item, docInstance)));
    }
    if (node && typeof node === "object") {
      const out = {};
      const keys = Object.keys(node);
      const values = await Promise.all(keys.map(key => resolveAsync(node[key], docInstance)));
      keys.forEach((key, idx) => {
        out[key] = values[idx];
      });
      return out;
    }
    return node;
  };

  return await resolveAsync(doc.contents, doc);
}
