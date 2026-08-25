import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";

export default [
  // Flat config only ignores node_modules/.git by default, so build output must
  // be excluded explicitly. Without this, running lint after any build lints the
  // bundled dist/boot.js and reports ~1900 errors. CI only avoided it because
  // lint runs before build.
  {
    ignores: ["dist/**", "db/migrations/**", "coverage/**", "*.tsbuildinfo"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ...pluginReact.configs.flat.recommended,
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    },
  },
  {
    // S-5. `sql`... IN (${ids.join(",")})`` binds the joined string as a SINGLE
    // parameter, so `IN (?)` receives "11,12,13" and MySQL coerces it to 11.
    // Read receipts silently came back for one message per page. Use Drizzle's
    // inArray(), which expands to one placeholder per value.
    files: ["api/**/*.ts", "db/**/*.ts", "contracts/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            'TaggedTemplateExpression[tag.name="sql"] CallExpression[callee.property.name="join"]',
          message:
            "Do not interpolate a joined array into a sql template - it binds as one parameter. Use inArray() from drizzle-orm.",
        },
        {
          // An array literal interpolated directly has the same failure mode
          // and, unlike a bare identifier, is unambiguous at the AST level — so
          // this rule never fires on the legitimate `sql`col LIKE ${pattern}``.
          selector:
            'TaggedTemplateExpression[tag.name="sql"] TemplateLiteral > ArrayExpression',
          message:
            "Do not interpolate an array into a sql template - it binds as one parameter. Use inArray() from drizzle-orm.",
        },
      ],
    },
  },
];
