import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'src/vendor'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      // The two classic hook rules, as they have always run. eslint-plugin-react-hooks 7 also
      // turns on React Compiler checks (refs, set-state-in-effect, purity, ...) in its
      // recommended set; this app doesn't use the compiler, and its latest-ref and animation
      // code is deliberate, so those are left out rather than rewritten.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
    }
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    }
  },
  prettier
);
