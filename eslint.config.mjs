import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default [
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    ignores: ["src/demos/nool/peggy/**", "src/math/cobyla.js"],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  // Ban className (i.e. Tailwind) in library code — only demo/docs may use it.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/demo/**",
      "src/demos/**",
      "src/docs/**",
      "src/study/**",
      "src/IndexPage.tsx",
      "src/main.tsx",
      "src/**/*.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='className']",
          message:
            "Don't use className in library code (avoids Tailwind dependency for lib consumers). Use inline styles instead.",
        },
      ],
    },
  },
];
