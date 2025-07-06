import { parseDocument, YAMLMap } from "yaml";

// Helper to fetch and parse a YAML file
async function fetchAndParseYaml(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);
  const text = await response.text();
  return await evaluateYaml(text, url.substring(0, url.lastIndexOf("/") + 1));
}

// Helper to fetch all YAML files in a directory (assumes a manifest file listing them)
async function fetchDirNamed(baseUrl) {
  // For browser, we need a manifest file listing YAML files in the directory
  // e.g., baseUrl + "manifest.json" with ["file1.yaml", "file2.yaml"]
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

// Main async YAML evaluator with custom tags
export default async function evaluateYaml(yamlString, baseUrl = "/hacsfiles/streamline-card/") {
  const customTags = [
    {
      tag: "!include",
      resolve: (str) => str,
      async: true,
      construct: async (data) => {
        // Support relative includes
        const url = baseUrl + data;
        return await fetchAndParseYaml(url);
      },
    },
    {
      tag: "!include_dir_named",
      resolve: (str) => str,
      async: true,
      construct: async (data) => {
        // Support relative directory includes
        const url = baseUrl + data + "/";
        return await fetchDirNamed(url);
      },
    },
  ];

  // Parse the document with custom tags
  const doc = parseDocument(yamlString, { customTags });

  // Recursively resolve async tags
  async function resolveAsync(node) {
    if (node && typeof node === "object" && node.tag && node.tag.startsWith("!include")) {
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

  return await resolveAsync(doc.toJS({ mapAsMap: false }));
}
