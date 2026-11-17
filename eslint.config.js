// Minimal lint setup: core recommended rules plus the React hooks rules.
//
// typescript-eslint does not support TypeScript 7 yet (its parser needs the TypeScript 5/6
// JavaScript API), so TS and TSX are parsed with Babel's TypeScript syntax plugin. Type errors,
// unused variables and undefined names are left to `tsc -b`, which already checks them.
// When typescript-eslint supports TypeScript 7, swap the parser for `tseslint.parser`.
import js from '@eslint/js'
import babelParser from '@babel/eslint-parser'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          parserOpts: { plugins: ['typescript', 'jsx'] },
        },
      },
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // tsc reports these with full type information
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Render text as React children; raw HTML is not allowed in this app.',
        },
      ],
    },
  },
  {
    files: ['*.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
]
