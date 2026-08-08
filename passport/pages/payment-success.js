import { supabase } from '../../config/supabase.js';

// This page is a one-shot receipt view — it runs its check once per visit
// and doesn't hold any long-lived subscriptions or timers, so it doesn't
// need the cleanup[]/onCleanup pattern the other pages use. destroy() is
// still exported (required by the router's page-module shape) but is a
// no-op here.

function formatCurrency(val) {
    const n = Number(val) || 0;
    return 'R' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function showError(title, message, bannerText) {
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageSubtitle').textContent = message;
    const icon = document.getElementById('statusIcon');
    icon.classList.remove('pending');
    icon.innerHTML = '<i class="fas fa-triangle-exclamation"></i>';
    icon.style.background = '#fee2e2';
    icon.style.color = 'var(--red-deep)';
    icon.style.boxShadow = 'none';
    const banner = document.getElementById('errorBanner');
    banner.style.display = 'flex';
    document.getElementById('errorBannerText').textContent = bannerText || message;
}

async function run() {
    const params = new URLSearchParams(window.location.search);
    const transactionId = params.get('transaction_id');
    const paymentStatus = params.get('payment');

    if (paymentStatus && paymentStatus !== 'success') {
        showError(
            'Payment Not Completed',
            'This payment was cancelled or did not go through.',
            'Nothing was charged and your wallet was not credited. You can try again from the top-up page.'
        );
        return;
    }

    if (!transactionId) {
        showError(
            'No Transaction Found',
            'This page needs a transaction reference.',
            'If you just paid, check your wallet balance or contact support.'
        );
        return;
    }

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
        showError(
            'Please Log In',
            'We could not verify your session.',
            'Log in and check your wallet — your payment reference is saved either way.'
        );
        return;
    }

    const { data: tx, error: txError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

    if (txError || !tx) {
        showError(
            'Transaction Not Found',
            'We could not find this payment on our system.',
            'If money left your account, contact support with your Yoco reference: ' + transactionId
        );
        return;
    }

    const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', session.user.id)
        .single();

    if (walletError || !wallet) {
        showError(
            'Wallet Not Found',
            'We could not load your wallet.',
            'Please contact support with your Yoco reference: ' + transactionId
        );
        return;
    }

    let newBalance = wallet.balance;

    if (tx.status === 'completed') {
        newBalance = wallet.balance;
    } else {
        newBalance = Number(wallet.balance) + Number(tx.amount);

        const { error: updateTxError } = await supabase
            .from('wallet_transactions')
            .update({ status: 'completed' })
            .eq('id', transactionId);
        if (updateTxError) {
            showError(
                'Payment Verified, Update Failed',
                'Your payment was received but we could not update your wallet automatically.',
                'Contact support with your Yoco reference — your money is safe: ' + transactionId
            );
            return;
        }

        const { error: updateWalletError } = await supabase
            .from('wallets')
            .update({ balance: newBalance })
            .eq('user_id', session.user.id);
        if (updateWalletError) {
            showError(
                'Payment Verified, Update Failed',
                'Your payment was received but we could not update your wallet automatically.',
                'Contact support with your Yoco reference — your money is safe: ' + transactionId
            );
            return;
        }
    }

    // profiles.id is the same UUID as the auth session user id in this schema.
    // profiles.auth_user_id exists but is unused/always null — do not filter by it.
    const { data: profile } = await supabase
        .from('profiles')
        .select('name, surname, wallet_id, created_at')
        .eq('id', session.user.id)
        .maybeSingle();

    const fullName = profile ? [profile.name, profile.surname].filter(Boolean).join(' ') : '';
    const dateStr = new Date(tx.created_at).toLocaleString('en-ZA', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    document.getElementById('amountAddedStat').textContent = formatCurrency(tx.amount);
    document.getElementById('newBalanceStat').textContent = formatCurrency(newBalance);

    document.getElementById('dvName').textContent = fullName || 'Wallet Holder';
    document.getElementById('dvWalletId').textContent = profile?.wallet_id ? `ID-${profile.wallet_id}` : '—';
    document.getElementById('dvMemberSince').textContent = profile?.created_at ? new Date(profile.created_at).getFullYear() : '—';
    document.getElementById('dvReference').textContent = tx.provider_reference || tx.id;
    document.getElementById('dvProvider').textContent = (tx.provider || 'yoco').toUpperCase();
    document.getElementById('dvStatus').textContent = 'Completed';
    document.getElementById('dvDate').textContent = dateStr;
    document.getElementById('detailList').style.display = 'block';

    const icon = document.getElementById('statusIcon');
    icon.classList.remove('pending');
    icon.innerHTML = '<i class="fas fa-check"></i>';

    document.getElementById('pageTitle').textContent = 'Top Up Successful';
    document.getElementById('pageSubtitle').textContent = 'Your Passport has been credited successfully.';

    // Strip the ?transaction_id=...&payment=... query string now that it's
    // been consumed, same as the old standalone page — but keep the
    // #/payment-success hash intact this time, since wiping it via
    // pathname-only would leave the router with no route on a refresh.
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
}

export default {
    async init() {
        // homeIconBtn / .brand / the action cards / bottom-action buttons
        // all navigate via data-link in the fragment — the router's global
        // click delegation handles those, no JS needed here.
        await run();
    },
    destroy() {}
};
