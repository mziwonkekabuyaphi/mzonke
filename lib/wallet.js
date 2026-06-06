import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// =============================
// GET WALLET
// =============================
export async function getWallet(phone) {
  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", phone)
    .single();

  if (error && error.code !== "PGRST116") {
    console.log("GET WALLET ERROR:", error);
  }

  return data;
}

// =============================
// CREATE WALLET IF NOT EXISTS
// =============================
export async function getOrCreateWallet(phone) {
  let wallet = await getWallet(phone);

  if (!wallet) {
    const { data, error } = await supabase
      .from("wallets")
      .insert({
        user_id: phone,
        balance: 0
      })
      .select()
      .single();

    if (error) {
      console.log("CREATE WALLET ERROR:", error);
      return null;
    }

    wallet = data;
  }

  return wallet;
}

// =============================
// CREDIT WALLET
// =============================
export async function creditWallet(phone, amount, reason = "credit") {
  const wallet = await getOrCreateWallet(phone);

  const newBalance = Number(wallet.balance) + Number(amount);

  const { error: updateError } = await supabase
    .from("wallets")
    .update({ balance: newBalance })
    .eq("user_id", phone);

  if (updateError) {
    console.log("CREDIT ERROR:", updateError);
    return false;
  }

  await supabase.from("wallet_transactions").insert({
    wallet_id: wallet.id,
    amount,
    type: "credit",
    description: reason
  });

  return true;
}

// =============================
// DEBIT WALLET
// =============================
export async function debitWallet(phone, amount, reason = "debit") {
  const wallet = await getOrCreateWallet(phone);

  if (Number(wallet.balance) < Number(amount)) {
    return {
      success: false,
      message: "Insufficient balance"
    };
  }

  const newBalance = Number(wallet.balance) - Number(amount);

  const { error: updateError } = await supabase
    .from("wallets")
    .update({ balance: newBalance })
    .eq("user_id", phone);

  if (updateError) {
    console.log("DEBIT ERROR:", updateError);
    return {
      success: false,
      message: "Update failed"
    };
  }

  await supabase.from("wallet_transactions").insert({
    wallet_id: wallet.id,
    amount,
    type: "debit",
    description: reason
  });

  return {
    success: true,
    balance: newBalance
  };
}
