import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [{
    files: ["**/*.ts"],
}, {
    plugins: {
        "@typescript-eslint": typescriptEslint,
    },

    languageOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: "module",
    },

    rules: {
        "@typescript-eslint/naming-convention": ["warn", {
            selector: "import",
            format: ["camelCase", "PascalCase"],
        }],

        // Core ESLint rules (not TypeScript-specific)
        curly: "warn",
        eqeqeq: "warn",
        "no-throw-literal": "warn",
        semi: "warn",
        "prefer-const": "error",           
        "no-unused-vars": "error",         
        
        // TypeScript-specific rules
        "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
        "@typescript-eslint/no-explicit-any": "error",              
        "@typescript-eslint/explicit-function-return-type": "warn",                                
        "@typescript-eslint/no-non-null-assertion": "warn",      
        
        // Code quality rules
        "object-shorthand": "error"
    },
}];