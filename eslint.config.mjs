import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({ baseDirectory: path.dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: ["**/.next/**", "**/node_modules/**", "frontend/next-env.d.ts", "scripts/**"] },
  ...compat.config({
    extends: ["next/core-web-vitals", "next/typescript"],
    settings: { next: { rootDir: ["frontend/"] } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "@next/next/no-img-element": "warn",
    },
  }),
];
