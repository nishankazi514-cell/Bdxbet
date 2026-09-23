// Ludo King Game Logic
window.addEventListener('DOMContentLoaded', () => {
    console.log("Ludo Game Loaded Successfully");

    // Splash Screen Hide after 2 Seconds
    setTimeout(() => {
        const splash = document.getElementById('splash');
        if (splash) splash.classList.add('hidden');

        const modeScreen = document.getElementById('mode-screen');
        if (modeScreen) modeScreen.classList.remove('hidden');
    }, 2000);
});

function openProfile() {
    const profileOverlay = document.getElementById('profile-overlay');
    if (profileOverlay) profileOverlay.style.display = 'flex';
}

function closeProfile() {
    const profileOverlay = document.getElementById('profile-overlay');
    if (profileOverlay) profileOverlay.style.display = 'none';
}

function goHome() {
    window.location.href = '/';
}

function openSettings() {
    const settingsOverlay = document.getElementById('settings-overlay');
    if (settingsOverlay) settingsOverlay.style.display = 'flex';
}

function closeSettings() {
    const settingsOverlay = document.getElementById('settings-overlay');
    if (settingsOverlay) settingsOverlay.style.display = 'none';
}

function selectMatchType(type) {
    document.getElementById('mode-screen').classList.add('hidden');
    console.log("Match type selected:", type);
}

function rollDice() {
    const diceVal = Math.floor(Math.random() * 6) + 1;
    alert("ডাইসে উঠেছে: " + diceVal);
}
