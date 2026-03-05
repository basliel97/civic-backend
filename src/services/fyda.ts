import axios from 'axios';
import { config } from '../config/env.js';

export const FaydaService = {
  /**
   * Send FIN to National ID System to trigger OTP
   */
 requestOtp: async (fin: string) => {
    try {
      const url = `${config.faydaUrl}/api/auth/otp-request`;
      console.log("Attempting to connect to:", url);
      const { data } = await axios.post(url, { fin });
      return data;
    } catch (error: any) {
      if (error.response) {
        // The server responded with a status code outside the 2xx range
        console.error("Fayda Server Error:", error.response.status, error.response.data);
        throw new Error(`Fayda Server Error: ${error.response.status}`);
      } else if (error.request) {
        // The request was made but no response was received
        console.error("Fayda Network Error (No response):", error.request);
        throw new Error("Fayda API is not responding. Check if it's asleep.");
      } else {
        console.error("Fayda Axios Config Error:", error.message);
        throw new Error("Fayda API Configuration Error");
      }
    }
  },
  /**
   * Verify OTP with National ID System and get KYC Data
   */
  verifyOtp: async (fin: string, otp: string) => {
    try {
      const { data } = await axios.post(`${config.faydaUrl}/api/kyc/verify`, { fin, otp });
      return data.kyc_data; // Return just the user info
    } catch (error: any) {
      throw new Error(error.response?.data?.error || "Fayda Validation Failed");
    }
  }
};