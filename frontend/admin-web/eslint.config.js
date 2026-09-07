import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='className'] Literal[value=/bg-\\[#|text-\\[#|border-\\[#|rounded-\\[|text-\\[\\d/]",
          message: "Arbitrary Tailwind brackets (bg-[#...], text-[#...], rounded-[...], text-[...px]) are forbidden. Use canonical design tokens from @cd-recruit/design-tokens or formalized @theme classes.",
        },
        {
          selector: "JSXAttribute[name.name='className'] TemplateElement[value.raw=/bg-\\[#|text-\\[#|border-\\[#|rounded-\\[|text-\\[\\d/]",
          message: "Arbitrary Tailwind brackets (bg-[#...], text-[#...], rounded-[...], text-[...px]) are forbidden. Use canonical design tokens from @cd-recruit/design-tokens or formalized @theme classes.",
        },
      ],
    },
  },
  eslintPluginPrettier,
);
