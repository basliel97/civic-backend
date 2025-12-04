import { Hono } from "hono";
import { supabaseAdmin } from "../services/supabase.js";
import { FaydaService } from "../services/fyda.js";

const auth = new Hono();

// 1. INITIATE REGISTRATION (Step 1)
// Mobile sends FIN -> We check DB -> We call Fayda -> Fayda sends SMS
auth.post("/initiate-register", async (c) => {
  const { fin } = await c.req.json();

  if (!fin || fin.length !== 12) return c.json({ error: "Invalid FIN" }, 400);

  // A. Check if user already exists in OUR Supabase DB
  const { data: existingUser } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("fin", fin)
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



auth.post('/login', async (c) => {
  const { loginInput, password } = await c.req.json();
  const rawInput = (loginInput || "").trim();

  if (!rawInput || !password) return c.json({ error: "Missing credentials" }, 400);

  try {
    // A. FIND USER (By FIN or Phone)
    let profileData = null;
    
    // Check if input looks like a FIN
    if (/^\d{12}$/.test(rawInput)) {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id, failed_login_attempts, locked_until') // Get security fields
        .eq('fin', rawInput)
        .maybeSingle();
      profileData = data;
    } else {
      // Check phone numbers
      let possibleNumbers = [rawInput];
      if (rawInput.startsWith('09')) possibleNumbers.push('+251' + rawInput.substring(1));
      else if (rawInput.startsWith('+2519')) possibleNumbers.push('0' + rawInput.substring(4));

      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id, failed_login_attempts, locked_until') // Get security fields
        .in('phone_number', possibleNumbers)
        .maybeSingle();
      profileData = data;
    }

    if (!profileData) {
      // Security: Don't reveal if user exists or not, but strictly:
      return c.json({ error: "Invalid Login Credentials" }, 401);
    }

    // --- FR-01.10 CHECK LOCKOUT ---
    if (profileData.locked_until && new Date(profileData.locked_until) > new Date()) {
      const waitTime = Math.ceil((new Date(profileData.locked_until).getTime() - new Date().getTime()) / 60000);
      return c.json({ error: `Account locked. Try again in ${waitTime} minutes.` }, 403);
    }

    // B. GET EMAIL for Auth
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(profileData.id);
    if (userError || !userData.user) return c.json({ error: "System Error" }, 500);

    // C. ATTEMPT LOGIN
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: userData.user.email!,
      password: password,
    });

    if (error) {
      // --- LOGIN FAILED: INCREMENT COUNTER ---
      const newCount = (profileData.failed_login_attempts || 0) + 1;
      let updates: any = { failed_login_attempts: newCount };

      // Check if limit reached (5 attempts)
      if (newCount >= 5) {
        // Lock for 15 minutes
        const lockTime = new Date();
        lockTime.setMinutes(lockTime.getMinutes() + 15);
        updates.locked_until = lockTime;
      }

      await supabaseAdmin.from('profiles').update(updates).eq('id', profileData.id);

      if (newCount >= 5) {
        return c.json({ error: "Too many failed attempts. Account locked for 15 minutes." }, 403);
      } else {
        return c.json({ error: `Incorrect Password. (${5 - newCount} attempts remaining)` }, 401);
      }
    }

    // --- LOGIN SUCCESS: RESET COUNTERS ---
    await supabaseAdmin
      .from('profiles')
      .update({ failed_login_attempts: 0, locked_until: null })
      .eq('id', profileData.id);

    return c.json({ session: data.session, user: data.user });

  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 2. COMPLETE REGISTRATION (Step 2 & 3)
// Mobile sends FIN + OTP + Password -> We verify Fayda -> We create Supabase User
auth.post("/complete-register", async (c) => {
  const { fin, otp, email, password } = await c.req.json();

  try {
    // A. Verify OTP with Fayda API
    const kycData = await FaydaService.verifyOtp(fin, otp);

    // B. Create Auth User in Supabase
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true, // Auto-confirm email
        user_metadata: { full_name: kycData.personalIdentity.fullName },
      });

    if (authError) throw authError;

    // C. Save Profile to Postgres
    const { error: dbError } = await supabaseAdmin.from("profiles").insert({
      id: authData.user.id,
      fin: fin,
      full_name: kycData.personalIdentity.fullName,
      phone_number: kycData.personalIdentity.phone,
      dob: kycData.personalIdentity.dob,
      gender: kycData.personalIdentity.gender,
      photo_url: kycData.biometrics?.face || null,
      role: "citizen",
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
auth.post("/reset-password", async (c) => {
  const { fin, otp, newPassword } = await c.req.json();

  try {
    // A. Verify Identity via Fayda
    // (If OTP is correct, we know this is the real owner of the ID)
    await FaydaService.verifyOtp(fin, otp);

    // B. Find the Supabase User ID by FIN
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("fin", fin)
      .single();

    if (!profile) return c.json({ error: "User not found" }, 404);

    // C. Admin Force Update Password
    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(profile.id, {
        password: newPassword,
      });

    if (updateError) throw updateError;

    return c.json({ message: "Password updated successfully" });
  } catch (err: any) {
    return c.json({ error: err.message || "Reset Failed" }, 400);
  }
});

auth.post("/initiate-reset", async (c) => {
  const { fin } = await c.req.json();
  if (!fin) return c.json({ error: "FIN required" }, 400);

  // A. Check if user EXISTS in Supabase
  const { data: user } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("fin", fin)
    .single();

  if (!user) {
    // Security: You can return generic "If user exists, OTP sent" to prevent enumeration,
    // but for this project, let's return a clear error.
    return c.json(
      { error: "No account found with this ID. Please Register." },
      404
    );
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
