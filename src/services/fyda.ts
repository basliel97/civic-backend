import axios from 'axios';
import { config } from '../config/env.js';

// Create a configured axios instance to reuse headers
const faydaClient = axios.create({
  baseURL: config.faydaUrl,
  headers: {
    'User-Agent': 'Civic-Backend-App/1.0',
    'x-internal-secret': process.env.INTERNAL_SECRET // Add this!
  }
});

export const FaydaService = {
  /**
   * Send FIN to National ID System to trigger OTP
   */
  requestOtp: async (fin: string) => {
    try {
      const url = `/api/auth/otp-request`;
      console.log("Attempting to connect to:", config.faydaUrl + url);
      
      const { data } = await faydaClient.post(url, { fin });
      return data;
    } catch (error: any) {
      if (error.response) {
        // If we get a 429, it means we are hitting the limit too fast
        if (error.response.status === 429) {
           console.error("Rate limit hit. Waiting 2 seconds and retrying...");
           await new Promise(resolve => setTimeout(resolve, 2000));
           const { data } = await faydaClient.post(`/api/auth/otp-request`, { fin });
           return data;
        }
        console.error("Fayda Server Error:", error.response.status, error.response.data);
        throw new Error(`Fayda Server Error: ${error.response.status}`);
      } else if (error.request) {
        console.error("Fayda Network Error:", error.message);
        throw new Error("Fayda API is not responding. Service might be sleeping.");
      } else {
        throw new Error("Fayda API Configuration Error");
      }
    }
  },
kycPreview: async (fin: string, otp: string) => {
    try {
      const { data } = await faydaClient.post(`/api/kyc/preview`, { fin, otp });
      return data; // Returns the preview data WITHOUT deleting the OTP
    } catch (error: any) {
      throw new Error(error.response?.data?.error || "Preview Failed");
    }
  },

  // Call this only when user clicks "Finalize Registration"
  verifyOtp: async (fin: string, otp: string) => {
    try {
      const { data } = await faydaClient.post(`/api/kyc/verify`, { fin, otp });
      return data.kyc_data; // This endpoint STILL deletes the OTP
    } catch (error: any) {
      throw new Error(error.response?.data?.error || "Verification Failed");
    }
  }
};