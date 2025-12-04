// UPDATE WITH YOUR BACKEND URL
const API_URL = "https://script.google.com/macros/s/AKfycbx5vDWJWRqwrKYGv_P9DS3WfH7-q7QAJZmmMfP7Zu2WnMrV9unee4aJrBD89IbOxM1QUg/exec"; 

// GLOBAL STATE
let currentUser = null; 
let tasks = [];
let xp = 0;
let level = 1;
let subjects = [];
let categories = [];
let levelRewards = {}; 
let earnedBadges = [];
let rewardBundles = []; 
let bundleSelectionMode = false;
let selectedForBundle = [];
let bgColor = "#fef08a"; // Default Pastel Yellow
let badgeDebounceTimer = null; // Timer for misclick prevention

const BADGES = [
    { id: 'b_novice', icon: 'ph-footprints', name: 'Novice', desc: 'Complete 1 Task', check: (t) => t >= 1 },
    { id: 'b_apprentice', icon: 'ph-pencil', name: 'Apprentice', desc: 'Complete 10 Tasks', check: (t) => t >= 10 },
    { id: 'b_master', icon: 'ph-crown', name: 'Master', desc: 'Complete 50 Tasks', check: (t) => t >= 50 },
    { id: 'b_legend', icon: 'ph-trophy', name: 'Legend', desc: 'Complete 100 Tasks', check: (t) => t >= 100 },
    { id: 'b_streak', icon: 'ph-fire', name: 'On Fire', desc: 'Earn 1000 XP', check: (t, x) => x >= 1000 },
    { id: 'b_rich', icon: 'ph-diamond', name: 'Rich', desc: 'Earn 5000 XP', check: (t, x) => x >= 5000 },
    { id: 'b_level5', icon: 'ph-star', name: 'Rising Star', desc: 'Reach Level 5', check: (t, x, l) => l >= 5 },
    { id: 'b_level10', icon: 'ph-planet', name: 'Supernova', desc: 'Reach Level 10', check: (t, x, l) => l >= 10 },
    { id: 'b_early', icon: 'ph-sun', name: 'Early Bird', desc: 'Task done before 8 AM', manual: true },
    { id: 'b_night', icon: 'ph-moon', name: 'Night Owl', desc: 'Task done after 10 PM', manual: true },
    { id: 'b_weekend', icon: 'ph-confetti', name: 'Weekender', desc: 'Task done Sat/Sun', manual: true },
    { id: 'b_bundle', icon: 'ph-gift', name: 'Bundler', desc: 'Complete a Quest Bundle', manual: true }
];
const PRAISE = ["Amazing!", "Great job!", "You're glowing! ✨", "Keep it up!", "So productive!", "Unstoppable! 🚀", "Fantastic work!"];

document.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('growth_user');
    
    // SW Registration Logic (Clean up old ones)
    if ('serviceWorker' in navigator) {
        (async () => {
            try {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for(let registration of registrations) {
                    registration.unregister();
                }
            } catch (e) {
                console.warn("Service Worker disabled in this environment:", e);
            }
        })();
    }
    
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        document.getElementById('auth-container').classList.add('hidden');
        
        // FIX: Render UI immediately with cached data
        if(currentUser.settings) applySettings(currentUser.settings);
        renderUI(); 
        
        // Then fetch fresh data
        fetchUserData();
    } else {
        document.getElementById('auth-container').classList.remove('hidden');
    }
});

// --- GLOBAL ACTIONS ---
window.openGamification = function() {
    document.getElementById('gamification-modal').classList.remove('hidden');
    const earnedDiv = document.getElementById('badges-earned'); const lockedDiv = document.getElementById('badges-locked');
    earnedDiv.innerHTML = ''; lockedDiv.innerHTML = '';
    
    BADGES.forEach(b => {
        const unlocked = earnedBadges.includes(b.id);
        const el = document.createElement('div');
        el.className = `flex flex-col items-center text-center gap-2 p-3 rounded-2xl border badge-item relative group ${unlocked ? 'bg-yellow-50 border-yellow-200' : 'opacity-40 border-zinc-100 grayscale'}`;
        el.innerHTML = `<i class="ph-duotone ${b.icon} text-3xl ${unlocked ? 'text-yellow-500' : 'text-zinc-400'}"></i><div><p class="text-[10px] font-bold text-zinc-800">${b.name}</p></div><div class="badge-tooltip absolute bottom-full mb-2 w-32 bg-black text-white text-[10px] p-2 rounded shadow-lg opacity-0 invisible transition-all z-10 pointer-events-none">${b.desc}</div>`;
        if(unlocked) earnedDiv.appendChild(el); else lockedDiv.appendChild(el);
    });
}
window.closeGamification = function() { document.getElementById('gamification-modal').classList.add('hidden'); }

window.openQuestModal = function() {
    const elig = tasks.filter(t => t.status !== 'Completed');
    if(elig.length === 0) { showToast("Create tasks first! 🎯", true); return; }
    toggleBundleMode();
}

window.saveProfile = function() {
    const nameVal = document.getElementById('settings-name').value.trim();
    const colorVal = document.getElementById('settings-color').value;
    if(nameVal) currentUser.name = nameVal;
    bgColor = colorVal;
    localStorage.setItem('growth_user', JSON.stringify(currentUser));
    syncSettings(); renderUI(); showToast("Profile Saved! ✅");
}

window.handleAuth = async function(mode) {
    const btn = document.getElementById(`btn-${mode}`); const txt = btn.innerHTML; btn.innerHTML = '<i class="ph-bold ph-spinner animate-spin"></i>'; btn.disabled = true;
    const payload = { action: mode, data: {} };
    if (mode === 'signup') {
        const name = document.getElementById('signup-name').value.trim(), email = document.getElementById('signup-email').value.trim(), pass = document.getElementById('signup-pass').value;
        if(!name || !email || !pass) { showToast("Fill all fields", true); btn.innerHTML = txt; btn.disabled = false; return; }
        payload.data = { name, email, password: pass };
    } else {
        const email = document.getElementById('login-email').value.trim(), pass = document.getElementById('login-pass').value;
        if(!email || !pass) { showToast("Fill all fields", true); btn.innerHTML = txt; btn.disabled = false; return; }
        payload.data = { email, password: pass };
    }
    try {
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) }); const json = await res.json();
        if(json.status === 'success') {
            currentUser = { userId: json.userId, name: json.name, email: json.email };
            if(document.getElementById('login-remember').checked || mode === 'signup') localStorage.setItem('growth_user', JSON.stringify(currentUser));
            if(json.settings) applySettings(json.settings);
            document.getElementById('auth-container').classList.add('hidden'); fetchUserData();
        } else showToast(json.message, true);
    } catch(e) { showToast("Connection Error", true); } finally { btn.innerHTML = txt; btn.disabled = false; }
}

window.fetchUserData = async function() {
    if (!currentUser) return;
    showLoading(true);
    try {
        const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'fetch_tasks', userId: currentUser.userId }) });
        const json = await res.json();
        if (json.status === 'success') {
            tasks = json.tasks || [];
            if(json.settings) applySettings(json.settings);
            autoCleanup(); calculateLevel(); renderUI();
        } else {
            showToast("Fetch Failed: " + json.message, true);
        }
    } catch(e) {
        showToast("Network Error: Unable to sync", true);
    } finally { showLoading(false); }
}

window.syncTask = async function(action, taskData) {
    if (!currentUser) return;
    if (action === 'create') tasks.push(taskData);
    if (action === 'update') { const idx = tasks.findIndex(t => t.id === taskData.id); if(idx > -1) tasks[idx] = taskData; }
    if (action === 'delete') tasks = tasks.filter(t => t.id !== taskData.id);
    renderUI();
    if(action === 'delete') showToast("Task deleted"); else if(action === 'create') showToast("Task saved");
    
    // START: Persistence and Error Diagnostic Logic
    const response = await fetch(API_URL, { 
        method: 'POST', 
        body: JSON.stringify({ 
            action: 'sync', 
            userId: currentUser.userId, 
            taskAction: action, 
            task: taskData 
        }) 
    });

    if (response.ok) {
        const result = await response.json();
        if (result.status === 'success') {
            console.log(`SYNC SUCCESS: Task ${action} completed.`);
        } else {
            console.error("BACKEND ERROR: Failed to save task.", result.message);
            showToast(`Sync Failed: ${result.message}`, true);
        }
    } else {
        console.error("NETWORK ERROR: Failed to reach Google Script. Check API_URL.");
        showToast("Network Error: Data not saved.", true);
    }
    // END: Persistence and Error Diagnostic Logic
}

window.saveBundle = function() {
    const name = document.getElementById('new-bundle-name').value.trim();
    const rew = document.getElementById('new-bundle-reward').value.trim();
    if(!name) { showToast("Name required", true); return; }
    rewardBundles.push({ id: Date.now(), name: name + (rew ? ` (${rew})` : ''), taskIds: selectedForBundle, completed: false });
    syncSettings(); document.getElementById('bundle-name-modal').classList.add('hidden');
    toggleBundleMode(); renderUI(); showToast("Quest Created! ⚔️");
}

// --- HELPER FUNCTIONS ---
function applySettings(s) {
    if (s.subjects && Array.isArray(s.subjects)) subjects = s.subjects; 
    if (s.categories && Array.isArray(s.categories)) categories = s.categories; 
    if (s.levelRewards) levelRewards = s.levelRewards;
    if (s.xp) xp = parseInt(s.xp); 
    if (s.earnedBadges) earnedBadges = s.earnedBadges;
    if (s.rewardBundles) rewardBundles = s.rewardBundles;
    if (s.bgColor) bgColor = s.bgColor; 
    if (s.userName) { currentUser.name = s.userName; localStorage.setItem('growth_user', JSON.stringify(currentUser)); }
}

async function syncSettings() {
    if(!currentUser) return;
    const settings = { subjects, categories, levelRewards, xp, earnedBadges, rewardBundles, userName: currentUser.name, bgColor };
    await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'sync', userId: currentUser.userId, settings }) });
}

// --- LEVEL ROADMAP (Infinite Pagination) ---
window.openLevelsModal = function() {
    document.getElementById('levels-modal').classList.remove('hidden');
    const list = document.getElementById('levels-list');
    list.innerHTML = '';
    
    // Determine the base level for display blocks (e.g., starts at 1, 6, 11, etc.)
    const baseLevel = Math.floor((level - 1) / 5) * 5 + 1;
    
    // Set the loop start: Start at Level 2, or the determined base level, whichever is greater.
    // This ensures Level 1 is skipped for display purposes.
    const loopStart = Math.max(2, baseLevel);
    
    // Loop only needs to go 10 levels deep from the determined starting point
    for(let i = loopStart; i < loopStart + 10; i++) { 
        const xpNeeded = Math.floor(100 * Math.pow(i, 1.5));
        const existingReward = levelRewards[i] || "";
        const isCurrent = i === level;
        
        // Styling for White Modal Body
        list.innerHTML += `
            <div class="bg-zinc-50 p-4 rounded-2xl border ${isCurrent ? 'border-yellow-400 bg-yellow-50' : 'border-zinc-100'} mb-2">
                <div class="flex justify-between mb-1 items-center">
                    <span class="text-zinc-900 font-bold text-lg">Level ${i}</span>
                    <span class="text-[10px] uppercase font-bold text-zinc-500 bg-white px-2 py-1 rounded border border-zinc-200">${xpNeeded} XP</span>
                </div>
                <div class="flex items-center gap-2">
                    <i class="ph-fill ph-gift text-pink-400"></i>
                    <input type="text" value="${existingReward}" placeholder="Set Reward..." 
                        onchange="updateLevelReward(${i}, this.value)"
                        class="w-full bg-white rounded-lg p-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none border border-zinc-200 focus:border-pink-400 transition-colors">
                </div>
            </div>
        `;
    }
}
window.closeLevelsModal = function() { document.getElementById('levels-modal').classList.add('hidden'); }
window.updateLevelReward = function(lvl, val) { levelRewards[lvl] = val; syncSettings(); renderRewardCard(); }

// --- COLOR THEME ---
window.changeTheme = function(color) {
    bgColor = color;
    document.documentElement.style.setProperty('--bg-color', color);
    document.body.style.backgroundColor = color;
    document.body.style.backgroundImage = `radial-gradient(circle at 10% 20%, rgba(255, 255, 255, 0.1), transparent 40%), radial-gradient(circle at 90% 80%, rgba(255, 255, 255, 0.1), transparent 40%)`;
    
    // Check brightness to toggle dark text
    const r = parseInt(color.substr(1,2),16);
    const g = parseInt(color.substr(3,2),16);
    const b = parseInt(color.substr(5,2),16);
    const yiq = ((r*299)+(g*587)+(b*114))/1000;
    
    if(yiq >= 128) {
        document.body.classList.remove('dark-theme');
    } else {
        document.body.classList.add('dark-theme');
    }
}

// --- BUNDLE MODE ---
window.toggleBundleMode = function() {
    const elig = tasks.filter(t => t.status !== 'Completed');
    if(elig.length === 0) { showToast("Create tasks first! 🎯", true); return; }
    bundleSelectionMode = !bundleSelectionMode; selectedForBundle = [];
    if(bundleSelectionMode) { document.body.classList.add('selection-mode'); document.getElementById('bundle-bar').classList.remove('translate-y-full'); document.getElementById('fab-container').classList.add('hidden'); } 
    else { document.body.classList.remove('selection-mode'); document.getElementById('bundle-bar').classList.add('translate-y-full'); document.getElementById('fab-container').classList.remove('hidden'); }
    renderTasks();
}
window.toggleSelection = function(id) { if(selectedForBundle.includes(id)) selectedForBundle = selectedForBundle.filter(i => i !== id); else selectedForBundle.push(id); renderTasks(); }
window.finalizeBundleSelection = function() { if(selectedForBundle.length === 0) { showToast("Select tasks", true); return; } document.getElementById('bundle-name-modal').classList.remove('hidden'); }
window.deleteBundle = function(id) { if(!confirm("Delete quest?")) return; rewardBundles = rewardBundles.filter(b => b.id !== id); syncSettings(); renderUI(); }

// --- STANDARD UTILS ---
window.toggleAuthMode = function() { document.getElementById('login-form').classList.toggle('hidden'); document.getElementById('signup-form').classList.toggle('hidden'); }
window.togglePass = function(id) { const i = document.getElementById(id); i.type = i.type === 'password' ? 'text' : 'password'; }
window.logout = function() { localStorage.removeItem('growth_user'); location.reload(); }
window.showLoading = function(show) { document.getElementById('loading-overlay').classList.toggle('hidden', !show); }
window.showToast = function(msg, error = false) { const t = document.getElementById('toast'); document.getElementById('toast-message').innerText = msg; if(error) t.classList.add('bg-red-500'); else t.classList.remove('bg-red-500'); t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); }

// --- MODAL UTILS ---
window.openSettings = function() { document.getElementById('settings-modal').classList.remove('hidden'); switchTab('profile'); }
window.closeSettings = function() { document.getElementById('settings-modal').classList.add('hidden'); }
window.switchTab = function(tab) {
    ['subjects', 'categories', 'profile'].forEach(t => {
        const btn = document.getElementById(`tab-${t}`); const content = document.getElementById(`content-${t}`);
        if (t === tab) { 
            btn.classList.add('active');
            content.classList.remove('hidden'); 
        } else { 
            btn.classList.remove('active');
            content.classList.add('hidden'); 
        }
    });
    if(tab === 'subjects') renderSubjectsList(); if(tab === 'categories') renderCategoriesList();
    if(tab === 'profile') { document.getElementById('settings-name').value = currentUser ? currentUser.name : ''; document.getElementById('settings-color').value = bgColor; }
}
window.openModal = function(mode, id) {
    if(subjects.length === 0 || categories.length === 0) { showToast("Add Subjects & Categories first!", true); return; }
    const modal = document.getElementById('task-modal'); modal.classList.remove('hidden');
    requestAnimationFrame(() => { document.getElementById('modal-content').classList.remove('scale-95', 'opacity-0'); document.getElementById('modal-content').classList.add('scale-100', 'opacity-100'); });
    
    const subSelect = document.getElementById('task-subject'); const catSelect = document.getElementById('task-category');
    subSelect.innerHTML = subjects.map(s => `<option>${s}</option>`).join('');
    catSelect.innerHTML = categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

    document.getElementById('task-form').reset();
    const oldDel = document.getElementById('delete-btn'); if(oldDel) oldDel.remove();

    if (mode === 'create') {
        document.getElementById('task-id').value = ''; document.getElementById('task-date').valueAsDate = new Date(); document.getElementById('modal-title').innerText = "New Task";
    } else {
        const t = tasks.find(x => x.id === id);
        document.getElementById('task-id').value = t.id; document.getElementById('task-subject').value = t.subject; document.getElementById('task-category').value = t.category;
        document.getElementById('task-date').value = t.dueDate; document.getElementById('task-notes').value = t.notes; document.getElementById('task-link').value = t.link;
        document.getElementById('modal-title').innerText = "Edit Task";
        
        const delBtn = document.createElement('button'); delBtn.id = 'delete-btn'; delBtn.type = 'button'; delBtn.innerText = "Delete Task";
        delBtn.className = "w-full py-3 text-red-300 font-bold bg-red-500/10 rounded-xl border border-red-500/20 mt-3";
        delBtn.onclick = () => { 
            openConfirm("Delete Task?", () => { 
                syncTask('delete', {id}); 
                // FIX: Close the task modal immediately after confirmation
                closeModal(); 
            }); 
        };
        document.getElementById('modal-actions').appendChild(delBtn);
    }
}
window.closeModal = function() { document.getElementById('modal-content').classList.remove('scale-100', 'opacity-100'); document.getElementById('modal-content').classList.add('scale-95', 'opacity-0'); setTimeout(() => document.getElementById('task-modal').classList.add('hidden'), 300); }
window.handleFormSubmit = function(e) {
    e.preventDefault(); closeModal();
    const id = document.getElementById('task-id').value || 'task_' + Date.now();
    const mode = document.getElementById('task-id').value ? 'update' : 'create';
    const task = {
        id, subject: document.getElementById('task-subject').value, category: document.getElementById('task-category').value,
        dueDate: document.getElementById('task-date').value, notes: document.getElementById('task-notes').value,
        link: document.getElementById('task-link').value, status: 'Not Started'
    };
    if (mode === 'update') { const old = tasks.find(t => t.id === id); if (old) { task.status = old.status; task.completedAt = old.completedAt; } }
    syncTask(mode, task);
}

// --- RESET ---
window.openResetModal = function() { document.getElementById('confirm-modal').classList.add('hidden'); document.getElementById('reset-modal').classList.remove('hidden'); }
window.closeResetModal = function() { document.getElementById('reset-modal').classList.add('hidden'); }
window.confirmReset = function(type) {
    closeResetModal();
    openConfirm("Are you sure? Cannot undo.", () => {
        if(type === 'settings' || type === 'all') { subjects = []; categories = []; rewardBundles = []; }
        if(type === 'game' || type === 'all') { xp = 0; level = 1; earnedBadges = []; levelRewards = {}; }
        syncSettings(); closeSettings(); renderUI(); showToast("Reset Complete 🗑️");
    });
}
window.openConfirm = function(msg, action) {
    document.getElementById('confirm-title').innerText = msg;
    document.getElementById('confirm-modal').classList.remove('hidden');
    document.getElementById('confirm-action-btn').onclick = () => { action(); window.closeConfirm(); };
}
window.closeConfirm = function() { document.getElementById('confirm-modal').classList.add('hidden'); }

// --- BADGE LOGIC ---
window.closeAchievement = function() {
    document.getElementById('achievement-modal').classList.add('hidden');
}

function showAchievement(badge) {
    const modal = document.getElementById('achievement-modal');
    
    // Update Content
    document.getElementById('ach-icon').className = `ph-duotone ${badge.icon} text-7xl text-yellow-400 drop-shadow-[0_4px_10px_rgba(250,204,21,0.5)] animate-bounce`;
    document.getElementById('ach-name').innerText = badge.name;
    document.getElementById('ach-desc').innerText = badge.desc;
    
    modal.classList.remove('hidden');

    // Trigger Confetti Explosion
    const duration = 3000;
    const end = Date.now() + duration;

    (function frame() {
        // Launch confetti from left and right edges
        confetti({
            particleCount: 5,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#fcd34d', '#f472b6', '#ffffff'] 
        });
        confetti({
            particleCount: 5,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#fcd34d', '#f472b6', '#ffffff']
        });

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
    }());
}

function checkBadges(currentTask) {
    const completedCount = tasks.filter(t => t.status === 'Completed').length;
    let newBadgeFound = null;
    let badgesChanged = false;

    // Diagnostic Log
    console.log("Badge Check: Completed Tasks Count:", completedCount);

    BADGES.forEach(b => {
        let shouldHaveBadge = false;

        // A. Check Statistical Rules (Count, XP, Level)
        if (b.check) {
            if (b.check(completedCount, xp, level)) shouldHaveBadge = true;
        }

        // B. Check Manual Context (Time/Day)
        if (b.manual && currentTask && currentTask.status === 'Completed') {
            const hour = new Date(currentTask.completedAt).getHours(); // Use completedAt for accurate time
            const day = new Date(currentTask.completedAt).getDay(); // 0 = Sun, 6 = Sat

            if (b.id === 'b_early' && hour < 8) shouldHaveBadge = true;
            if (b.id === 'b_night' && hour >= 22) shouldHaveBadge = true;
            if (b.id === 'b_weekend' && (day === 0 || day === 6)) shouldHaveBadge = true;
        } else if (b.manual && earnedBadges.includes(b.id)) {
            // Keep manual badges if already earned
            shouldHaveBadge = true;
        }

        // C. Apply Logic (Grant or Revoke)
        const hasBadge = earnedBadges.includes(b.id);

        if (shouldHaveBadge && !hasBadge) {
            // GRANT BADGE
            earnedBadges.push(b.id);
            newBadgeFound = b;
            badgesChanged = true;
        } else if (!shouldHaveBadge && hasBadge && b.check) {
            // REVOKE BADGE (Only applies to calculated badges like Novice, Apprentice, etc.)
            earnedBadges = earnedBadges.filter(id => id !== b.id);
            badgesChanged = true;
            // ADDED FEEDBACK TO USER:
            showToast(`Badge lost: ${b.name} 📉`, true); 
            console.log(`Revoked badge: ${b.name}`);
        }
    });

    if (badgesChanged) syncSettings();

    // Only show animation if we actually gained something new
    if (newBadgeFound) {
        showAchievement(newBadgeFound);
    }
}


// --- QUEST/BUNDLE LOGIC ---
window.closeCelebration = function() {
    document.getElementById('celebration-modal').classList.add('hidden');
}

function checkBundles() {
    let bundlesChanged = false; // Flag to track changes
    rewardBundles.forEach(b => {
        if(b.completed) return;

        const allDone = b.taskIds.every(id => {
            const t = tasks.find(x => x.id === id);
            return t && t.status === 'Completed';
        });

        if(allDone) {
            b.completed = true;
            bundlesChanged = true;
            
            // 1. Show the Modal
            document.getElementById('celebration-reward-name').innerText = b.name;
            document.getElementById('celebration-modal').classList.remove('hidden');
            
            // Check for Bundler badge upon completion
            if(!earnedBadges.includes('b_bundle')) {
                earnedBadges.push('b_bundle');
                showAchievement(BADGES.find(b => b.id === 'b_bundle'));
            }

            // 2. Trigger Confetti Explosion
            const duration = 3000;
            const end = Date.now() + duration;

            (function frame() {
                confetti({
                    particleCount: 5,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 },
                    colors: ['#f472b6', '#fcd34d']
                });
                confetti({
                    particleCount: 5,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 },
                    colors: ['#f472b6', '#fcd34d']
                });

                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            }());
        }
    });

    if (bundlesChanged) {
        syncSettings();
        // ADDED: FORCE UI RE-RENDER HERE to remove the completed quest from the dashboard list
        renderUI(); 
    }
}

// --- TASK LOGIC ---

function toggleTask(id) {
    if(bundleSelectionMode) return;
    const task = tasks.find(t => t.id === id); if(!task) return;
    
    // 1. Immediate UI Updates (Strikethrough, etc.)
    const newStatus = task.status === 'Completed' ? 'Not Started' : 'Completed';
    task.status = newStatus;
    
    const checkbox = document.querySelector(`input[data-id="${id}"]`);
    
    if (newStatus === 'Completed') {
        task.completedAt = new Date().toISOString();
        const cat = categories.find(c => c.name === task.category);
        const pts = cat ? parseInt(cat.points) : 10;
        xp += pts;

        // Visual XP Fly
        if(checkbox) {
            const rect = checkbox.getBoundingClientRect();
            const headerRect = document.getElementById('level-circle').getBoundingClientRect();
            const flyEl = document.createElement('div'); flyEl.className = 'xp-fly'; flyEl.innerText = `+${pts} XP`;
            flyEl.style.left = `${rect.left}px`; flyEl.style.top = `${rect.top}px`;
            flyEl.style.setProperty('--dx', `${headerRect.left - rect.left}px`); flyEl.style.setProperty('--dy', `${headerRect.top - rect.top}px`);
            document.body.appendChild(flyEl); setTimeout(() => flyEl.remove(), 1000);
        }
        showToast(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
    } else {
        const cat = categories.find(c => c.name === task.category);
        xp = Math.max(0, xp - (cat ? parseInt(cat.points) : 10));
        delete task.completedAt;
    }
    
    // Save data immediately (This sends the state to the server)
    syncTask('update', task); 
    syncSettings(); 
    calculateLevel();

    // 2. Delayed Badge Checking (Misclick Protection / Debouncing)
    if (badgeDebounceTimer) clearTimeout(badgeDebounceTimer);

    badgeDebounceTimer = setTimeout(() => {
        checkBadges(task); 
        checkBundles();
    }, 2000);
}


// --- UI LOGIC ---
window.claimReward = function() { 
    // Get reward details from the modal before closing
    const claimedLevel = document.getElementById('levelup-level-display').innerText;
    const claimedReward = document.getElementById('levelup-reward-name').innerText;
    
    // Close the initial Level Up modal
    document.getElementById('levelup-modal').classList.add('hidden');
    
    // Open the new Receipt Viewer
    openReceiptViewer(claimedLevel, claimedReward);
    
    showToast("Reward Claimed! Your receipt is ready. 📜");
}

// --- NEW: Receipt Viewing Modal Functions ---

// 1. Draws the actual receipt onto the hidden canvas
function generateReceipt(level, rewardName) {
    const canvas = document.getElementById('receipt-canvas');
    const ctx = canvas.getContext('2d');

    // Set colors based on the app's dark theme/light theme for contrast
    const bgColor = document.body.classList.contains('dark-theme') ? '#18181b' : '#ffffff';
    const textColor = document.body.classList.contains('dark-theme') ? '#f4f4f5' : '#18181b';
    const accentColor = '#fcd34d'; // Yellow accent

    // Set Canvas size and background
    canvas.width = 400;
    canvas.height = 600;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 400, 600);

    // Header/Border Styling (Torn Paper Effect)
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.rect(10, 10, 380, 580);
    ctx.stroke();

    // Title
    ctx.fillStyle = textColor;
    ctx.font = '700 24px Quicksand';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL UP REWARD RECEIPT', 200, 50);
    
    // Separator Line
    ctx.beginPath();
    ctx.moveTo(30, 65);
    ctx.lineTo(370, 65);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Reward Details
    ctx.fillStyle = accentColor;
    ctx.font = '700 48px Quicksand';
    ctx.fillText(`LEVEL ${level}`, 200, 150);

    ctx.fillStyle = textColor;
    ctx.font = '500 20px Quicksand';
    ctx.fillText('REWARD GRANTED:', 200, 200);

    ctx.font = '700 28px Quicksand';
    ctx.fillText(rewardName.toUpperCase(), 200, 245);
    
    // Status/Metadata
    ctx.font = '400 16px Quicksand';
    ctx.textAlign = 'left';
    ctx.fillText('DATE CLAIMED:', 50, 350);
    ctx.fillText('USER:', 50, 380);
    ctx.fillText('STATUS:', 50, 410);

    ctx.font = '600 16px Quicksand';
    ctx.fillStyle = accentColor;
    ctx.textAlign = 'right';
    ctx.fillText(new Date().toLocaleDateString(), 350, 350);
    ctx.fillText(currentUser.name, 350, 380);
    ctx.fillText('CLAIMED', 350, 410);

    // Footer
    ctx.fillStyle = textColor;
    ctx.font = '400 12px Quicksand';
    ctx.textAlign = 'center';
    ctx.fillText('Thank you for leveling up!', 200, 550);
}

// 2. Opens the generated receipt image in a modal
function openReceiptViewer(level, rewardName) {
    generateReceipt(level, rewardName);
    const canvas = document.getElementById('receipt-canvas');
    const imageData = canvas.toDataURL('image/png');

    // Display the image in the new modal added to index.html
    const modal = document.getElementById('receipt-viewer-modal');
    document.getElementById('receipt-image-display').src = imageData;
    modal.classList.remove('hidden');
}

window.downloadReceipt = function() {
    const img = document.getElementById('receipt-image-display');
    const link = document.createElement('a');
    
    // Attempt to parse level from the text (safe fallback to 1)
    const levelText = document.getElementById('levelup-level-display').innerText || '1';

    link.download = `LevelUp_Lvl${levelText}_Receipt.png`;
    link.href = img.src;
    link.click();
}

window.closeReceiptViewer = function() {
    document.getElementById('receipt-viewer-modal').classList.add('hidden');
}


function renderUI() { 
    if(!currentUser) return; 
    
    // FIX: Add Fallback Name and keep emoji separate
    const name = currentUser.name || 'Student';
    document.getElementById('greeting').innerText = `Hi ${name}`; 
    
    changeTheme(bgColor);
    renderHeader(); 
    renderBundles(); 
    renderTasks(); 
    renderRewardCard(); 
}
function renderHeader() {
    document.getElementById('level-display').innerText = level; document.getElementById('header-points').innerText = `${xp} XP`;
    const circle = document.getElementById('level-circle'); const nextXp = Math.floor(100 * Math.pow(level, 1.5)); const currentBase = level === 1 ? 0 : Math.floor(100 * Math.pow(level - 1, 1.5));
    const percent = Math.min(1, Math.max(0, (xp - currentBase) / (nextXp - currentBase))); circle.style.strokeDashoffset = 126 - (percent * 126);
    document.getElementById('next-level-text').innerText = `Next: ${nextXp - xp} XP`;
}
function renderRewardCard() {
    const card = document.getElementById('level-reward-card'); const nextLvl = level + 1; const reward = levelRewards[nextLvl];
    if (reward) {
        card.classList.remove('hidden'); document.getElementById('level-reward-name').innerText = reward;
        const nextXp = Math.floor(100 * Math.pow(level, 1.5)); const currentBase = level === 1 ? 0 : Math.floor(100 * Math.pow(level - 1, 1.5));
        const percent = ((xp - currentBase) / (nextXp - currentBase)) * 100;
        document.getElementById('level-progress-bar').style.width = `${percent}%`; document.getElementById('xp-needed-text').innerText = `${nextXp - xp} XP to go`;
    } else { card.classList.add('hidden'); }
}
function renderBundles() {
    // Note: The logic already filters out completed bundles automatically
    const container = document.getElementById('quest-container'); container.innerHTML = '';
    rewardBundles.filter(b => !b.completed).forEach(b => {
        const total = b.taskIds.length;
        const done = b.taskIds.filter(id => tasks.find(t => t.id === id && t.status === 'Completed')).length;
        container.innerHTML += `
            <div class="glass-panel p-4 rounded-2xl border-l-4 border-yellow-400 relative overflow-hidden group">
                <button onclick="deleteBundle(${b.id})" class="absolute top-2 right-2 text-zinc-500 hover:text-red-400 z-20"><i class="ph-bold ph-trash"></i></button>
                <i class="ph-duotone ph-gift absolute -right-2 -bottom-2 text-6xl text-white/5"></i>
                <div class="relative z-10"><h3 class="font-bold text-dynamic-main text-sm mb-1">Quest: ${b.name}</h3><div class="w-full bg-black/10 rounded-full h-1.5"><div class="bg-yellow-400 h-1.5 rounded-full transition-all" style="width:${(done/total)*100}%"></div></div><p class="text-[10px] text-dynamic-muted mt-1 text-right">${done}/${total} tasks</p></div>
            </div>`;
    });
}
function renderTasks() {
    const list = document.getElementById('task-list'); list.innerHTML = '';
    
    if (!tasks || tasks.length === 0) { 
        document.getElementById('empty-state').classList.remove('hidden'); 
        return; 
    }
    
    document.getElementById('empty-state').classList.add('hidden');
    tasks.forEach(task => {
        const isDone = task.status === 'Completed';
        const catInfo = categories.find(c => c.name === task.category);
        const pts = catInfo ? catInfo.points : 10;
        const card = document.createElement('div');
        card.className = `glass-panel p-5 rounded-3xl relative transition-all duration-300 ${isDone ? 'opacity-50 grayscale' : 'hover:-translate-y-1'}`;
        
        if(bundleSelectionMode) {
            const isSelected = selectedForBundle.includes(task.id);
            card.className = `glass-panel p-5 rounded-3xl relative transition-all border border-transparent ${isSelected ? 'border-yellow-400 bg-yellow-400/10' : ''}`;
            card.onclick = () => { toggleSelection(task.id); renderTasks(); };
            card.innerHTML = `<div class="flex items-center gap-4 pointer-events-none"><div class="w-6 h-6 rounded-full border border-zinc-500 flex items-center justify-center ${isSelected ? 'bg-yellow-400 border-yellow-400 text-black' : ''}">${isSelected ? '<i class="ph-bold ph-check"></i>' : ''}</div><div><h3 class="font-bold text-dynamic-main">${task.subject}</h3><p class="text-xs text-dynamic-muted">${task.category}</p></div></div>`;
        } else {
            card.innerHTML = `
                <div class="flex gap-4">
                    <label class="relative flex items-center p-3 rounded-full cursor-pointer"><input type="checkbox" data-id="${task.id}" class="w-6 h-6 border border-zinc-500 rounded-full custom-check transition-all" ${isDone ? 'checked' : ''} onchange="toggleTask('${task.id}')"></label>
                    <div class="flex-1 py-1" onclick="openModal('update', '${task.id}')">
                        <div class="flex justify-between items-start"><h3 class="font-bold text-lg leading-tight ${isDone ? 'line-through text-dynamic-muted' : 'text-dynamic-main'}">${task.subject}</h3><span class="text-[10px] font-bold bg-black/5 px-2 py-1 rounded-lg text-pink-400 border border-dynamic">${task.category} (+${pts})</span></div>
                        <p class="text-sm text-dynamic-muted mt-1 line-clamp-1">${task.notes || 'No details'}</p>
                        <div class="mt-3 flex gap-3 text-xs font-bold text-dynamic-muted"><span class="flex items-center gap-1 ${isDone ? '' : 'text-yellow-500'}"><i class="ph-bold ph-calendar"></i> ${new Date(task.dueDate).toLocaleDateString()}</span></div>
                    </div>
                </div>`;
        }
        list.appendChild(card);
    });
}

// --- RENDER HELPERS ---
function renderSubjectsList() { 
    document.getElementById('subjects-list').innerHTML = subjects.map((s, i) => `
        <div class="flex justify-between items-center bg-black/5 p-3 rounded-xl border border-dynamic group mb-2">
            <input type="text" value="${s}" onchange="updateSubject(${i}, this.value)" class="bg-transparent text-sm font-medium text-zinc-900 focus:outline-none w-full border-b border-transparent focus:border-pink-300 transition-colors">
            <button onclick="removeSubject(${i})" class="text-zinc-600 hover:text-red-400 transition-colors"><i class="ph-bold ph-trash"></i></button>
        </div>`).join(''); 
}
window.updateSubject = function(idx, val) { if(val.trim()) { subjects[idx] = val.trim(); syncSettings(); } }
window.addSubject = function() { const input = document.getElementById('new-subject-input'); if (input.value.trim()) { subjects.push(input.value.trim()); input.value = ''; syncSettings(); renderSubjectsList(); } }
window.removeSubject = function(idx) { subjects.splice(idx, 1); syncSettings(); renderSubjectsList(); }

function renderCategoriesList() { 
    document.getElementById('categories-list').innerHTML = categories.map((c, i) => `
        <div class="flex items-center gap-2 bg-black/5 p-3 rounded-xl border border-dynamic mb-2">
            <input type="text" value="${c.name}" onchange="updateCatName(${i}, this.value)" class="flex-[2] bg-transparent text-sm font-bold text-zinc-900 focus:outline-none border-b border-transparent focus:border-pink-300 min-w-0">
            <input type="number" value="${c.points}" onchange="updateCatPoints(${i}, this.value)" class="flex-1 w-16 bg-transparent text-xs text-yellow-600 font-bold text-right focus:outline-none border-b border-transparent focus:border-yellow-300">
            <span class="text-[10px] text-zinc-500 mr-2">XP</span>
            <button onclick="removeCategory(${i})" class="text-zinc-600 hover:text-red-400 shrink-0"><i class="ph-bold ph-trash"></i></button>
        </div>`).join(''); 
}
window.updateCatName = function(idx, val) { if(val.trim()) { categories[idx].name = val.trim(); syncSettings(); } }
window.updateCatPoints = function(idx, val) { if(val) { categories[idx].points = parseInt(val); syncSettings(); } }
window.addCategory = function() { const nameIn = document.getElementById('new-cat-name'); const ptsIn = document.getElementById('new-cat-points'); if (nameIn.value && ptsIn.value) { categories.push({ name: nameIn.value.trim(), points: parseInt(ptsIn.value) }); nameIn.value = ''; syncSettings(); renderCategoriesList(); } }
window.removeCategory = function(idx) { categories.splice(idx, 1); syncSettings(); renderCategoriesList(); }

function autoCleanup() { /* Placeholder */ }
function calculateLevel() {
    let l = 1;
    while (xp >= Math.floor(100 * Math.pow(l, 1.5))) {
        l++;
    }
    if(l > level) { 
        level = l; 
        document.getElementById('levelup-level-display').innerText = level;
        const r = levelRewards[level] || "Mystery Reward";
        document.getElementById('levelup-reward-name').innerText = r;
        document.getElementById('levelup-modal').classList.remove('hidden');
    }
    level = l;
    renderHeader();
}
