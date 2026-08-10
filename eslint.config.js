// Custom ESLint config for the Azure Horizon mobile app.
// Base: eslint-config-expo (which bundles the React Compiler rule set in
// eslint-plugin-react-hooks v6+). The compiler-based rules are very
// aggressive and flag the legacy effect-based data loading used across
// this codebase, so we keep them at 'warn' while we migrate screens.
//
// Web version note: these rules are pure static analysis of THIS repo;
// they are not affected by the web app sharing the same Firebase backend.
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      // React Compiler-derived rules: downgraded to warnings while screens
      // are migrated to the React-docs effect/data patterns.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/no-deriving-state-in-effects': 'warn',
      'react-hooks/error-boundaries': 'warn',
    },
  },
]);
