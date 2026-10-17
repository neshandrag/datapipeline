import axios from "axios";

const API = axios.create({
  // Use 127.0.0.1 (not localhost) — browsers often resolve localhost to ::1 (IPv6)
  // while uvicorn typically binds IPv4 only.
  baseURL: "http://127.0.0.1:8000",
  timeout: 120000, // 2 minutes — repair can take time
  headers: {
    "Content-Type": "application/json",
  },
});

// Response interceptor — better error messages
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      // Network error — backend not running
      error.message =
        "Cannot connect to backend. Make sure the backend server is running on http://127.0.0.1:8000";
    }
    return Promise.reject(error);
  }
);

export default API;
