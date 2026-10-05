let lignes = [
  { desc: '', qty: 1, prix: 0, _pristine: true }
];
let logoData = null;
let currentId = null;
let currentDocDate = null;
let lastSavedSnapshot = '';
let saveInFlight = false;
// Id reserve pour un NOUVEAU document tant qu'il n'est pas confirme comme
// enregistre : une nouvelle tentative apres un echec reutilise le meme id
// (upsert), donc jamais de doublon meme si le 1er envoi avait en fait abouti.
let pendingNewDocId = null;
// Incremente a chaque changement de document affiche (Nouveau, chargement) :
// une sauvegarde terminee apres coup ne doit pas "re-rattacher" le formulaire.
let formGeneration = 0;

// ===== Devises =====
// Structure ouverte : ajouter une devise = ajouter une entrée ici + une <option> dans app.html.
const CURRENCIES = {
  EUR: { locale: 'fr-FR' },
  USD: { locale: 'en-US' },
  XOF: { locale: 'fr-FR' },
  GBP: { locale: 'en-GB' },
};

function docCurrency() {
  const el = document.getElementById('devise');
  return (el && CURRENCIES[el.value]) ? el.value : 'EUR';
}

function fmt(n, currency) {
  const code = CURRENCIES[currency] ? currency : 'EUR';
  try {
    return new Intl.NumberFormat(CURRENCIES[code].locale, { style: 'currency', currency: code }).format(n || 0);
  } catch (e) {
    return (n || 0).toFixed(2) + ' ' + code;
  }
}

// Les champs qté/prix sont en type="text" inputmode="decimal" (pas type="number") :
// un <input type="number"> renvoie un .value VIDE des qu'il contient une virgule
// ("45,00" -> value === ""), silencieusement, sans erreur visible — exactement le
// bug observe (qté 1, prix affiché 45,00, total 0). Le clavier numerique mobile
// reste declenche via inputmode="decimal", mais le parsing gere les deux separateurs.
function parseLocaleNumber(str) {
  const n = parseFloat(String(str).trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// ===== Lignes de prestation =====
function renderForm() {
  const container = document.getElementById('lignes');
  container.innerHTML = '';
  lignes.forEach((l, i) => {
    const row = document.createElement('div');
    row.className = 'ligne-row';
    const totalLigne = (l.qty || 0) * (l.prix || 0);
    // Une ligne "vierge" (jamais touchée par l'utilisateur) affiche qté/prix vides avec
    // un exemple en placeholder, même si qty:1 et prix:0 restent les vraies valeurs du
    // state — dès que l'utilisateur saisit quelque chose sur cette ligne, l._pristine
    // disparaît et les champs affichent leurs vraies valeurs normalement.
    const isPristine = l._pristine === true;
    const qtyValue = isPristine ? '' : l.qty;
    const prixValue = isPristine ? '' : l.prix;
    row.innerHTML = `
      <div class="ligne-field ligne-field-desc">
        <span class="ligne-field-label">Description</span>
        <input type="text" value="${l.desc}" data-i="${i}" data-field="desc" placeholder="Ex. Pose de carrelage" aria-label="Description de la prestation">
      </div>
      <div class="ligne-field ligne-field-qty">
        <span class="ligne-field-label">Qté</span>
        <input type="text" inputmode="decimal" value="${qtyValue}" data-i="${i}" data-field="qty" placeholder="1" aria-label="Quantité">
      </div>
      <div class="ligne-field ligne-field-prix">
        <span class="ligne-field-label">Prix HT</span>
        <input type="text" inputmode="decimal" value="${prixValue}" data-i="${i}" data-field="prix" placeholder="0,00" aria-label="Prix unitaire HT">
      </div>
      <div class="ligne-field ligne-field-total">
        <span class="ligne-field-label">Total</span>
        <span class="ligne-total">${fmt(totalLigne, docCurrency())}</span>
      </div>
      <button type="button" class="remove-ligne" data-i="${i}" aria-label="Supprimer cette ligne">×</button>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const i = e.target.dataset.i;
      const field = e.target.dataset.field;
      lignes[i][field] = field === 'desc' ? e.target.value : parseLocaleNumber(e.target.value);
      delete lignes[i]._pristine;
      if (field === 'qty' || field === 'prix') {
        const totalEl = e.target.closest('.ligne-row').querySelector('.ligne-total');
        if (totalEl) totalEl.textContent = fmt((lignes[i].qty || 0) * (lignes[i].prix || 0), docCurrency());
      }
      renderPreview();
    });
  });

  container.querySelectorAll('.remove-ligne').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const i = e.target.dataset.i;
      lignes.splice(i, 1);
      renderForm();
      renderPreview();
    });
  });
}

// ===== Logo =====
// Le logo n'est jamais affiche a plus de 60x60px (.devis-logo) : une photo
// envoyee telle quelle (plusieurs Mo en base64) sature vite les ~5 Mo de
// quota localStorage (anonyme), car elle est dupliquee dans CHAQUE document
// sauvegarde. On la redimensionne donc cote client avant de la stocker —
// largement suffisant pour l'affichage et l'impression PDF.
const LOGO_MAX_DIMENSION = 240;

function applyLogo(dataUrl) {
  logoData = dataUrl;
  document.getElementById('logoLabel').textContent = "✓ Logo ajouté (cliquer pour changer)";
  maybeSaveProfile();
  renderPreview();
}

document.getElementById('logoInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const original = ev.target.result;
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > LOGO_MAX_DIMENSION || height > LOGO_MAX_DIMENSION) {
        const scale = LOGO_MAX_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      applyLogo(canvas.toDataURL('image/png'));
    };
    img.onerror = () => applyLogo(original); // decodage impossible : on garde l'original plutot que de bloquer
    img.src = original;
  };
  reader.readAsDataURL(file);
});

// ===== Aperçu =====
function docType() {
  return document.getElementById('typeFacture').checked ? 'facture' : 'devis';
}

const TEMPLATES = ['classic', 'modern', 'elegant', 'minimal'];

function docTemplate() {
  const checked = document.querySelector('input[name="template"]:checked');
  const raw = (checked && TEMPLATES.includes(checked.value)) ? checked.value : 'classic';
  // Free/anonyme : seul Classic est autorise, meme si un radio non-classic
  // est techniquement coche (ex. document charge avant un downgrade).
  return (raw === 'classic' || DevisovaStorage.isPro()) ? raw : 'classic';
}

function renderPreview() {
  const preview = document.getElementById('preview');
  TEMPLATES.forEach(t => preview.classList.remove(`template-${t}`));
  preview.classList.add(`template-${docTemplate()}`);

  document.getElementById('pEntName').textContent = document.getElementById('entName').value || "Nom de l'entreprise";
  document.getElementById('pEntAdresse').textContent = document.getElementById('entAdresse').value;
  const siret = document.getElementById('entSiret').value;
  document.getElementById('pEntSiret').textContent = siret ? `SIRET : ${siret}` : '';
  const tel = document.getElementById('entTel').value;
  const email = document.getElementById('entEmail').value;
  document.getElementById('pEntContact').textContent = [tel, email].filter(Boolean).join(' · ');

  const logoImg = document.getElementById('pLogo');
  if (logoData) {
    logoImg.src = logoData;
    logoImg.style.display = 'block';
  } else {
    // Un <img> sans src fait planter la décodification interne de html2canvas lors de la
    // génération du PDF (promesse rejetée non interceptée : "Uncaught (in promise) #<Event>").
    // Un pixel transparent 1x1 lui donne toujours une source valide à décoder, sans rien changer
    // visuellement puisque l'élément reste display:none.
    logoImg.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    logoImg.style.display = 'none';
  }

  document.getElementById('pCliName').textContent = document.getElementById('cliName').value || '—';
  document.getElementById('pCliAdresse').textContent = document.getElementById('cliAdresse').value;

  document.getElementById('pDocType').textContent = docType() === 'facture' ? 'FACTURE' : 'DEVIS';
  document.getElementById('pDate').textContent = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const currency = docCurrency();
  const tbody = document.getElementById('pLignes');
  tbody.innerHTML = '';
  let totalHT = 0;
  lignes.forEach(l => {
    const totalLigne = (l.qty || 0) * (l.prix || 0);
    totalHT += totalLigne;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${l.desc || '—'}</td><td>${l.qty || 0}</td><td>${fmt(l.prix || 0, currency)}</td><td>${fmt(totalLigne, currency)}</td>`;
    tbody.appendChild(tr);
  });

  const tvaTaux = parseFloat(document.getElementById('tva').value);
  const totalTVA = totalHT * (tvaTaux / 100);
  const totalTTC = totalHT + totalTVA;

  document.getElementById('pTvaTaux').textContent = tvaTaux;
  document.getElementById('pTotalHT').textContent = fmt(totalHT, currency);
  document.getElementById('pTotalTVA').textContent = fmt(totalTVA, currency);
  document.getElementById('pTotalTTC').textContent = fmt(totalTTC, currency);

  const mNumero = document.getElementById('mNumero');
  if (mNumero) mNumero.textContent = document.getElementById('pNumero').textContent;

  const footer = document.getElementById('pFooter');
  if (footer) footer.textContent = `${docType() === 'facture' ? 'Facture générée' : 'Devis généré'} avec Devisova`;

  updateConvertButtonVisibility();
  updateFreeGatingUI();
}

// ===== Conversion Devis -> Facture (fonctionnalite Pro) =====
// Le bouton n'apparaît que pour un devis déjà chargé/enregistré (currentId non nul)
// ET pour un compte Pro : convertir un brouillon jamais sauvegardé n'a pas de sens,
// et la conversion est hors du perimetre Free (matrice Step 8.3).
function updateConvertButtonVisibility() {
  const btn = document.getElementById('convertBtn');
  if (!btn) return;
  btn.style.display = (docType() === 'devis' && currentId !== null && DevisovaStorage.isPro()) ? '' : 'none';
}

// ===== Free gating (templates non-Classic, duplication) =====
// Les fonctionnalites restent dans le code : on les desactive simplement pour
// les comptes non-Pro, sans rien supprimer (matrice Step 8.3).
function updateFreeGatingUI() {
  const pro = DevisovaStorage.isPro();
  document.querySelectorAll('input[name="template"]').forEach(radio => {
    if (radio.value === 'classic') return;
    radio.disabled = !pro;
    const label = radio.closest('label');
    if (label) {
      label.classList.toggle('template-locked', !pro);
      label.title = pro ? '' : 'Fonctionnalité Pro';
    }
  });
  const dupBtn = document.getElementById('duplicateBtn');
  if (dupBtn) {
    dupBtn.disabled = !pro;
    dupBtn.title = pro ? '' : 'Fonctionnalité Pro — passe à Pro pour dupliquer un document.';
  }
}

// ===== Sauvegarde des documents (adapter Step 8.3 : localStorage ou Supabase) =====
function loadAllSaved() {
  return DevisovaStorage.getDocuments();
}

function saveAllSaved(arr) {
  DevisovaStorage.setDocuments(arr);
}

// ===== Profil "Mon entreprise" (adapter Step 8.3 : localStorage ou Supabase) =====
function loadProfile() {
  return DevisovaStorage.getProfile();
}

function saveProfile(profile) {
  DevisovaStorage.setProfile(profile);
}

function collectProfile() {
  return {
    entName: document.getElementById('entName').value,
    entSiret: document.getElementById('entSiret').value,
    entAdresse: document.getElementById('entAdresse').value,
    entTel: document.getElementById('entTel').value,
    entEmail: document.getElementById('entEmail').value,
    logoData: logoData,
  };
}

function applyProfile(profile) {
  if (!profile) return;
  document.getElementById('entName').value = profile.entName || '';
  document.getElementById('entSiret').value = profile.entSiret || '';
  document.getElementById('entAdresse').value = profile.entAdresse || '';
  document.getElementById('entTel').value = profile.entTel || '';
  document.getElementById('entEmail').value = profile.entEmail || '';
  logoData = profile.logoData || null;
  document.getElementById('logoLabel').textContent = logoData ? "✓ Logo ajouté (cliquer pour changer)" : "+ Ajouter mon logo (optionnel)";
}

// On ne mémorise le profil que lorsqu'on est sur un document neuf (jamais chargé depuis
// la liste des documents enregistrés) : modifier un ancien devis déjà enregistré ne doit
// jamais écraser silencieusement le profil permanent.
function maybeSaveProfile() {
  if (currentId !== null) return;
  saveProfile(collectProfile());
}

// ===== Clients enregistrés (adapter Step 8.3 : localStorage ou Supabase) =====
function loadClients() {
  return DevisovaStorage.getClients();
}

function saveClients(arr) {
  DevisovaStorage.setClients(arr);
}

function refreshClientPicker() {
  const select = document.getElementById('clientPicker');
  const current = select.value;
  const clients = loadClients();
  select.innerHTML = '<option value="">— Nouveau client —</option>';
  clients.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.nom;
    select.appendChild(opt);
  });
  select.value = clients.some(c => c.id === current) ? current : '';
}

document.getElementById('clientPicker').addEventListener('change', (e) => {
  if (!e.target.value) return;
  const client = loadClients().find(c => c.id === e.target.value);
  if (!client) return;
  // Injecte les infos du client dans le devis courant : le devis reste ensuite libre
  // d'être modifié sans jamais toucher à la fiche client enregistrée.
  document.getElementById('cliName').value = client.nom || '';
  document.getElementById('cliAdresse').value = client.adresse || '';
  renderPreview();
});

document.getElementById('saveClientBtn').addEventListener('click', () => {
  const nom = document.getElementById('cliName').value.trim();
  if (!nom) {
    showToast('Renseigne un nom de client avant de l\'enregistrer.');
    return;
  }
  const adresse = document.getElementById('cliAdresse').value;
  const clients = loadClients();
  clients.push({ id: crypto.randomUUID(), nom, adresse });
  saveClients(clients);
  refreshClientPicker();
  showToast(`✓ Client enregistré : ${nom}`);
});

// ===== Protection contre la perte de données non enregistrées =====
// collectState() génère un id ET une date aléatoires (crypto.randomUUID() /
// new Date()) tant que le document n'est pas encore enregistré (currentId
// === null) : on les exclut tous les deux de la comparaison, sinon deux
// appels consécutifs sans aucun changement réel seraient à tort vus comme
// "modifiés" (un document neuf jamais sauvegardé semblerait alors
// éternellement "non enregistré", même juste après un chargement de page).
function snapshotForComparison() {
  const state = collectState();
  state.id = 'snapshot';
  state.date = 'snapshot';
  return JSON.stringify(state);
}

function hasUnsavedChanges() {
  return snapshotForComparison() !== lastSavedSnapshot;
}

function markSnapshotClean() {
  lastSavedSnapshot = snapshotForComparison();
}

function confirmDiscard() {
  return !hasUnsavedChanges() || confirm('Des modifications non enregistrées seront perdues. Continuer ?');
}

function nextNumero(type) {
  const all = loadAllSaved();
  const year = new Date().getFullYear();
  const prefix = type === 'facture' ? 'FACT' : 'DEV';
  const countThisYear = all.filter(d => d.numero && d.numero.startsWith(`${prefix}-${year}`)).length;
  return `${prefix}-${year}-${String(countThisYear + 1).padStart(3, '0')}`;
}

// ===== Sélecteur "Mes documents" (dropdown custom, pas un <select> natif) =====
// Sur mobile, un <select> natif ouvre le picker systeme (overlay sombre, texte
// enorme, non stylable) : remplace par un bouton + une liste HTML normale,
// entierement habillee en CSS, avec le meme comportement (un seul document
// selectionnable a la fois, charge le bon document au clic, ferme ensuite).
let selectedDocId = '';

function docPickerOptionLabel(d) {
  return `${d.numero} · ${d.cliName || 'Sans client'}`;
}

function refreshDocPickerLabel() {
  const label = document.getElementById('docPickerLabel');
  if (!label) return;
  const doc = selectedDocId ? loadAllSaved().find(d => d.id === selectedDocId) : null;
  label.textContent = doc ? docPickerOptionLabel(doc) : 'Mes documents';
}

// Point d'entree unique pour marquer un document comme "actuellement charge"
// dans le picker : remplace les anciennes affectations a `savedList.value`.
function setSavedListValue(id) {
  selectedDocId = id || '';
  refreshDocPickerLabel();
  document.querySelectorAll('.doc-picker-option').forEach(opt => {
    const isSelected = opt.dataset.id === selectedDocId;
    opt.classList.toggle('selected', isSelected);
    if (isSelected) opt.setAttribute('aria-selected', 'true');
    else opt.removeAttribute('aria-selected');
  });
}

function closeDocPicker() {
  const trigger = document.getElementById('docPickerTrigger');
  const menu = document.getElementById('docPickerMenu');
  if (!trigger || !menu) return;
  menu.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
}

function openDocPicker() {
  const trigger = document.getElementById('docPickerTrigger');
  const menu = document.getElementById('docPickerMenu');
  if (!trigger || !menu) return;
  menu.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
}

function refreshSavedList() {
  const menu = document.getElementById('docPickerMenu');
  const all = loadAllSaved();
  menu.innerHTML = '';
  if (!all.length) {
    const empty = document.createElement('div');
    empty.className = 'doc-picker-empty';
    empty.textContent = 'Aucun document enregistré pour l\'instant.';
    menu.appendChild(empty);
  } else {
    all.forEach(d => {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'doc-picker-option';
      opt.setAttribute('role', 'option');
      opt.dataset.id = d.id;
      opt.textContent = docPickerOptionLabel(d);
      if (d.id === selectedDocId) {
        opt.classList.add('selected');
        opt.setAttribute('aria-selected', 'true');
      }
      menu.appendChild(opt);
    });
  }
  refreshDocPickerLabel();
}

// Point d'entrée unique à appeler chaque fois que la liste des documents change
// (sauvegarde, duplication...) pour garder la liste déroulante "Mes documents" synchronisée.
function refreshDocumentsUI() {
  refreshSavedList();
}

function collectState() {
  return {
    id: currentId || crypto.randomUUID(),
    type: docType(),
    numero: document.getElementById('pNumero').textContent || nextNumero(docType()),
    date: currentDocDate || new Date().toISOString(),
    entName: document.getElementById('entName').value,
    entSiret: document.getElementById('entSiret').value,
    entAdresse: document.getElementById('entAdresse').value,
    entTel: document.getElementById('entTel').value,
    entEmail: document.getElementById('entEmail').value,
    cliName: document.getElementById('cliName').value,
    cliAdresse: document.getElementById('cliAdresse').value,
    tva: document.getElementById('tva').value,
    devise: docCurrency(),
    template: docTemplate(),
    // Copie profonde : `lignes` est modifie en place a chaque frappe. Sans copie,
    // le document enregistre dans le cache du storage partage les MEMES objets que
    // le formulaire, et le diff cloud (persistDocumentsDiff) compare alors l'ancien
    // etat avec lui-meme : aucune modification de ligne n'est jamais envoyee a
    // Supabase apres la 1re sauvegarde.
    lignes: lignes.map(l => ({ ...l })),
    logoData: logoData,
  };
}

function applyState(d) {
  formGeneration++;
  pendingNewDocId = null;
  currentId = d.id;
  currentDocDate = d.date || new Date().toISOString();
  document.getElementById('typeDevis').checked = d.type !== 'facture';
  document.getElementById('typeFacture').checked = d.type === 'facture';
  document.getElementById('entName').value = d.entName || '';
  document.getElementById('entSiret').value = d.entSiret || '';
  document.getElementById('entAdresse').value = d.entAdresse || '';
  document.getElementById('entTel').value = d.entTel || '';
  document.getElementById('entEmail').value = d.entEmail || '';
  document.getElementById('cliName').value = d.cliName || '';
  document.getElementById('cliAdresse').value = d.cliAdresse || '';
  document.getElementById('clientPicker').value = '';
  document.getElementById('tva').value = d.tva || '20';
  document.getElementById('devise').value = (d.devise && CURRENCIES[d.devise]) ? d.devise : 'EUR';
  const tpl = (d.template && TEMPLATES.includes(d.template)) ? d.template : 'classic';
  document.querySelector(`input[name="template"][value="${tpl}"]`).checked = true;
  // Copie profonde (meme raison que dans collectState) : editer un document charge
  // ne doit pas modifier en douce sa version enregistree dans le cache.
  lignes = d.lignes && d.lignes.length ? d.lignes.map(l => ({ ...l })) : [{ desc: '', qty: 1, prix: 0, _pristine: true }];
  logoData = d.logoData || null;
  document.getElementById('logoLabel').textContent = logoData ? "✓ Logo ajouté (cliquer pour changer)" : "+ Ajouter mon logo (optionnel)";
  document.getElementById('pNumero').textContent = d.numero;
  renderForm();
  renderPreview();
}

// variant : '' (info), 'warning' (quota/attention) ou 'error'. Les messages
// importants restent affiches plus longtemps que la confirmation standard.
function showToast(message, { variant = '', duration = 2500 } = {}) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle('toast-warning', variant === 'warning');
  toast.classList.toggle('toast-error', variant === 'error');
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), duration);
}

// Le document affiche est-il deja enregistre ? (interne : creation vs mise a jour)
function isEditingSavedDocument() {
  return currentId !== null && loadAllSaved().some(d => d.id === currentId);
}

function setSaveBusy(busy) {
  saveInFlight = busy;
  ['saveBtn', 'mSaveBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = busy;
  });
  document.querySelectorAll('.save-label').forEach(el => {
    el.textContent = busy ? 'Enregistrement…' : 'Enregistrer';
  });
}

const QUOTA_MESSAGE = 'Limite atteinte : 3 documents ce mois-ci. Passe à Pro pour en créer davantage.';

document.getElementById('saveBtn').addEventListener('click', async () => {
  if (saveInFlight) return;
  if (!document.getElementById('pNumero').textContent) {
    document.getElementById('pNumero').textContent = nextNumero(docType());
  }
  const isNewDocument = !isEditingSavedDocument();
  if (isNewDocument && !DevisovaStorage.canCreateDocument()) {
    showToast(`${QUOTA_MESSAGE} Ce document n'a pas été enregistré.`, { variant: 'warning', duration: 6000 });
    return;
  }
  const state = collectState();
  if (isNewDocument) {
    if (!pendingNewDocId) pendingNewDocId = crypto.randomUUID();
    state.id = pendingNewDocId;
  }
  const generation = formGeneration;
  const snapshot = snapshotForComparison();
  setSaveBusy(true);
  const result = await DevisovaStorage.saveDocument(state);
  setSaveBusy(false);
  if (!result.ok) {
    if (result.error && result.error.name === 'QuotaExceededError') {
      showToast(`Stockage local plein : libère de la place (supprime un ancien document) puis réessaie.`, { variant: 'error', duration: 7000 });
    } else {
      showToast(`Le document n'a pas été enregistré. Vérifie ta connexion puis réessaie.`, { variant: 'error', duration: 6000 });
    }
    return;
  }
  refreshDocumentsUI();
  if (generation === formGeneration) {
    // Le formulaire affiche toujours ce document : il devient "le document ouvert".
    currentId = state.id;
    currentDocDate = state.date;
    pendingNewDocId = null;
    setSavedListValue(state.id);
    lastSavedSnapshot = snapshot;
    updateConvertButtonVisibility();
  }
  showToast(`✓ ${state.type === 'facture' ? 'Facture enregistrée' : 'Devis enregistré'} : ${state.numero}`);
});

document.getElementById('newBtn').addEventListener('click', () => {
  // Quota verifie AVANT la confirmation "modifications non enregistrees" : au
  // quota atteint, seul le message s'affiche et le document ouvert reste intact.
  if (!DevisovaStorage.canCreateDocument()) {
    showToast(QUOTA_MESSAGE, { variant: 'warning', duration: 6000 });
    return;
  }
  if (!confirmDiscard()) return;
  formGeneration++;
  pendingNewDocId = null;
  currentId = null;
  currentDocDate = null;
  logoData = null;
  lignes = [{ desc: '', qty: 1, prix: 0, _pristine: true }];
  document.getElementById('entName').value = '';
  document.getElementById('entSiret').value = '';
  document.getElementById('entAdresse').value = '';
  document.getElementById('entTel').value = '';
  document.getElementById('entEmail').value = '';
  document.getElementById('cliName').value = '';
  document.getElementById('cliAdresse').value = '';
  document.getElementById('clientPicker').value = '';
  document.getElementById('logoLabel').textContent = "+ Ajouter mon logo (optionnel)";
  setSavedListValue('');
  document.getElementById('typeDevis').checked = true;
  document.getElementById('typeFacture').checked = false;
  // Un nouveau document repart sur le modèle par défaut (Classic) : sans ça, un
  // compte Pro qui avait choisi "Modern" sur le document précédent se retrouvait
  // avec "Modern" toujours coché (et donc appliqué) sur ce nouveau document vierge.
  document.querySelector('input[name="template"][value="classic"]').checked = true;
  document.getElementById('pNumero').textContent = nextNumero(docType());
  applyProfile(loadProfile());
  renderForm();
  renderPreview();
  markSnapshotClean();
});

// La fonctionnalite de duplication (reservee Pro) reste intacte dans le code :
// seul son bouton d'acces a ete retire de la zone principale, trop chargee
// (section 7 de la demande). A reconnecter plus tard (ex. menu d'un document
// dans l'historique) via document.getElementById('duplicateBtn'), s'il existe.
function duplicateCurrentDocument() {
  if (!DevisovaStorage.isPro()) {
    showToast('La duplication est une fonctionnalité Pro.');
    return;
  }
  const numero = document.getElementById('pNumero').textContent;
  if (!numero) {
    showToast('Renseigne ou enregistre d\'abord un document à dupliquer.');
    return;
  }
  const source = collectState();
  const duplicate = Object.assign({}, source, {
    id: crypto.randomUUID(),
    numero: nextNumero(source.type),
    date: new Date().toISOString(),
  });
  const all = loadAllSaved();
  all.push(duplicate);
  saveAllSaved(all);
  currentId = duplicate.id;
  currentDocDate = duplicate.date;
  document.getElementById('pNumero').textContent = duplicate.numero;
  refreshDocumentsUI();
  setSavedListValue(duplicate.id);
  renderPreview();
  markSnapshotClean();
  showToast(`✓ Document dupliqué : ${duplicate.numero}`);
}
const duplicateBtn = document.getElementById('duplicateBtn');
if (duplicateBtn) duplicateBtn.addEventListener('click', duplicateCurrentDocument);

document.getElementById('convertBtn').addEventListener('click', () => {
  if (!DevisovaStorage.isPro()) {
    showToast('La conversion en facture est une fonctionnalité Pro.');
    return;
  }
  const source = collectState();
  const converted = Object.assign({}, source, {
    id: crypto.randomUUID(),
    type: 'facture',
    numero: nextNumero('facture'),
    date: new Date().toISOString(),
  });
  const all = loadAllSaved();
  all.push(converted);
  saveAllSaved(all);
  applyState(converted);
  refreshDocumentsUI();
  setSavedListValue(converted.id);
  markSnapshotClean();
  showToast(`✓ Facture créée : ${converted.numero}`);
});

document.getElementById('docPickerTrigger').addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = document.getElementById('docPickerMenu');
  if (menu.hidden) openDocPicker(); else closeDocPicker();
});

document.getElementById('docPickerMenu').addEventListener('click', (e) => {
  const opt = e.target.closest('.doc-picker-option');
  closeDocPicker();
  if (!opt || !opt.dataset.id) return;
  if (!confirmDiscard()) return;
  const doc = loadAllSaved().find(d => d.id === opt.dataset.id);
  if (doc) {
    applyState(doc);
    setSavedListValue(doc.id);
    markSnapshotClean();
  }
});

document.addEventListener('click', (e) => {
  const picker = document.getElementById('docPicker');
  if (picker && !picker.contains(e.target)) closeDocPicker();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDocPicker();
});

// Changer Devis <-> Facture pendant qu'un document deja enregistre est charge
// (currentId non nul) doit etre bloque et annule : le type d'un document
// enregistre ne se change jamais par ce simple bascule.
//
// Deux raisons, pas une seule :
// 1) Laisser passer le changement en reutilisant le meme id ecraserait
//    silencieusement le document d'origine avec le nouveau type/numero
//    (bug numero/type desynchronises, ex. DEV-2026-003 en apercu vs
//    DEV-2026-002 dans la liste).
// 2) Laisser passer le changement en detachant simplement l'id (nouveau
//    document, meme contenu) reviendrait a dupliquer librement client +
//    lignes d'un document existant sous un nouveau numero — exactement ce
//    que "Dupliquer" fait, mais sans jamais passer par son controle Pro
//    (storage.js: PRO_ONLY_FEATURES.includes('duplicate')).
// On revient donc toujours au type d'origine : pour un document different,
// la voie normale reste "Nouveau" (vierge, libre) ou "Transformer en
// facture" (Pro, conserve le lien avec l'original).
function blockTypeChangeOnLoadedDocument() {
  if (currentId === null) return true;
  const attempted = docType();
  const original = attempted === 'facture' ? 'devis' : 'facture';
  document.getElementById('typeDevis').checked = original !== 'facture';
  document.getElementById('typeFacture').checked = original === 'facture';
  const proHint = DevisovaStorage.isPro() ? ', ou "Transformer en facture" pour le convertir' : '';
  showToast(`Ce document est déjà enregistré en ${original === 'facture' ? 'facture' : 'devis'}. Utilise "Nouveau" pour un document vierge${proHint}.`);
  return false;
}

document.getElementById('typeDevis').addEventListener('change', () => {
  if (!blockTypeChangeOnLoadedDocument()) return;
  document.getElementById('pNumero').textContent = nextNumero(docType());
  renderPreview();
});
document.getElementById('typeFacture').addEventListener('change', () => {
  if (!blockTypeChangeOnLoadedDocument()) return;
  document.getElementById('pNumero').textContent = nextNumero(docType());
  renderPreview();
});

document.getElementById('devise').addEventListener('change', () => {
  renderForm();
  renderPreview();
});

document.querySelectorAll('input[name="template"]').forEach(radio => {
  radio.addEventListener('change', renderPreview);
});

// ===== Autres écouteurs =====
document.getElementById('addLigne').addEventListener('click', () => {
  lignes.push({ desc: '', qty: 1, prix: 0, _pristine: true });
  renderForm();
  renderPreview();
});

// Sur mobile, l'aperçu peut être en position hors-écran (onglet "Modifier" actif) via CSS
// de classe. html2canvas ne capture pas ça de façon fiable, même en changeant la classe
// juste avant. On neutralise donc temporairement CE positionnement par des styles inline
// !important (qui gagnent sur n'importe quelle règle de classe, de façon garantie et
// immédiate), le temps de la capture, puis on restaure l'état normal juste après.
function forcePreviewCapturable() {
  const el = document.getElementById('preview');
  const props = ['position', 'left', 'top', 'width', 'display', 'margin'];
  const saved = props.map(p => [p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]);
  el.style.setProperty('position', 'static', 'important');
  el.style.setProperty('left', 'auto', 'important');
  el.style.setProperty('top', 'auto', 'important');
  el.style.setProperty('width', 'auto', 'important');
  el.style.setProperty('display', 'block', 'important');
  el.style.setProperty('margin', '0', 'important');
  return function restore() {
    saved.forEach(([p, value, priority]) => {
      if (value) el.style.setProperty(p, value, priority);
      else el.style.removeProperty(p);
    });
  };
}

function pdfOptions(numero) {
  return {
    margin: 10,
    filename: `${numero}.pdf`,
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
}

// La pagination automatique de html2pdf peut laisser un reliquat de quelques millimètres
// sur une dernière page (fin de l'ombre/bordure du cadre, sans contenu réel). On lit la
// hauteur réellement dessinée sur cette dernière page (directement dans le contenu du PDF
// généré, sans recalcul approximatif) et on la supprime seulement si elle est vraiment
// minime — une vraie page 2 avec du contenu reste toujours intacte.
function trimEmptyTrailingPage(pdf) {
  const totalPages = pdf.internal.getNumberOfPages();
  if (totalPages < 2) return;
  const lastPageOps = pdf.internal.pages[totalPages];
  if (!Array.isArray(lastPageOps)) return;
  const text = lastPageOps.join('\n');
  const cmMatches = [...text.matchAll(/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+cm/g)];
  if (!cmMatches.length) return;
  const maxHeightPt = Math.max(...cmMatches.map(m => Math.abs(parseFloat(m[4]))));
  const maxHeightMM = maxHeightPt * 0.352778;
  if (maxHeightMM < 15) {
    pdf.deletePage(totalPages);
  }
}

// Si la page est scrollée (typique d'un devis long, une fois qu'on a rempli plusieurs
// lignes), html2canvas capture un contenu décalé/incomplet — c'est la cause du "PDF coupé".
// On remet le défilement à zéro pendant la capture, puis on restaure la position de
// l'utilisateur juste après.
function resetScrollForCapture() {
  const x = window.scrollX, y = window.scrollY;
  window.scrollTo(0, 0);
  return function restoreScroll() { window.scrollTo(x, y); };
}

function waitTwoFrames() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

document.getElementById('printBtn').addEventListener('click', async () => {
  setMobileView('preview');
  const restoreScroll = resetScrollForCapture();
  const restorePreview = forcePreviewCapturable();
  await waitTwoFrames();
  // window.print() ne bloque pas forcément l'exécution JS (variable selon navigateur) :
  // on restaure au moment fiable où l'impression est réellement terminée, avec un filet
  // de sécurité si "afterprint" ne se déclenche pas.
  let done = false;
  const finish = () => { if (done) return; done = true; restorePreview(); restoreScroll(); window.removeEventListener('afterprint', finish); };
  window.addEventListener('afterprint', finish);
  setTimeout(finish, 5000);
  window.print();
});

document.getElementById('pdfBtn').addEventListener('click', async () => {
  setMobileView('preview');
  const numero = document.getElementById('pNumero').textContent || 'document';
  const element = document.getElementById('preview');
  const restoreScroll = resetScrollForCapture();
  const restorePreview = forcePreviewCapturable();
  await waitTwoFrames();
  try {
    await html2pdf().set(pdfOptions(numero)).from(element).toPdf().get('pdf').then(trimEmptyTrailingPage).save();
  } finally {
    restorePreview();
    restoreScroll();
  }
});

// Dernier PDF genere pour le partage, associe au contenu exact de l'apercu.
let sharePdfCache = null;

document.getElementById('whatsappBtn').addEventListener('click', async () => {
  const numero = document.getElementById('pNumero').textContent || 'document';
  const type = docType() === 'facture' ? 'Facture' : 'Devis';
  const client = document.getElementById('cliName').value || 'client';
  const totalTTC = document.getElementById('pTotalTTC').textContent;
  const entName = document.getElementById('entName').value || '';
  const message = `Bonjour ${client}, voici votre ${type.toLowerCase()} ${numero}${entName ? ' de ' + entName : ''} : total ${totalTTC}. N'hésitez pas si vous avez des questions !`;

  const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const shareData = file => ({ files: [file], title: `${type} ${numero}`, text: message });

  // Le partage de fichier (avec le PDF) n'est possible que via l'API Web Share du
  // navigateur (menu de partage natif) — un lien wa.me ne peut transporter que du texte.
  // On teste cette capacite AVANT tout await (avec un fichier PDF vide, le type suffit) :
  // si elle manque, on ouvre wa.me tout de suite, encore pendant le geste utilisateur.
  // (Ne plus pre-ouvrir d'onglet vide "de secours" : sur iPhone, Safari bascule
  // aussitot sur cet onglet about:blank — la page blanche — et met l'onglet de
  // l'app en arriere-plan, ou requestAnimationFrame est suspendu : la generation
  // du PDF reste alors bloquee et le menu de partage n'apparait jamais.)
  const probe = new File([''], `${numero}.pdf`, { type: 'application/pdf' });
  if (!navigator.share || !navigator.canShare || !navigator.canShare({ files: [probe] })) {
    window.open(waUrl, '_blank');
    return;
  }

  // PDF deja genere pour exactement ce contenu (2e appui apres un refus de Safari,
  // voir plus bas) : navigator.share() est appele immediatement, dans le geste.
  const element = document.getElementById('preview');
  const contentKey = element.className + element.innerHTML;
  if (sharePdfCache && sharePdfCache.key === contentKey) {
    try {
      await navigator.share(shareData(sharePdfCache.file));
    } catch (err) {
      if (!err || err.name !== 'AbortError') showToast('Le partage a échoué. Utilise « PDF » pour télécharger le document.');
    }
    return;
  }

  setMobileView('preview');
  const restoreScroll = resetScrollForCapture();
  const restore = forcePreviewCapturable();
  await waitTwoFrames();
  let file;
  try {
    const blob = await html2pdf().set(pdfOptions(numero)).from(element).toPdf().get('pdf').then(pdf => { trimEmptyTrailingPage(pdf); return pdf; }).outputPdf('blob');
    file = new File([blob], `${numero}.pdf`, { type: 'application/pdf' });
    sharePdfCache = { key: contentKey, file };
  } catch (err) {
    console.error('[share] generation PDF', err);
    showToast('Impossible de générer le PDF. Réessaie.');
    return;
  } finally {
    restore();
    restoreScroll();
  }

  try {
    await navigator.share(shareData(file));
  } catch (err) {
    if (err && err.name === 'AbortError') return; // l'utilisateur a ferme le menu de partage
    // Safari n'autorise navigator.share() que juste apres un geste utilisateur ; la
    // generation du PDF peut depasser ce delai (NotAllowedError). Le PDF est garde en
    // memoire : un 2e appui le partage instantanement, dans un geste neuf.
    if (err && err.name === 'NotAllowedError') {
      showToast('PDF prêt — appuie à nouveau sur Partager pour l\'envoyer.');
      return;
    }
    console.error('[share]', err);
    showToast('Le partage a échoué. Utilise « PDF » pour télécharger le document.');
  }
});

['entName','entSiret','entAdresse','entTel','entEmail','cliName','cliAdresse','tva'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderPreview);
});

['entName','entSiret','entAdresse','entTel','entEmail'].forEach(id => {
  document.getElementById(id).addEventListener('input', maybeSaveProfile);
});

// ===== Navigation mobile (Modifier / Aperçu) =====
const mobileLayout = document.querySelector('.layout');
const tabEdit = document.getElementById('tabEdit');
const tabPreview = document.getElementById('tabPreview');

function setMobileView(view) {
  if (!mobileLayout || !tabEdit || !tabPreview) return;
  const isPreview = view === 'preview';
  mobileLayout.classList.toggle('show-preview', isPreview);
  tabEdit.classList.toggle('active', !isPreview);
  tabPreview.classList.toggle('active', isPreview);
  tabEdit.setAttribute('aria-selected', String(!isPreview));
  tabPreview.setAttribute('aria-selected', String(isPreview));
}

if (tabEdit && tabPreview) {
  tabEdit.addEventListener('click', () => setMobileView('edit'));
  tabPreview.addEventListener('click', () => setMobileView('preview'));
}

// ===== Barre d'actions mobile (relaie vers les boutons existants) =====
const mobileActionMap = { mSaveBtn: 'saveBtn', mPrintBtn: 'printBtn', mPdfBtn: 'pdfBtn', mWhatsappBtn: 'whatsappBtn' };
Object.entries(mobileActionMap).forEach(([mobileId, targetId]) => {
  const btn = document.getElementById(mobileId);
  const target = document.getElementById(targetId);
  if (btn && target) btn.addEventListener('click', () => target.click());
});

// ===== Init =====
// Attend que le storage adapter ait charge les donnees (localStorage,
// instantane, ou Supabase pour un compte deja connecte au chargement).
DevisovaStorage.ready.then(() => {
  refreshDocumentsUI();
  refreshClientPicker();
  document.getElementById('pNumero').textContent = nextNumero(docType());
  applyProfile(loadProfile());
  renderForm();
  renderPreview();
  markSnapshotClean();
});
