/**
 * Safe error handling utilities
 * Prevents sensitive information leakage in production
 */
/**
 * Get a safe error message for API responses
 * In development: returns the actual error message
 * In production: returns a generic message for unknown errors
 */
export function getSafeErrorMessage(error) {
    // In development, show actual errors for debugging
    if (process.env.NODE_ENV !== 'production') {
        if (error instanceof Error) {
            return error.message;
        }
        if (typeof error === 'string') {
            return error;
        }
        return 'Unknown error occurred';
    }
    // In production, only return known safe error messages
    if (error instanceof Error) {
        // List of error messages that are safe to expose
        const safeMessages = [
            'Invalid credentials',
            'Session expired',
            'Unauthorized',
            'Forbidden',
            'Not found',
            'Validation failed',
            'Rate limit exceeded',
            'Account is not active',
            'Account has been deleted',
            'User not found',
            'Application not found',
            'Post not found',
            'Forum not found',
            'Poll not found',
            'Record not found',
            'Content contains inappropriate language',
            'Post is locked',
            'You can only edit your own posts',
        ];
        // Check if the error message starts with any safe message
        for (const safeMsg of safeMessages) {
            if (error.message.toLowerCase().includes(safeMsg.toLowerCase())) {
                return error.message;
            }
        }
        // Log the actual error for debugging
        console.error('[Production Error]:', error);
        return 'An unexpected error occurred. Please try again.';
    }
    return 'An unexpected error occurred. Please try again.';
}
/**
 * Format error response for API
 */
export function formatErrorResponse(error, statusCode = 500) {
    return {
        success: false,
        error: getSafeErrorMessage(error)
    };
}
