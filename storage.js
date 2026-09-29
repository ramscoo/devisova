// Step 8.3 — Storage adapter unique : localStorage (anonyme) <-> Supabase (Free/Pro).
//
// Objectif : le reste de l'application (script.js) n'a JAMAIS besoin de
// savoir si les donnees viennent de localStorage ou de Supabase. Il lit
// et ecrit via un cache en memoire, synchrone (loadAllSaved()/loadClients()/
// loadProfile() gardent exactement la meme signature qu'avant). Ce fichier
// est le SEUL endroit qui parle a Supabase pour les donnees metier.
//
// Routage : ANONYMOUS -> localStorage. AUTHENTICATED (Free ou Pro) -> Supabase.
// Aucune ecriture de "subscriptions" cote client : lecture seule (RLS Step 8.1).

let _documentsCache = [];
let _clientsCache = [];
let _profileCache = null;
let _currentSession = null;
let _currentSubscription = null;
let _bootstrapped = false;
let _resolveReady;
const _readyPromise = new Promise((resolve) => { _resolveReady = resolve; });

function isAuthenticatedMode() {
  return !!(_currentSession && _currentSession.user);
}

// ===================================================================
// Mapping camelCase (JS) <-> snake_case (SQL), fidele au schema Step 8.1.
// ===================================================================
function docToSql(d, userId) {
  return {
    id: d.id,
    user_id: userId,
    type: d.type,
    numero: d.numero,
    date: d.date,
    ent_name: d.entName || null,
    ent_siret: d.entSiret || null,
    ent_adresse: d.entAdresse || null,
    ent_tel: d.entTel || null,
    ent_email: d.entEmail || null,
    cli_name: d.cliName || null,
    cli_adresse: d.cliAdresse || null,
    tva: parseFloat(d.tva) || 0,
    devise: d.devise || 'EUR',
    template: d.template || 'classic',
    lignes: d.lignes || [],
    logo_data: d.logoData || null,
  };
}

function docFromSql(row) {
  return {
    id: row.id,
    type: row.type,
    numero: row.numero,
    date: row.date,
    entName: row.ent_name || '',
    entSiret: row.ent_siret || '',
    entAdresse: row.ent_adresse || '',
    entTel: row.ent_tel || '',
    entEmail: row.ent_email || '',
    cliName: row.cli_name || '',
    cliAdresse: row.cli_adresse || '',
    tva: String(row.tva),
    devise: row.devise,
    template: row.template,
    lignes: row.lignes || [],
    logoData: row.logo_data || null,
  };
}

function clientToSql(c, userId) {
  return { id: c.id, user_id: userId, nom: c.nom, adresse: c.adresse || null };
}

function clientFromSql(row) {
  return { id: row.id, nom: row.nom, adresse: row.adresse || '' };
}

function profileToSql(p, userId) {
  return {
    id: userId,
    ent_name: p.entName || null,
    ent_siret: p.entSiret || null,
    ent_adresse: p.entAdresse || null,
    ent_tel: p.entTel || null,
    ent_email: p.entEmail || null,
    logo_data: p.logoData || null,
  };
}

function profileFromSql(row) {
  if (!row) return null;
  return {
    entName: row.ent_name || '',
    entSiret: row.ent_siret || '',
    entAdresse: row.ent_adresse || '',
    entTel: row.ent_tel || '',
    entEmail: row.ent_email || '',
    logoData: row.logo_data || null,
  };
}

// ===================================================================
// Backend localStorage (identique au comportement pre-Step-8.3)
// ===================================================================
function localLoadDocuments() { return JSON.parse(localStorage.getItem('devisio_documents') || '[]'); }
function localSaveDocuments(arr) { localStorage.setItem('devisio_documents', JSON.stringify(arr)); }
function localLoadClients() { return JSON.parse(localStorage.getItem('devisio_clients') || '[]'); }
function localSaveClients(arr) { localStorage.setItem('devisio_clients', JSON.stringify(arr)); }
function localLoadProfile() { return JSON.parse(localStorage.getItem('devisio_profile') || 'null'); }
function localSaveProfile(p) { localStorage.setItem('devisio_profile', JSON.stringify(p)); }

// ===================================================================
// Backend Supabase (async)
// ===================================================================
async function cloudFetchDocuments() {
  const { data, error } = await supabaseClient.from('documents').select('*').order('created_at', { ascending: true });
  if (error) { console.error('[storage] cloudFetchDocuments', error); return []; }
  return (data || []).map(docFromSql);
}
async function cloudFetchDocumentById(id) {
  const { data } = await supabaseClient.from('documents').select('*').eq('id', id).maybeSingle();
  return data ? docFromSql(data) : null;
}
async function cloudUpsertDocument(d) {
  return supabaseClient.from('documents').upsert(docToSql(d, _currentSession.user.id)).select();
}
async function cloudDeleteDocument(id) {
  return supabaseClient.from('documents').delete().eq('id', id);
}

async function cloudFetchClients() {
  const { data, error } = await supabaseClient.from('clients').select('*').order('created_at', { ascending: true });
  if (error) { console.error('[storage] cloudFetchClients', error); return []; }
  return (data || []).map(clientFromSql);
}
async function cloudFetchClientById(id) {
  const { data } = await supabaseClient.from('clients').select('*').eq('id', id).maybeSingle();
  return data ? clientFromSql(data) : null;
}
async function cloudUpsertClient(c) {
  return supabaseClient.from('clients').upsert(clientToSql(c, _currentSession.user.id)).select();
}
async function cloudDeleteClient(id) {
  return supabaseClient.from('clients').delete().eq('id', id);
}

async function cloudFetchProfile() {
  const { data } = await supabaseClient.from('profiles').select('*').eq('id', _currentSession.user.id).maybeSingle();
  return profileFromSql(data);
}
async function cloudUpsertProfile(p) {
  return supabaseClient.from('profiles').upsert(profileToSql(p, _currentSession.user.id));
}

async function cloudFetchSubscription() {
  const { data } = await supabaseClient.from('subscriptions').select('*').eq('user_id', _currentSession.user.id).maybeSingle();
  return data;
}

// ===================================================================
// Diff-based persist (le reste de l'app passe un tableau COMPLET a
// saveAllSaved()/saveClients() ; on ne recree/ecrit en cloud que ce qui a
// reellement change, et on supprime cote cloud ce qui a disparu du tableau).
// ===================================================================
async function persistDocumentsDiff(newArr, oldArr) {
  const oldById = new Map(oldArr.map((d) => [d.id, d]));
  const newIds = new Set(newArr.map((d) => d.id));
  const toUpsert = newArr.filter((d) => {
    const prev = oldById.get(d.id);
    return !prev || JSON.stringify(prev) !== JSON.stringify(d);
  });
  const toDelete = oldArr.filter((d) => !newIds.has(d.id));
  for (const d of toUpsert) {
    const { error } = await cloudUpsertDocument(d);
    if (error) { console.error('[storage] echec sauvegarde document', d.id, error); if (window.showToast) window.showToast('Erreur de sauvegarde cloud, réessaie.'); }
  }
  for (const d of toDelete) {
    const { error } = await cloudDeleteDocument(d.id);
    if (error) console.error('[storage] echec suppression document', d.id, error);
  }
}

async function persistClientsDiff(newArr, oldArr) {
  const oldById = new Map(oldArr.map((c) => [c.id, c]));
  const newIds = new Set(newArr.map((c) => c.id));
  const toUpsert = newArr.filter((c) => {
    const prev = oldById.get(c.id);
    return !prev || JSON.stringify(prev) !== JSON.stringify(c);
  });
  const toDelete = oldArr.filter((c) => !newIds.has(c.id));
  for (const c of toUpsert) {
    const { error } = await cloudUpsertClient(c);
    if (error) { console.error('[storage] echec sauvegarde client', c.id, error); if (window.showToast) window.showToast('Erreur de sauvegarde cloud, réessaie.'); }
  }
  for (const c of toDelete) {
    const { error } = await cloudDeleteClient(c.id);
    if (error) console.error('[storage] echec suppression client', c.id, error);
  }
}

// Le profil est ecrit a chaque frappe des champs entreprise (comportement
// deja existant de script.js, cf. maybeSaveProfile()). Pour ne pas envoyer
// une requete reseau a chaque caractere, on debounce uniquement l'ecriture
// CLOUD (le cache local et localStorage restent instantanes).
let _profileSaveTimer = null;
function persistProfileDebounced(p) {
  clearTimeout(_profileSaveTimer);
  _profileSaveTimer = setTimeout(async () => {
    const { error } = await cloudUpsertProfile(p);
    if (error) { console.error('[storage] echec sauvegarde profil', error); if (window.showToast) window.showToast('Erreur de sauvegarde du profil, réessaie.'); }
  }, 800);
}

// Comparaison volontairement limitee aux champs metier : un document local
// (JS, date ISO "...Z") et sa version rechargee depuis Supabase (round-trip
// via docFromSql, timestamptz Postgres "...+00:00") ne sont JAMAIS egaux en
// JSON.stringify brut meme quand leur contenu est identique — comparer les
// dates telles quelles produirait des faux conflits systematiques.
function docsEquivalent(a, b) {
  return a.numero === b.numero
    && (a.cliName || '') === (b.cliName || '')
    && (a.entName || '') === (b.entName || '')
    && String(a.tva) === String(b.tva)
    && a.devise === b.devise
    && a.template === b.template
    && JSON.stringify(a.lignes || []) === JSON.stringify(b.lignes || []);
}

function clientsEquivalent(a, b) {
  return (a.nom || '') === (b.nom || '') && (a.adresse || '') === (b.adresse || '');
}

// ===================================================================
// Migration localStorage -> Supabase (une seule fois par utilisateur,
// idempotente meme en cas d'appel concurrent, jamais destructive du local).
// ===================================================================
let _migrationInFlight = null;
async function runMigrationIfNeeded() {
  if (_migrationInFlight) { await _migrationInFlight; return; }
  _migrationInFlight = runMigration();
  try {
    await _migrationInFlight;
  } finally {
    _migrationInFlight = null;
  }
}

async function runMigration() {
  const userId = _currentSession.user.id;
  const migratedKey = 'devisio_migrated_' + userId;
  if (localStorage.getItem(migratedKey)) return;

  const localDocs = localLoadDocuments();
  const localClients = localLoadClients();
  const localProfile = localLoadProfile();

  if (!localDocs.length && !localClients.length && !localProfile) {
    localStorage.setItem(migratedKey, '1');
    return;
  }

  if (window.showToast) {
    window.showToast("Tes données locales vont être enregistrées dans ton compte pour les retrouver sur tous tes appareils.");
  }

  const cloudDocs = await cloudFetchDocuments();
  const cloudClients = await cloudFetchClients();
  const cloudDocsById = new Map(cloudDocs.map((d) => [d.id, d]));
  const cloudClientsById = new Map(cloudClients.map((c) => [c.id, c]));

  let allOk = true;

  for (const doc of localDocs) {
    let toInsert = doc;
    const existing = cloudDocsById.get(doc.id);
    if (existing) {
      if (docsEquivalent(existing, doc)) continue; // deja migre a l'identique (idempotence)
      toInsert = Object.assign({}, doc, { id: crypto.randomUUID() });
      console.warn('[migration] conflit document id=' + doc.id + ' (contenu different) -> nouvel id ' + toInsert.id);
    }
    const { error } = await cloudUpsertDocument(toInsert);
    if (error) { allOk = false; console.error('[migration] echec insertion document', doc.id, error); continue; }
    const verified = await cloudFetchDocumentById(toInsert.id);
    if (!verified) { allOk = false; console.error('[migration] verification echouee pour document', toInsert.id); }
  }

  for (const cli of localClients) {
    let toInsert = cli;
    const existing = cloudClientsById.get(cli.id);
    if (existing) {
      if (clientsEquivalent(existing, cli)) continue;
      toInsert = Object.assign({}, cli, { id: crypto.randomUUID() });
      console.warn('[migration] conflit client id=' + cli.id + ' (contenu different) -> nouvel id ' + toInsert.id);
    }
    const { error } = await cloudUpsertClient(toInsert);
    if (error) { allOk = false; console.error('[migration] echec insertion client', cli.id, error); continue; }
    const verified = await cloudFetchClientById(toInsert.id);
    if (!verified) { allOk = false; console.error('[migration] verification echouee pour client', toInsert.id); }
  }

  if (localProfile) {
    const cloudProfile = await cloudFetchProfile();
    const cloudHasData = cloudProfile && (cloudProfile.entName || cloudProfile.entSiret || cloudProfile.entAdresse || cloudProfile.entTel || cloudProfile.entEmail || cloudProfile.logoData);
    if (!cloudHasData) {
      const { error } = await cloudUpsertProfile(localProfile);
      if (error) { allOk = false; console.error('[migration] echec insertion profil', error); }
    }
  }

  if (allOk) {
    localStorage.setItem(migratedKey, '1');
    // Le localStorage n'est JAMAIS supprime : il reste un filet de securite.
  } else if (window.showToast) {
    window.showToast("La sauvegarde cloud a rencontré un problème, tes données restent en sécurité en local. Réessaie plus tard.");
  }
}

// ===================================================================
// Chargement des caches selon le mode
// ===================================================================
function loadLocalCaches() {
  _documentsCache = localLoadDocuments();
  _clientsCache = localLoadClients();
  _profileCache = localLoadProfile();
}

async function loadCloudCaches() {
  const [docs, clients, profile] = await Promise.all([
    cloudFetchDocuments(),
    cloudFetchClients(),
    cloudFetchProfile(),
  ]);
  _documentsCache = docs;
  _clientsCache = clients;
  _profileCache = profile;
}

async function loadSubscription() {
  _currentSubscription = await cloudFetchSubscription();
}

// ===================================================================
// Reaction aux changements de session (login/logout), y compris le tout
// premier appel via bootstrap(). Un seul chemin de code pour eviter toute
// divergence entre "chargement initial" et "changement en cours de session".
// ===================================================================
async function applySession(session, { isInitial = false } = {}) {
  const wasAuthenticated = isAuthenticatedMode();
  _currentSession = session;
  const nowAuthenticated = isAuthenticatedMode();

  if (nowAuthenticated) {
    if (isInitial) {
      await loadCloudCaches();
    } else if (!wasAuthenticated) {
      await runMigrationIfNeeded();
      await loadCloudCaches();
    }
    await loadSubscription();
  } else {
    loadLocalCaches();
    _currentSubscription = null;
  }

  if (!isInitial && _bootstrapped) {
    if (window.refreshDocumentsUI) window.refreshDocumentsUI();
    if (window.refreshClientPicker) window.refreshClientPicker();
    if (window.applyProfile && window.loadProfile) window.applyProfile(window.loadProfile());
    if (window.renderForm) window.renderForm();
    if (window.renderPreview) window.renderPreview();
    if (window.markSnapshotClean) window.markSnapshotClean();
  }
}

async function bootstrap() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  await applySession(session, { isInitial: true });
  _bootstrapped = true;
  _resolveReady();
}

supabaseClient.auth.onAuthStateChange((_event, session) => {
  if (!_bootstrapped) return; // le tout premier etat est deja traite par bootstrap()
  // Supabase declenche onAuthStateChange pour bien plus que login/logout —
  // notamment TOKEN_REFRESHED, silencieux et periodique, avec la MEME
  // identite. Ne recharger le cache cloud et ne re-rendre l'UI que si
  // l'utilisateur authentifie a reellement change (connexion/deconnexion/
  // changement de compte), jamais pour un simple renouvellement de jeton —
  // sinon un rechargement complet peut survenir en plein milieu d'une
  // interaction utilisateur (ex: une selection de document dans la liste).
  const newUserId = session && session.user ? session.user.id : null;
  const prevUserId = _currentSession && _currentSession.user ? _currentSession.user.id : null;
  if (newUserId === prevUserId) {
    _currentSession = session; // garder le token a jour sans rien recharger
    return;
  }
  applySession(session);
});

bootstrap();

// ===================================================================
// Plan / feature gating
// ===================================================================
const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'];

function getCurrentPlan() {
  if (!isAuthenticatedMode()) return 'anonymous';
  if (!_currentSubscription) return 'free';
  const { plan, status } = _currentSubscription;
  if ((plan === 'pro_monthly' || plan === 'pro_annual') && ACTIVE_SUBSCRIPTION_STATUSES.includes(status)) {
    return plan;
  }
  return 'free';
}

function isPro() {
  const plan = getCurrentPlan();
  return plan === 'pro_monthly' || plan === 'pro_annual';
}

const PRO_ONLY_FEATURES = ['duplicate', 'convert', 'nonClassicTemplate', 'advancedCustomization'];
function canUseFeature(feature) {
  if (PRO_ONLY_FEATURES.includes(feature)) return isPro();
  return true;
}

function countDocumentsThisMonth() {
  const now = new Date();
  const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  return _documentsCache.filter((d) => {
    if (!d.date) return false;
    const dt = new Date(d.date);
    if (Number.isNaN(dt.getTime())) return false;
    const dym = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
    return dym === ym;
  }).length;
}

function canCreateDocument() {
  return isPro() || countDocumentsThisMonth() < 3;
}

// ===================================================================
// API publique (signatures SYNCHRONES : le cache est deja en memoire
// une fois DevisioStorage.ready resolu).
// ===================================================================
// getDocuments()/getClients() renvoient une COPIE du tableau (pas la
// reference interne) : le reste de l'app mute librement ce qu'il recoit
// (all.push(...), all[idx] = state...), un pattern deja utilise partout
// dans script.js. Si on renvoyait _documentsCache tel quel, ces mutations
// modifieraient le cache AVANT meme l'appel a setDocuments(), et le diff
// old/new a l'interieur de persistDocumentsDiff comparerait le tableau
// avec lui-meme (plus aucun changement detecte, rien n'est jamais
// synchronise vers Supabase).
function getDocuments() { return _documentsCache.slice(); }
function setDocuments(newArr) {
  const oldArr = _documentsCache;
  _documentsCache = newArr;
  if (isAuthenticatedMode()) {
    persistDocumentsDiff(newArr, oldArr).catch((e) => console.error('[storage] persistDocumentsDiff', e));
  } else {
    localSaveDocuments(newArr);
  }
}

function getClients() { return _clientsCache.slice(); }
function setClients(newArr) {
  const oldArr = _clientsCache;
  _clientsCache = newArr;
  if (isAuthenticatedMode()) {
    persistClientsDiff(newArr, oldArr).catch((e) => console.error('[storage] persistClientsDiff', e));
  } else {
    localSaveClients(newArr);
  }
}

function getProfile() { return _profileCache; }
function setProfile(p) {
  _profileCache = p;
  if (isAuthenticatedMode()) {
    persistProfileDebounced(p);
  } else {
    localSaveProfile(p);
  }
}

window.DevisioStorage = {
  ready: _readyPromise,
  getDocuments,
  setDocuments,
  getClients,
  setClients,
  getProfile,
  setProfile,
  getCurrentPlan,
  isPro,
  canUseFeature,
  countDocumentsThisMonth,
  canCreateDocument,
};
