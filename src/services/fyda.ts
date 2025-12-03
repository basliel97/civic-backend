import axios from 'axios';
import { config } from '../config/env.js';

export const FaydaService = {
  /**
   * Send FIN to National ID System to trigger OTP
   */
  requestOtp: async (fin: string) => {
    try {
      const { data } = await axios.post(`${config.faydaUrl}/api/auth/otp-request`, { fin });
      return data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || "Fayda API Error");
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