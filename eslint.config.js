// eslint.config.js
const tseslint = require('typescript-eslint');
const eslint = require('@eslint/js');

module.exports = tseslint.config(
  {
    // Global ignores
    ignores: [
      'dist/',
      'node_modules/',
      '.git/',
      'coverage/',
      '*.min.js',
      'bun.lock'
    ]
  },

  // Base recommended configuration
  eslint.configs.recommended,

  // TypeScript configurations
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,

  {
    // Global files configuration
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 2022,
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-as-const': 'error',

      // Stylistic rules
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports'
        }
      ],
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/prefer-for-of': 'error',

      // General ESLint rules
      'no-console': 'warn',
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error'
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json'
        }
      }
    }
  },

  {
    // Test files configuration
    files: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off'
    }
  },

  {
    // Script files configuration
    files: ['scripts/**/*.ts', 'tools/**/*.ts'],
    rules: {
      'no-console': 'off'
    }
  }
);
