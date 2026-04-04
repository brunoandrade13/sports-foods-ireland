/**
 * Jest Configuration for SFI Testing
 */

export default {
    // Test environment
    testEnvironment: 'jsdom',

    // Test match patterns
    testMatch: [
        '**/tests/**/*.test.js',
        '**/__tests__/**/*.js'
    ],

    // Coverage configuration
    collectCoverageFrom: [
        'js/**/*.js',
        '!js/**/*.min.js',
        '!**/node_modules/**',
        '!**/dev-archive/**'
    ],

    // Coverage thresholds (aspirational - can be adjusted)
    coverageThreshold: {
        global: {
            branches: 50,
            functions: 50,
            lines: 50,
            statements: 50
        }
    },

    // Module file extensions
    moduleFileExtensions: ['js', 'json'],

    // Transform files (if needed in future for ES6+ or TypeScript)
    transform: {},

    // Ignore patterns
    testPathIgnorePatterns: [
        '/node_modules/',
        '/dev-archive/'
    ],

    // Verbose output
    verbose: true,

    // Clear mocks between tests
    clearMocks: true,

    // Coverage reporters
    coverageReporters: ['text', 'lcov', 'html'],

    // Setup files (if needed)
    // setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
};
