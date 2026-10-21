import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

const layer = (type) => ({ element: { type } });
const layers = (...types) => ({ element: { types: { anyOf: types } } });

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  // Atomic Design: importação só de cima para baixo (ver prompt-beedock.md, Design System)
  {
    files: ["app/**", "components/**", "features/**"],
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: { alwaysTryTypes: true } },
      "boundaries/elements": [
        { type: "ui", pattern: "components/ui" },
        { type: "atom", pattern: "components/atoms/*" },
        { type: "molecule", pattern: "components/molecules/*" },
        { type: "organism", pattern: "components/organisms/*" },
        { type: "template", pattern: "components/templates/*" },
        { type: "feature", pattern: "features/*" },
        { type: "page", pattern: "app" },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        2,
        {
          default: "allow",
          policies: [
            { from: layer("atom"), disallow: { to: layers("molecule", "organism", "template", "feature", "page") } },
            { from: layer("molecule"), disallow: { to: layers("ui", "organism", "template", "feature", "page") } },
            { from: layer("organism"), disallow: { to: layers("ui", "template", "feature", "page") } },
            { from: layer("template"), disallow: { to: layers("ui", "feature", "page") } },
            { from: layer("page"), disallow: { to: layer("ui") } },
            {
              from: layer("feature"),
              disallow: { to: layers("ui", "atom", "molecule", "organism", "template", "page") },
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "generated/**", "previews/**"]),
]);

export default eslintConfig;
