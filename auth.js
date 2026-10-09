// Step 8.2 — Authentification Supabase (compte, connexion, deconnexion, session).
//
// IMPORTANT : ce fichier ne touche a AUCUNE donnee metier. Les devis,
// clients, profil entreprise restent geres exclusivement par script.js
// via localStorage, que l'utilisateur soit connecte ou non. Ce fichier
// ne lit/n'ecrit que dans les tables auth de Supabase (via le SDK),
// jamais dans documents/clients/profiles.

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Messages d'erreur mappes sur les codes/messages reels renvoyes par ce
// projet Supabase (verifies par appels directs a l'API avant d'ecrire
// ce mapping, pas invente).
function mapAuthError(err) {
  const code = err && err.code;
  const msg = (err && err.message) || '';
  if (code === 'validation_failed' || /invalid format/i.test(msg)) {
    return "Adresse email invalide.";
  }
  if (code === 'weak_password' || /at least 6 characters/i.test(msg)) {
    return "Le mot de passe doit contenir au moins 6 caractères.";
  }
  if (code === 'over_email_send_rate_limit' || /security purposes/i.test(msg)) {
    return "Trop de tentatives. Réessaie dans une minute.";
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) {
    return "Email ou mot de passe incorrect.";
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) {
    return "Confirme d'abord ton adresse email (vérifie ta boîte de réception) avant de te connecter.";
  }
  if (code === 'user_already_exists' || /already registered/i.test(msg)) {
    return "Un compte existe déjà avec cet email. Connecte-toi plutôt.";
  }
  return "Une erreur est survenue. Réessaie dans un instant.";
}

function showAuthError(message) {
  const el = document.getElementById('authError');
  const info = document.getElementById('authInfo');
  info.hidden = true;
  el.textContent = message;
  el.hidden = false;
}

function showAuthInfo(message) {
  const el = document.getElementById('authInfo');
  const error = document.getElementById('authError');
  error.hidden = true;
  el.textContent = message;
  el.hidden = false;
}

function clearAuthMessages() {
  document.getElementById('authError').hidden = true;
  document.getElementById('authInfo').hidden = true;
}

function refreshAuthUI(session) {
  const loggedOut = document.getElementById('authLoggedOut');
  const loggedIn = document.getElementById('authLoggedIn');
  const accountBtn = document.getElementById('accountBtn');
  const accountBtnLabel = document.getElementById('accountBtnLabel');
  if (session && session.user) {
    loggedOut.hidden = true;
    loggedIn.hidden = false;
    document.getElementById('authEmailDisplay').textContent = session.user.email;
    accountBtnLabel.textContent = 'Connecté';
    accountBtn.setAttribute('aria-label', 'Connecté — mon compte');
  } else {
    loggedOut.hidden = false;
    loggedIn.hidden = true;
    accountBtnLabel.textContent = 'Compte';
    accountBtn.setAttribute('aria-label', 'Compte');
  }
}

supabaseClient.auth.onAuthStateChange((_event, session) => {
  refreshAuthUI(session);
});

supabaseClient.auth.getSession().then(({ data: { session } }) => {
  refreshAuthUI(session);
});

document.getElementById('accountBtn').addEventListener('click', () => {
  clearAuthMessages();
  document.getElementById('accountDialog').showModal();
});

document.getElementById('accountCloseBtn').addEventListener('click', () => {
  document.getElementById('accountDialog').close();
});

document.getElementById('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAuthMessages();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    showAuthError(mapAuthError(error));
    return;
  }
  if (data.session) {
    document.getElementById('accountDialog').close();
    document.getElementById('authForm').reset();
  }
});

document.getElementById('authSignupBtn').addEventListener('click', async () => {
  clearAuthMessages();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) {
    showAuthError(mapAuthError(error));
    return;
  }
  if (data.session) {
    document.getElementById('accountDialog').close();
    document.getElementById('authForm').reset();
  } else {
    showAuthInfo("Compte créé ! Vérifie tes emails pour confirmer ton adresse avant de te connecter.");
  }
});

document.getElementById('authLogoutBtn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
});

// Ouverture directe du formulaire de compte via ?auth=open (liens "Se connecter"/
// "Créer un compte" depuis la landing page) : un seul appel, execute une fois au
// chargement du script, independant du clic normal sur #accountBtn — jamais les
// deux ne se declenchent ensemble puisque celui-ci ne depend d'aucun evenement.
if (new URLSearchParams(window.location.search).get('auth') === 'open') {
  clearAuthMessages();
  document.getElementById('accountDialog').showModal();
  // Nettoie l'URL (sans recharger la page) pour qu'un retour arriere ou un
  // rafraichissement ne rouvre pas le modal de maniere inattendue.
  const url = new URL(window.location.href);
  url.searchParams.delete('auth');
  window.history.replaceState({}, '', url);
}
