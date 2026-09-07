module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'no-restricted-syntax': [
      'error',
      {
        selector: "JSXAttribute[name.name='className'] Literal[value=/bg-\\[#|text-\\[#|border-\\[#|rounded-\\[|text-\\[\\d/]",
        message: "Arbitrary Tailwind brackets (bg-[#...], text-[#...], rounded-[...], text-[...px]) are forbidden. Use canonical design tokens from @cd-recruit/design-tokens or formalized @theme classes."
      },
      {
        selector: "JSXAttribute[name.name='className'] TemplateElement[value.raw=/bg-\\[#|text-\\[#|border-\\[#|rounded-\\[|text-\\[\\d/]",
        message: "Arbitrary Tailwind brackets (bg-[#...], text-[#...], rounded-[...], text-[...px]) are forbidden. Use canonical design tokens from @cd-recruit/design-tokens or formalized @theme classes."
      }
    ],
  },
}
