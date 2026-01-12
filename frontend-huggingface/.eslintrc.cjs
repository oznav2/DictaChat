module.exports = {
	root: true,
	parser: "@typescript-eslint/parser",
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",
		"plugin:svelte/recommended",
		"prettier",
	],
	plugins: ["@typescript-eslint"],
	ignorePatterns: ["*.cjs"],
	overrides: [
		{
			files: ["*.svelte"],
			parser: "svelte-eslint-parser",
			parserOptions: {
				parser: "@typescript-eslint/parser",
			},
		},
		{
			files: [
				"src/lib/server/**/*.{ts,js}",
				"src/routes/**/*.{ts,js}",
				"src/**/*.{test,spec}.ts",
				"src/**/__tests__/**/*.{ts,js}",
			],
			rules: {
				"@typescript-eslint/no-explicit-any": "off",
				"@typescript-eslint/no-non-null-assertion": "off",
				"@typescript-eslint/no-unused-vars": "off",
				"@typescript-eslint/ban-types": "off",
			},
		},
		{
			files: ["src/**/__tests__/**/*.{ts,js}"],
			rules: {
				"@typescript-eslint/no-unused-vars": "off",
				"object-shorthand": "off",
				"@typescript-eslint/no-var-requires": "off",
				"no-useless-escape": "off",
			},
		},
	],
	parserOptions: {
		sourceType: "module",
		ecmaVersion: 2020,
		extraFileExtensions: [".svelte"],
	},
	rules: {
		"no-empty": "off",
		"require-yield": "off",
		"@typescript-eslint/no-explicit-any": "error",
		"@typescript-eslint/no-non-null-assertion": "error",
		"@typescript-eslint/no-unused-vars": [
			// prevent variables with a _ prefix from being marked as unused
			"error",
			{
				argsIgnorePattern: "^_",
			},
		],
		"object-shorthand": ["error", "always"],
	},
	env: {
		browser: true,
		es2017: true,
		node: true,
	},
};
