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

// 4. LOGIN (Supports FIN or Phone Number)
// src/routes/auth.ts (In civic-backend)

auth.post('/login', async (c) => {
  const { loginInput, password } = await c.req.json();

  // Basic cleanup (remove spaces)
  const rawInput = (loginInput || "").trim();

  if (!rawInput || !password) {
    return c.json({ error: "Missing login details" }, 400);
  }

  try {
    let profileData = null;

    // 1. DETERMINE TYPE: Is it a FIN? (Strictly 12 digits)
    if (/^\d{12}$/.test(rawInput)) {
      
      // It's a FIN - Exact match only
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('fin', rawInput)
        .maybeSingle();
      
      profileData = data;

    } else {
      // 2. IT IS A PHONE NUMBER (Logic for Both Formats)
      
      // Create an array of possible formats
      let possibleNumbers = [rawInput];

      // Logic: If user types "09...", also add "+2519..." to search list
      if (rawInput.startsWith('09')) {
        possibleNumbers.push('+251' + rawInput.substring(1));
      }
      // Logic: If user types "+2519...", also add "09..." to search list
      else if (rawInput.startsWith('+2519')) {
        possibleNumbers.push('0' + rawInput.substring(4));
      }

      console.log(`Searching for phone in formats: ${possibleNumbers.join(' OR ')}`);

      // Search database for ANY of these numbers
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .in('phone_number', possibleNumbers) // Checks both 09 and +251
        .maybeSingle();

      profileData = data;
    }

    if (!profileData) {
      return c.json({ error: "User not found with this ID or Phone" }, 404);
    }

    // 3. GET EMAIL (Same as before)
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(profileData.id);
    
    if (userError || !userData.user) return c.json({ error: "Account mismatch" }, 500);

    // 4. PERFORM LOGIN
    const { data: sessionData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email: userData.user.email!,
      password: password,
    });

    if (authError) return c.json({ error: "Incorrect Password" }, 401);

    return c.json({ session: sessionData.session, user: sessionData.user });

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

auth.post('/initiate-reset', async (c) => {
  const { fin } = await c.req.json();
  if (!fin) return c.json({ error: "FIN required" }, 400);

  // A. Check if user EXISTS in Supabase
  const { data: user } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('fin', fin)
    .single();

  if (!user) {
    // Security: You can return generic "If user exists, OTP sent" to prevent enumeration,
    // but for this project, let's return a clear error.
    return c.json({ error: "No account found with this ID. Please Register." }, 404);
  }

  // B. Call Fayda to send OTP
  try {
    await FaydaService.requestOtp(fin);
    return c.json({ message: "OTP sent" });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default auth;