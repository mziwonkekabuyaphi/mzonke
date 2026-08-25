    import { supabase } from '../../config/supabase.js';

    let currentProfile = null;
    let currentActiveBooking = null;
    let currentTabCredit = 0;
    let currentCreditSource = null;
    let packages = [];
    let selectedTopupMethod = 'card';
    let tablesByPackage = {};   // package_id -> [{id, table_number}]
    let bookedTableIds = new Set();
    let selectedTableByPackage = {}; // package_id -> table_id

    function showToast(msg, isError = false) {
        const toast = document.getElementById('toastMessage');
        toast.innerText = msg;
        toast.style.borderLeftColor = isError ? 'var(--red)' : 'var(--green)';
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 3000);
    }
    function showModal(title, message) {
        document.getElementById('modalTitle').innerText = title;
        document.getElementById('modalMessage').innerHTML = message;
        document.getElementById('infoModal').classList.add('active');
    }
    window.closeModal = function() {
        document.getElementById('infoModal').classList.remove('active');
    }
    function currentProfileFullName() {
        if (!currentProfile) return 'Guest';
        return [currentProfile.name, currentProfile.surname].filter(Boolean).join(' ') || 'Guest';
    }
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
    }

    // Splits a single "Full Name" input into separate first-name / surname values
    // so both can be written to their own columns even though staff only type one field.
    function splitFullName(fullName) {
        const trimmed = (fullName || '').trim().replace(/\s+/g, ' ');
        if (!trimmed) return { name: '', surname: '' };
        const parts = trimmed.split(' ');
        const name = parts.shift();
        const surname = parts.join(' ');
        return { name, surname };
    }

    // Normalizes any phone number staff type (with +27, 27, 0027, spaces, dashes, etc.)
    // into the local 0-prefixed format (e.g. 0712345678) so we never store the 27 country code.
    function normalizePhone(raw) {
        let digits = (raw || '').replace(/\D/g, '');
        if (!digits) return '';
        if (digits.startsWith('00')) digits = digits.slice(2);       // 0027... -> 27...
        if (digits.startsWith('27') && digits.length === 11) {
            digits = '0' + digits.slice(2);                          // 27821234567 -> 0821234567
        } else if (digits.startsWith('27') && digits.length > 11) {
            digits = '0' + digits.slice(-9);                         // fallback: keep last 9 digits
        } else if (!digits.startsWith('0') && digits.length === 9) {
            digits = '0' + digits;                                    // missing leading 0
        }
        return digits;
    }

    // Find an existing customer by phone, or register a brand new one on the spot —
    // so staff can book a table for someone who has never signed up (e.g. over the phone).
    async function findOrRegisterCustomer() {
        const fullNameInput = document.getElementById('customerNameInput').value.trim();
        const phone = normalizePhone(document.getElementById('customerPhone').value.trim());
        const email = document.getElementById('customerEmail').value.trim();

        if (!phone) {
            showToast('Enter a phone number', true);
            return;
        }

        const { data } = await supabase.from('profiles').select('id, name, surname, phone, email').eq('phone', phone).maybeSingle();
        let profile = data || null;

        if (!profile) {
            // Nobody on file with this number — register them right now so the table can still be booked
            if (!fullNameInput) { showToast('New customer — please enter their name to register them', true); return; }
            const { name, surname } = splitFullName(fullNameInput);
            const { data: created, error: createErr } = await supabase
                .from('profiles')
                .insert([{ name, surname, phone, email: email || null }])
                .select('id, name, surname, phone, email')
                .single();
            if (createErr) { showToast('Could not register customer: ' + createErr.message, true); return; }
            profile = created;
            showToast(`New customer registered: ${[profile.name, profile.surname].filter(Boolean).join(' ')}`);
        }

        currentProfile = profile;
        const fullName = [profile.name, profile.surname].filter(Boolean).join(' ');
        document.getElementById('customerNameInput').value = fullName;
        document.getElementById('customerPhone').value = profile.phone || '';
        document.getElementById('customerEmail').value = profile.email || '';
        document.getElementById('customerNameDisplay').innerText = fullName || profile.phone || 'Guest';

        // Fetch current tab credit – first from active VVIP booking, then from vvip_tab_accounts
        const { data: booking } = await supabase
            .from('vvip_bookings')
            .select('id, remaining_balance')
            .eq('customer_id', profile.id)
            .in('status', ['confirmed', 'checked_in', 'seated'])
            .order('created_at', { ascending: false })
            .maybeSingle();

        if (booking) {
            currentActiveBooking = { id: booking.id, remaining: booking.remaining_balance ?? 0 };
            currentTabCredit = booking.remaining_balance ?? 0;
            currentCreditSource = 'booking';
        } else {
            const { data: tabAcc } = await supabase
                .from('vvip_tab_accounts')
                .select('id, balance')
                .eq('user_id', profile.id)
                .maybeSingle();
            if (tabAcc && tabAcc.balance > 0) {
                currentTabCredit = tabAcc.balance;
                currentCreditSource = 'tab_account';
                currentActiveBooking = null;
            } else {
                currentTabCredit = 0;
                currentCreditSource = null;
                currentActiveBooking = null;
            }
        }

        document.getElementById('tabCreditAmount').innerHTML = `R${currentTabCredit.toFixed(2)}`;
        document.getElementById('creditSection').style.display = 'flex';
        document.getElementById('packagesSection').style.display = 'block';
        await loadPackages();
        showToast(`Loaded ${fullName || profile.phone} | Tab credit: R${currentTabCredit.toFixed(2)}`);
        setupRealtime();
    }
    window.loadCustomer = findOrRegisterCustomer;

    async function loadPackages() {
        const { data, error } = await supabase
            .from('vvip_packages')
            .select('*')
            .eq('status', 'active')
            .order('price', { ascending: true });
        if (error) {
            showToast('Error loading packages: ' + error.message, true);
            return;
        }
        packages = data || [];

        // Real per-table availability, same source of truth as the customer app and POS
        const packageIds = packages.map(p => p.id);
        tablesByPackage = {};
        bookedTableIds = new Set();
        if (packageIds.length) {
            const { data: allTables } = await supabase.from('vvip_tables').select('id, package_id, table_number').in('package_id', packageIds);
            const { data: activeBookings } = await supabase.from('vvip_bookings').select('table_id').not('status', 'in', '(cancelled,no_show)').not('table_id', 'is', null);
            bookedTableIds = new Set((activeBookings || []).map(b => b.table_id));
            (allTables || []).forEach(t => {
                if (!tablesByPackage[t.package_id]) tablesByPackage[t.package_id] = [];
                tablesByPackage[t.package_id].push(t);
            });
        }
        renderPackages();
    }

    function renderPackages() {
        const container = document.getElementById('packagesContainer');
        if (!packages.length) {
            container.innerHTML = '<div class="loading"><i class="fas fa-crown"></i> No packages available.</div>';
            return;
        }
        container.innerHTML = packages.map(pkg => {
            const tabCredit = pkg.tab_credit || 0;
            const benefits = pkg.benefits || [];
            const pkgTables = tablesByPackage[pkg.id] || [];
            const availableCount = pkgTables.filter(t => !bookedTableIds.has(t.id)).length;
            const selectedTableId = selectedTableByPackage[pkg.id] || null;

            const tableSelectBlock = pkgTables.length ? `
                <div class="table-select-wrap">
                    <div class="table-select-label"><i class="fas fa-chair"></i> Choose a table (${availableCount} available)</div>
                    ${availableCount ? `
                        <div class="table-select-grid">
                            ${pkgTables.map(t => {
                                const taken = bookedTableIds.has(t.id);
                                const isSelected = selectedTableId === t.id;
                                return `<button type="button" class="table-select-chip ${taken ? 'taken' : ''} ${isSelected ? 'selected' : ''}" data-package-id="${pkg.id}" data-table-id="${t.id}" data-table-label="${escapeHtml(t.table_number)}" ${taken ? 'disabled' : ''}>${escapeHtml(t.table_number)}</button>`;
                            }).join('')}
                        </div>
                    ` : `<div class="table-select-empty"><i class="fas fa-exclamation-triangle"></i> All tables in this package are currently booked</div>`}
                </div>
            ` : `<div class="table-select-wrap"><div class="no-tables-fallback"><i class="fas fa-info-circle"></i> No named tables set up for this package yet — purchase will not be tied to a specific table.</div></div>`;

            const canPurchase = pkgTables.length ? (!!selectedTableId) : true;
            const noTablesLeft = pkgTables.length > 0 && availableCount === 0;

            return `
                <div class="package-card">
                    <div class="package-image">
                        ${pkg.image ? `<img src="${pkg.image}" style="width:100%; height:100%; object-fit:cover;">` : '<i class="fas fa-crown"></i>'}
                    </div>
                    <div class="package-content">
                        <div class="package-header">
                            <span class="package-name">${escapeHtml(pkg.name)}</span>
                            <span class="package-price">R${pkg.price}</span>
                        </div>
                        <div class="package-meta">
                            <span><i class="fas fa-table"></i> ${pkgTables.length || pkg.capacity || 0} tables</span>
                            <span><i class="fas fa-coins"></i> Tab credit: R${tabCredit}</span>
                        </div>
                        <div class="benefits-list">
                            ${benefits.slice(0, 3).map(b => `<span class="benefit-tag"><i class="fas fa-check"></i> ${escapeHtml(b)}</span>`).join('')}
                            ${benefits.length > 3 ? `<span class="benefit-tag">+${benefits.length-3} more</span>` : ''}
                        </div>
                        ${tableSelectBlock}
                        <div class="payment-options">
                            <button class="pay-btn pay-tab" data-package='${JSON.stringify(pkg)}' data-method="tab" ${(!canPurchase || noTablesLeft) ? 'disabled' : ''}><i class="fas fa-wallet"></i> Tab Credit</button>
                            <button class="pay-btn pay-cash" data-package='${JSON.stringify(pkg)}' data-method="cash" ${(!canPurchase || noTablesLeft) ? 'disabled' : ''}><i class="fas fa-money-bill"></i> Cash</button>
                            <button class="pay-btn pay-card" data-package='${JSON.stringify(pkg)}' data-method="card" ${(!canPurchase || noTablesLeft) ? 'disabled' : ''}><i class="fas fa-credit-card"></i> Card (Yoco)</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        document.querySelectorAll('.table-select-chip:not(.taken)').forEach(chip => {
            chip.addEventListener('click', () => {
                selectedTableByPackage[chip.dataset.packageId] = chip.dataset.tableId;
                renderPackages();
            });
        });

        document.querySelectorAll('.pay-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const packageData = JSON.parse(btn.dataset.package);
                const method = btn.dataset.method;
                const tableId = selectedTableByPackage[packageData.id] || null;
                await handlePackagePurchase(packageData, method, tableId);
            });
        });
    }

    async function handlePackagePurchase(pkg, method, tableId) {
        if (!currentProfile) {
            showModal('No Customer', 'Please load a customer first.');
            return;
        }
        const pkgTables = tablesByPackage[pkg.id] || [];
        if (pkgTables.length && !tableId) {
            showToast('Select a table for this package first', true);
            return;
        }
        let tableLabel = null;
        if (tableId) {
            // Re-check right before charging — someone else may have just taken this table
            const { data: clash } = await supabase
                .from('vvip_bookings')
                .select('id')
                .eq('table_id', tableId)
                .not('status', 'in', '(cancelled,no_show)')
                .limit(1);
            if (clash && clash.length) {
                showToast('That table was just taken — pick another', true);
                delete selectedTableByPackage[pkg.id];
                await loadPackages();
                return;
            }
            tableLabel = pkgTables.find(t => t.id === tableId)?.table_number || null;
        }

        if (method === 'tab') {
            if (currentTabCredit < pkg.price) {
                showModal('Insufficient Tab Credit', `You need R${pkg.price} but have only R${currentTabCredit.toFixed(2)}. Please top up or use another payment method.`);
                return;
            }
            let newBalance = currentTabCredit - pkg.price;
            if (currentCreditSource === 'booking' && currentActiveBooking) {
                const { error: updateErr } = await supabase
                    .from('vvip_bookings')
                    .update({ remaining_balance: newBalance })
                    .eq('id', currentActiveBooking.id);
                if (updateErr) throw updateErr;
            } else if (currentCreditSource === 'tab_account') {
                const { data: tabAcc } = await supabase
                    .from('vvip_tab_accounts')
                    .select('id')
                    .eq('user_id', currentProfile.id)
                    .single();
                if (tabAcc) {
                    const { error: updateErr } = await supabase
                        .from('vvip_tab_accounts')
                        .update({ balance: newBalance })
                        .eq('id', tabAcc.id);
                    if (updateErr) throw updateErr;
                } else {
                    showModal('Error', 'Tab account not found', true);
                    return;
                }
            } else {
                showModal('Error', 'No active credit source', true);
                return;
            }
            const bookingRef = `VVIP-${Date.now()}-${Math.floor(Math.random()*10000)}`;
            const { error: insertErr } = await supabase.from('vvip_bookings').insert([{
                package_id: pkg.id,
                customer_id: currentProfile.id,
                customer_phone: currentProfile.phone || '',
                customer_name: currentProfileFullName(),
                booking_reference: bookingRef,
                quantity: 1,
                total_amount: pkg.price,
                remaining_balance: pkg.tab_credit || 0,
                status: 'confirmed',
                table_id: tableId || null,
                created_at: new Date().toISOString()
            }]);
            if (insertErr) throw insertErr;
            await supabase.from('vvip_packages').update({ sold_count: (pkg.sold_count || 0) + 1 }).eq('id', pkg.id);
            delete selectedTableByPackage[pkg.id];
            await loadCustomer();
            showToast(`Package purchased using Tab Credit${tableLabel ? ' · ' + tableLabel : ''}! New tab credit: R${newBalance.toFixed(2)}`);
        } 
        else if (method === 'cash') {
            const bookingRef = `VVIP-${Date.now()}-${Math.floor(Math.random()*10000)}`;
            const { error: insertErr } = await supabase.from('vvip_bookings').insert([{
                package_id: pkg.id,
                customer_id: currentProfile.id,
                customer_phone: currentProfile.phone || '',
                customer_name: currentProfileFullName(),
                booking_reference: bookingRef,
                quantity: 1,
                total_amount: pkg.price,
                remaining_balance: pkg.tab_credit || 0,
                status: 'confirmed',
                table_id: tableId || null,
                created_at: new Date().toISOString()
            }]);
            if (insertErr) throw insertErr;
            await supabase.from('vvip_packages').update({ sold_count: (pkg.sold_count || 0) + 1 }).eq('id', pkg.id);
            delete selectedTableByPackage[pkg.id];
            await loadCustomer();
            showToast(`Package reserved for cash payment${tableLabel ? ' · ' + tableLabel : ''}. Booking ref: ${bookingRef}`);
        }
        else if (method === 'card') {
            if (confirm(`Pay R${pkg.price} with Yoco card? (Demo – no actual charge)`)) {
                const bookingRef = `VVIP-${Date.now()}-${Math.floor(Math.random()*10000)}`;
                const { error: insertErr } = await supabase.from('vvip_bookings').insert([{
                    package_id: pkg.id,
                    customer_id: currentProfile.id,
                    customer_phone: currentProfile.phone || '',
                    customer_name: currentProfileFullName(),
                    booking_reference: bookingRef,
                    quantity: 1,
                    total_amount: pkg.price,
                    remaining_balance: pkg.tab_credit || 0,
                    status: 'confirmed',
                    table_id: tableId || null,
                    created_at: new Date().toISOString()
                }]);
                if (insertErr) throw insertErr;
                await supabase.from('vvip_packages').update({ sold_count: (pkg.sold_count || 0) + 1 }).eq('id', pkg.id);
                delete selectedTableByPackage[pkg.id];
                await loadCustomer();
                showToast(`Package purchased with Card${tableLabel ? ' · ' + tableLabel : ''}! Booking ref: ${bookingRef}`);
            }
        }
    }

    async function topUpTabCredit(amount, method) {
        if (!currentProfile) {
            showModal('No Customer', 'Please load a customer first.');
            return false;
        }
        if (amount < 10) {
            showModal('Invalid Amount', 'Minimum top-up is R10');
            return false;
        }
        if (method === 'card') {
            if (confirm(`Pay R${amount} with Yoco card? (Demo)`)) {
                let newBalance;
                if (currentCreditSource === 'booking' && currentActiveBooking) {
                    newBalance = currentTabCredit + amount;
                    const { error: updateErr } = await supabase
                        .from('vvip_bookings')
                        .update({ remaining_balance: newBalance })
                        .eq('id', currentActiveBooking.id);
                    if (updateErr) throw updateErr;
                } else if (currentCreditSource === 'tab_account') {
                    const { data: tabAcc } = await supabase
                        .from('vvip_tab_accounts')
                        .select('id')
                        .eq('user_id', currentProfile.id)
                        .single();
                    if (tabAcc) {
                        newBalance = currentTabCredit + amount;
                        const { error: updateErr } = await supabase
                            .from('vvip_tab_accounts')
                            .update({ balance: newBalance })
                            .eq('id', tabAcc.id);
                        if (updateErr) throw updateErr;
                    } else {
                        const { data: newAcc } = await supabase
                            .from('vvip_tab_accounts')
                            .insert({ user_id: currentProfile.id, balance: amount })
                            .select()
                            .single();
                        if (newAcc) newBalance = amount;
                        else throw new Error('Failed to create tab account');
                    }
                } else {
                    const { data: newAcc } = await supabase
                        .from('vvip_tab_accounts')
                        .insert({ user_id: currentProfile.id, balance: amount })
                        .select()
                        .single();
                    if (newAcc) newBalance = amount;
                    else throw new Error('Failed to create tab account');
                }
                await loadCustomer();
                showToast(`Topped up R${amount}! New tab credit: R${newBalance.toFixed(2)}`);
                return true;
            }
        } else if (method === 'wallet') {
            const { data: wallet, error: walletErr } = await supabase
                .from('wallets')
                .select('id, balance')
                .eq('user_id', currentProfile.id)
                .single();
            if (walletErr || !wallet) {
                showModal('Wallet Error', 'No Rands Wallet found for this user.');
                return false;
            }
            if (wallet.balance < amount) {
                showModal('Insufficient Wallet Balance', `You have R${wallet.balance.toFixed(2)} in your wallet.`);
                return false;
            }
            const newWalletBalance = wallet.balance - amount;
            const { error: updateWallet } = await supabase
                .from('wallets')
                .update({ balance: newWalletBalance, updated_at: new Date().toISOString() })
                .eq('id', wallet.id);
            if (updateWallet) throw updateWallet;
            
            let newTabBalance;
            if (currentCreditSource === 'booking' && currentActiveBooking) {
                newTabBalance = currentTabCredit + amount;
                const { error: updateTab } = await supabase
                    .from('vvip_bookings')
                    .update({ remaining_balance: newTabBalance })
                    .eq('id', currentActiveBooking.id);
                if (updateTab) throw updateTab;
            } else if (currentCreditSource === 'tab_account') {
                const { data: tabAcc } = await supabase
                    .from('vvip_tab_accounts')
                    .select('id')
                    .eq('user_id', currentProfile.id)
                    .single();
                if (tabAcc) {
                    newTabBalance = currentTabCredit + amount;
                    const { error: updateTab } = await supabase
                        .from('vvip_tab_accounts')
                        .update({ balance: newTabBalance })
                        .eq('id', tabAcc.id);
                    if (updateTab) throw updateTab;
                } else {
                    const { data: newAcc } = await supabase
                        .from('vvip_tab_accounts')
                        .insert({ user_id: currentProfile.id, balance: amount })
                        .select()
                        .single();
                    if (newAcc) newTabBalance = amount;
                    else throw new Error('Failed to create tab account');
                }
            } else {
                const { data: newAcc } = await supabase
                    .from('vvip_tab_accounts')
                    .insert({ user_id: currentProfile.id, balance: amount })
                    .select()
                    .single();
                if (newAcc) newTabBalance = amount;
                else throw new Error('Failed to create tab account');
            }
            await loadCustomer();
            showToast(`Topped up R${amount} using Rands Wallet! New tab credit: R${newTabBalance.toFixed(2)}`);
            return true;
        }
    }

    function setupRealtime() {
        if (!currentProfile) return;
        const channel = supabase.channel('vvip-store');
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'vvip_bookings', filter: `customer_id=eq.${currentProfile.id}` }, () => loadCustomer())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'vvip_tab_accounts', filter: `user_id=eq.${currentProfile.id}` }, () => loadCustomer())
            .subscribe();
    }

    // DOM event bindings
    document.getElementById('loadCustomerBtn').addEventListener('click', loadCustomer);
    document.getElementById('storeRefreshBtn').addEventListener('click', () => location.reload());
    document.getElementById('clearCustomerBtn').addEventListener('click', () => {
        currentProfile = null;
        currentActiveBooking = null;
        currentTabCredit = 0;
        currentCreditSource = null;
        selectedTableByPackage = {};
        document.getElementById('creditSection').style.display = 'none';
        document.getElementById('packagesSection').style.display = 'none';
        document.getElementById('customerNameInput').value = '';
        document.getElementById('customerPhone').value = '';
        document.getElementById('customerEmail').value = '';
        showToast('Customer cleared');
    });
    document.getElementById('openTopupBtn').addEventListener('click', () => {
        document.getElementById('topupModal').classList.add('active');
    });
    document.getElementById('cancelTopupBtn').addEventListener('click', () => {
        document.getElementById('topupModal').classList.remove('active');
    });
    document.getElementById('topupMethodCard').addEventListener('click', () => {
        selectedTopupMethod = 'card';
        document.getElementById('topupMethodCard').classList.add('active');
        document.getElementById('topupMethodWallet').classList.remove('active');
    });
    document.getElementById('topupMethodWallet').addEventListener('click', () => {
        selectedTopupMethod = 'wallet';
        document.getElementById('topupMethodWallet').classList.add('active');
        document.getElementById('topupMethodCard').classList.remove('active');
    });
    document.getElementById('confirmTopupBtn').addEventListener('click', async () => {
        const amount = parseFloat(document.getElementById('topupAmount').value);
        if (isNaN(amount) || amount < 10) {
            showModal('Invalid Amount', 'Please enter an amount of at least R10');
            return;
        }
        document.getElementById('topupModal').classList.remove('active');
        await topUpTabCredit(amount, selectedTopupMethod);
    });

    // Initial load: preload packages so they're ready
    loadPackages();
