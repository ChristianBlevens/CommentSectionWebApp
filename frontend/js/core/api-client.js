// API client with interceptors and error handling
class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl || window.location.origin;
    this.interceptors = {
      request: [],
      response: []
    };
  }

  // Main request method
  async request(method, endpoint, data = null, options = {}) {
    let config = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
        ...options.headers
      },
      credentials: 'include',
      ...options
    };

    // Add body for non-GET requests
    if (data && method !== 'GET') {
      config.body = JSON.stringify(data);
    }

    // Run request interceptors
    for (const interceptor of this.interceptors.request) {
      config = await interceptor(config);
    }

    try {
      let response = await fetch(`${this.baseUrl}${endpoint}`, config);
      
      // Run response interceptors
      for (const interceptor of this.interceptors.response) {
        response = await interceptor(response);
      }
      
      // Handle non-ok responses
      if (!response.ok) {
        throw new ApiError(response.status, response.statusText, response);
      }

      // Parse response
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      return response;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(0, error.message, null);
    }
  }

  // Get authorization headers
  getAuthHeaders() {
    // Check for session token in storage
    const token = localStorage.getItem('sessionToken') || sessionStorage.getItem('sessionToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  // Convenience methods
  get(endpoint, options) {
    return this.request('GET', endpoint, null, options);
  }

  post(endpoint, data, options) {
    return this.request('POST', endpoint, data, options);
  }

  put(endpoint, data, options) {
    return this.request('PUT', endpoint, data, options);
  }

  patch(endpoint, data, options) {
    return this.request('PATCH', endpoint, data, options);
  }

  delete(endpoint, options) {
    return this.request('DELETE', endpoint, null, options);
  }

  // Interceptor management
  addRequestInterceptor(interceptor) {
    this.interceptors.request.push(interceptor);
    return () => {
      const index = this.interceptors.request.indexOf(interceptor);
      if (index > -1) {
        this.interceptors.request.splice(index, 1);
      }
    };
  }

  addResponseInterceptor(interceptor) {
    this.interceptors.response.push(interceptor);
    return () => {
      const index = this.interceptors.response.indexOf(interceptor);
      if (index > -1) {
        this.interceptors.response.splice(index, 1);
      }
    };
  }

  // Clear all interceptors
  clearInterceptors() {
    this.interceptors.request = [];
    this.interceptors.response = [];
  }
}

// Custom API error class
class ApiError extends Error {
  constructor(status, message, response) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.response = response;
  }

  // Check if error is due to authentication
  isAuthError() {
    return this.status === 401 || this.status === 403;
  }

  // Check if error is due to network
  isNetworkError() {
    return this.status === 0;
  }

  // Check if error is server error
  isServerError() {
    return this.status >= 500;
  }

  // Check if error is client error
  isClientError() {
    return this.status >= 400 && this.status < 500;
  }
}

// Create global instance
window.api = new ApiClient();

// Add default auth error interceptor
api.addResponseInterceptor(async (response) => {
  if (response.status === 401) {
    // Handle authentication error
    EventBus.emit('auth:expired');
    
    // Clear stored tokens
    localStorage.removeItem('user');
    localStorage.removeItem('sessionToken');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('sessionToken');
  }
  return response;
});

// Export for module usage
window.ApiError = ApiError;