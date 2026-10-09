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
  document.getElementById('resetError').hidden = true;
  document.getElementById('resetInfo').hidden = true;
  document.getElementById('recoveryError').hidden = true;
  document.getElementById('recoveryInfo').hidden = true;
}

// view : 'loggedOut' | 'loggedIn' | 'resetRequest' | 'recovery'
function showAccountView(view) {
  document.getElementById('authLoggedOut').hidden = view !== 'loggedOut';
  document.getElementById('authLoggedIn').hidden = view !== 'loggedIn';
  document.getElementById('authResetRequest').hidden = view !== 'resetRequest';
  document.getElementById('authRecovery').hidden = view !== 'recovery';
}

// Tant qu'un lien de reinitialisation vient d'etre ouvert (evenement Supabase
// PASSWORD_RECOVERY, voir onAuthStateChange plus bas), la session active
// etablie par ce lien ne doit jamais faire basculer l'UI sur l'ecran "connecte"
// normal avant que l'utilisateur ait choisi son nouveau mot de passe.
let _recoveryMode = false;

function refreshAuthUI(session) {
  if (_recoveryMode) return;
  const accountBtn = document.getElementById('accountBtn');
  const accountBtnLabel = document.getElementById('accountBtnLabel');
  if (session && session.user) {
    showAccountView('loggedIn');
    document.getElementById('authEmailDisplay').textContent = session.user.email;
    accountBtnLabel.textContent = 'Connecté';
    accountBtn.setAttribute('aria-label', 'Connecté — mon compte');
  } else {
    showAccountView('loggedOut');
    accountBtnLabel.textContent = 'Compte';
    accountBtn.setAttribute('aria-label', 'Compte');
  }
}

supabaseClient.auth.onAuthStateChange((event, session) => {
  // Declenche quand l'utilisateur arrive via le lien recu par email (Supabase
  // etablit une session temporaire dediee a cette seule action). On ouvre
  // directement l'ecran de choix du nouveau mot de passe, sans jamais passer
  // par l'ecran "connecte" normal.
  if (event === 'PASSWORD_RECOVERY') {
    _recoveryMode = true;
    clearAuthMessages();
    document.getElementById('accountDialog').showModal();
    showAccountView('recovery');
    return;
  }
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
  // Referme un ecran "mot de passe oublie" laisse en cours sans l'envoyer :
  // une reouverture repart du formulaire de connexion normal. Ne touche
  // jamais a l'ecran de recuperation (_recoveryMode), lie a une vraie session.
  if (!_recoveryMode && !document.getElementById('authResetRequest').hidden) {
    clearAuthMessages();
    showAccountView('loggedOut');
  }
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

document.getElementById('forgotPasswordBtn').addEventListener('click', () => {
  clearAuthMessages();
  document.getElementById('resetEmail').value = document.getElementById('authEmail').value;
  showAccountView('resetRequest');
});

document.getElementById('resetBackBtn').addEventListener('click', () => {
  clearAuthMessages();
  showAccountView('loggedOut');
});

document.getElementById('resetRequestForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAuthMessages();
  const email = document.getElementById('resetEmail').value.trim();
  const btn = document.getElementById('resetSendBtn');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Envoi…';
  try {
    // redirectTo doit correspondre a une URL autorisee dans Supabase (Authentication
    // > URL Configuration > Redirect URLs) — voir note de configuration transmise
    // a part, non modifiee ici cote code.
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/app.html`,
    });
    if (error) {
      // mapAuthError ne distingue jamais "email inconnu" (Supabase ne renvoie pas
      // cette information pour cette methode, precisement pour ne pas reveler si
      // une adresse est enregistree) : seules de vraies erreurs techniques
      // (limite de frequence, email invalide...) remontent ici.
      document.getElementById('resetError').textContent = mapAuthError(error);
      document.getElementById('resetError').hidden = false;
      return;
    }
    document.getElementById('resetInfo').textContent = 'Si un compte existe avec cette adresse, un email de réinitialisation a été envoyé.';
    document.getElementById('resetInfo').hidden = false;
  } catch (err) {
    // Exception inattendue (reseau coupe, etc.), distincte d'une erreur API
    // normale (deja geree ci-dessus via { error }) — message generique.
    document.getElementById('resetError').textContent = mapAuthError(err);
    document.getElementById('resetError').hidden = false;
  } finally {
    // Toujours reactiver le bouton, succes, erreur API ou exception confondus.
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});

document.getElementById('recoveryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAuthMessages();
  const pw1 = document.getElementById('recoveryPassword').value;
  const pw2 = document.getElementById('recoveryPasswordConfirm').value;
  const errEl = document.getElementById('recoveryError');
  if (pw1 !== pw2) {
    errEl.textContent = 'Les deux mots de passe ne correspondent pas.';
    errEl.hidden = false;
    return;
  }
  const btn = document.getElementById('recoverySubmitBtn');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Mise à jour…';
  try {
    const { error } = await supabaseClient.auth.updateUser({ password: pw1 });
    if (error) {
      errEl.textContent = mapAuthError(error);
      errEl.hidden = false;
      return;
    }
    _recoveryMode = false;
    document.getElementById('recoveryForm').reset();
    const { data: { session } } = await supabaseClient.auth.getSession();
    refreshAuthUI(session);
    if (window.showToast) {
      window.showToast('Mot de passe mis à jour.');
    } else {
      document.getElementById('recoveryInfo').textContent = 'Mot de passe mis à jour.';
      document.getElementById('recoveryInfo').hidden = false;
    }
  } catch (err) {
    // Exception inattendue, distincte d'une erreur API normale (deja geree
    // ci-dessus via { error }) — message generique, _recoveryMode reste actif
    // pour que l'utilisateur puisse reessayer sans perdre l'ecran.
    errEl.textContent = mapAuthError(err);
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
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
