import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: [".next/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      // An expression-bodied effect returns whatever the call returns (scrollIntoView and play()
      // return Promises), and React then crashes calling it as the cleanup on unmount.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name=/^use(Layout|Insertion)?Effect$/] > ArrowFunctionExpression.arguments:first-child[body.type!='BlockStatement'][body.type!='ArrowFunctionExpression']",
          message: "Use a block body: an effect must return nothing or a cleanup function.",
        },
      ],
    },
  },
];

export default config;
