import { Hono } from 'hono';
import { supabaseAdmin } from '../services/supabase.js';
import { FaydaService } from '../services/fyda.js';

const auth = new Hono();

// 1. INITIATE REGISTRATION (Step 1)
// Mobile sends FIN -> We check DB -> We call Fayda -> Fayda sends SMS
auth.post('/initiate-register', async (c) => {
  const { fin } = await c.req.json();

  if (!fin || fin.length !== 12) return c.json({ error: "Invalid FIN" }, 400);

  // A. Check if user already exists in OUR Supabase DB
  const { data: existingUser } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('fin', fin)
    .single();

  if (existingUser) {
    return c.json({ error: "User already registered. Please Login." }, 409);
  }

  // B. Call Fayda to send OTP
  try {
    await FaydaService.requestOtp(fin);
    return c.json({ message: "OTP sent successfully" });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 2. COMPLETE REGISTRATION (Step 2 & 3)
// Mobile sends FIN + OTP + Password -> We verify Fayda -> We create Supabase User
auth.post('/complete-register', async (c) => {
  const { fin, otp, email, password } = await c.req.json();

  try {
    // A. Verify OTP with Fayda API
    const kycData = await FaydaService.verifyOtp(fin, otp);

    // B. Create Auth User in Supabase
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Auto-confirm email
      user_metadata: { full_name: kycData.personalIdentity.fullName }
    });

    if (authError) throw authError;

    // C. Save Profile to Postgres
    const { error: dbError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        fin: fin,
        full_name: kycData.personalIdentity.fullName,
        phone_number: kycData.personalIdentity.phone,
        dob: kycData.personalIdentity.dob,
        gender: kycData.personalIdentity.gender,
        photo_url: kycData.biometrics?.face || null,
        role: 'citizen'
      });

    if (dbError) throw dbError;

    return c.json({ message: "Registration Successful", user: authData.user });

  } catch (err: any) {
    console.error(err);
    return c.json({ error: err.message || "Registration Failed" }, 400);
  }
});

// 3. RESET PASSWORD (FR-01.9)
// Uses Fayda OTP to verify identity, then Force-Updates Supabase Password
auth.post('/reset-password', async (c) => {
  const { fin, otp, newPassword } = await c.req.json();

  try {
    // A. Verify Identity via Fayda
    // (If OTP is correct, we know this is the real owner of the ID)
    await FaydaService.verifyOtp(fin, otp);

    // B. Find the Supabase User ID by FIN
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('fin', fin)
      .single();

    if (!profile) return c.json({ error: "User not found" }, 404);

    // C. Admin Force Update Password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      profile.id,
      { password: newPassword }
    );

    if (updateError) throw updateError;

    return c.json({ message: "Password updated successfully" });

  } catch (err: any) {
    return c.json({ error: err.message || "Reset Failed" }, 400);
  }
});

export default auth;