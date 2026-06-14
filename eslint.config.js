"use strict";

const js = require("@eslint/js");

/**
 * ESLint flat config for node-red-contrib-i3x.
 * Lints the runtime library, the Node-RED node modules, and the test suite.
 */
module.exports = [
    {
        ignores: ["node_modules/**", "coverage/**", "**/*.tgz"],
    },
    js.configs.recommended,
    {
        // Library and Node-RED node runtime code (CommonJS, Node.js globals)
        files: ["lib/**/*.js", "nodes/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                require: "readonly",
                module: "writable",
                process: "readonly",
                Buffer: "readonly",
                console: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                __dirname: "readonly",
                URL: "readonly",
                AbortController: "readonly",
            },
        },
        rules: {
            "no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
            ],
            "no-console": "off",
            eqeqeq: ["error", "smart"],
            "prefer-const": "error",
        },
    },
    {
        // Test suite (Mocha globals)
        files: ["test/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                require: "readonly",
                module: "writable",
                process: "readonly",
                Buffer: "readonly",
                console: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                __dirname: "readonly",
                describe: "readonly",
                it: "readonly",
                before: "readonly",
                after: "readonly",
                beforeEach: "readonly",
                afterEach: "readonly",
            },
        },
        rules: {
            "no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
            ],
        },
    },
];
