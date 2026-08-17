module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    extends: [
        'eslint:recommended',
    ],
    env: {
        node: true,
        es2019: true,
    },
    rules: {
        '@typescript-eslint/no-unused-vars': 'warn',
    },
    ignorePatterns: ['dist/**', 'node_modules/**'],
};
