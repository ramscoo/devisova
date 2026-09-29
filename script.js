let lignes = [
  { desc: '', qty: 1, prix: 0, _pristine: true }
];
let logoData = null;
let currentId = null;
let currentDocDate = null;
let lastSavedSnapshot = '';

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
        <input type="number" value="${qtyValue}" data-i="${i}" data-field="qty" min="0" placeholder="1" aria-label="Quantité">
      </div>
      <div class="ligne-field ligne-field-prix">
        <span class="ligne-field-label">Prix HT</span>
        <input type="number" value="${prixValue}" data-i="${i}" data-field="prix" min="0" step="0.01" placeholder="45,00" aria-label="Prix unitaire HT">
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
      lignes[i][field] = field === 'desc' ? e.target.value : parseFloat(e.target.value) || 0;
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
document.getElementById('logoInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    logoData = ev.target.result;
    document.getElementById('logoLabel').textContent = "✓ Logo ajouté (cliquer pour changer)";
    maybeSaveProfile();
    renderPreview();
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
  return (checked && TEMPLATES.includes(checked.value)) ? checked.value : 'classic';
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
  if (footer) footer.textContent = `${docType() === 'facture' ? 'Facture générée' : 'Devis généré'} avec Devisio`;
}

// ===== Sauvegarde locale =====
function loadAllSaved() {
  return JSON.parse(localStorage.getItem('devisio_documents') || '[]');
}

function saveAllSaved(arr) {
  localStorage.setItem('devisio_documents', JSON.stringify(arr));
}

// ===== Profil "Mon entreprise" (mémorisé séparément des documents) =====
function loadProfile() {
  return JSON.parse(localStorage.getItem('devisio_profile') || 'null');
}

function saveProfile(profile) {
  localStorage.setItem('devisio_profile', JSON.stringify(profile));
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

// ===== Clients enregistrés (indépendants des documents) =====
function loadClients() {
  return JSON.parse(localStorage.getItem('devisio_clients') || '[]');
}

function saveClients(arr) {
  localStorage.setItem('devisio_clients', JSON.stringify(arr));
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
  clients.push({ id: Date.now().toString(), nom, adresse });
  saveClients(clients);
  refreshClientPicker();
  showToast(`✓ Client enregistré : ${nom}`);
});

// ===== Protection contre la perte de données non enregistrées =====
// collectState() génère un id aléatoire (Date.now()) tant que le document n'est pas
// encore enregistré (currentId === null) : on l'exclut de la comparaison, sinon deux
// appels consécutifs sans aucun changement réel seraient à tort vus comme "modifiés".
function snapshotForComparison() {
  const state = collectState();
  state.id = 'snapshot';
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

function refreshSavedList() {
  const select = document.getElementById('savedList');
  const all = loadAllSaved();
  select.innerHTML = '<option value="">— Mes documents enregistrés —</option>';
  all.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = `${d.numero} · ${d.cliName || 'Sans client'}`;
    select.appendChild(opt);
  });
}

function docTotalTTC(d) {
  const totalHT = (d.lignes || []).reduce((sum, l) => sum + (l.qty || 0) * (l.prix || 0), 0);
  const tva = parseFloat(d.tva) || 0;
  return totalHT * (1 + tva / 100);
}

function renderHistory() {
  const container = document.getElementById('historyList');
  const all = loadAllSaved();
  container.innerHTML = '';
  if (!all.length) {
    container.innerHTML = '<p class="history-empty">Aucun document enregistré pour l\'instant.</p>';
    return;
  }
  all.slice().reverse().forEach(d => {
    const dateLabel = d.date ? new Date(d.date).toLocaleDateString('fr-FR') : '—';
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'history-item';
    row.dataset.id = d.id;
    row.innerHTML = `
      <div class="history-main">
        <span class="history-numero">${d.numero}</span>
        <span class="history-type">${d.type === 'facture' ? 'Facture' : 'Devis'}</span>
      </div>
      <div class="history-client">${d.cliName || 'Sans client'}</div>
      <div class="history-meta">
        <span>${dateLabel}</span>
        <span class="history-total">${fmt(docTotalTTC(d), d.devise || 'EUR')}</span>
      </div>
    `;
    container.appendChild(row);
  });
  container.querySelectorAll('.history-item').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirmDiscard()) return;
      const doc = loadAllSaved().find(x => x.id === btn.dataset.id);
      if (!doc) return;
      applyState(doc);
      document.getElementById('savedList').value = doc.id;
      markSnapshotClean();
    });
  });
}

// Point d'entrée unique à appeler chaque fois que la liste des documents change
// (sauvegarde, duplication...) pour garder la liste déroulante et l'historique synchronisés.
function refreshDocumentsUI() {
  refreshSavedList();
  renderHistory();
}

function collectState() {
  return {
    id: currentId || (Date.now().toString()),
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
    lignes: lignes,
    logoData: logoData,
  };
}

function applyState(d) {
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
  lignes = d.lignes && d.lignes.length ? d.lignes : [{ desc: '', qty: 1, prix: 0, _pristine: true }];
  logoData = d.logoData || null;
  document.getElementById('logoLabel').textContent = logoData ? "✓ Logo ajouté (cliquer pour changer)" : "+ Ajouter mon logo (optionnel)";
  document.getElementById('pNumero').textContent = d.numero;
  renderForm();
  renderPreview();
}

function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2500);
}

document.getElementById('saveBtn').addEventListener('click', () => {
  if (!document.getElementById('pNumero').textContent) {
    document.getElementById('pNumero').textContent = nextNumero(docType());
  }
  const state = collectState();
  currentId = state.id;
  currentDocDate = state.date;
  const all = loadAllSaved();
  const idx = all.findIndex(d => d.id === state.id);
  if (idx >= 0) all[idx] = state; else all.push(state);
  saveAllSaved(all);
  refreshDocumentsUI();
  document.getElementById('savedList').value = state.id;
  showToast(`✓ ${state.type === 'facture' ? 'Facture' : 'Devis'} enregistré : ${state.numero}`);
  markSnapshotClean();
});

document.getElementById('newBtn').addEventListener('click', () => {
  if (!confirmDiscard()) return;
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
  document.getElementById('savedList').value = '';
  document.getElementById('typeDevis').checked = true;
  document.getElementById('typeFacture').checked = false;
  document.getElementById('pNumero').textContent = nextNumero(docType());
  applyProfile(loadProfile());
  renderForm();
  renderPreview();
  markSnapshotClean();
});

document.getElementById('duplicateBtn').addEventListener('click', () => {
  const numero = document.getElementById('pNumero').textContent;
  if (!numero) {
    showToast('Renseigne ou enregistre d\'abord un document à dupliquer.');
    return;
  }
  const source = collectState();
  const duplicate = Object.assign({}, source, {
    id: Date.now().toString(),
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
  document.getElementById('savedList').value = duplicate.id;
  renderPreview();
  markSnapshotClean();
  showToast(`✓ Document dupliqué : ${duplicate.numero}`);
});

document.getElementById('savedList').addEventListener('change', (e) => {
  if (!e.target.value) return;
  if (!confirmDiscard()) {
    e.target.value = currentId || '';
    return;
  }
  const all = loadAllSaved();
  const doc = all.find(d => d.id === e.target.value);
  if (doc) {
    applyState(doc);
    markSnapshotClean();
  }
});

document.getElementById('typeDevis').addEventListener('change', () => {
  document.getElementById('pNumero').textContent = nextNumero(docType());
  renderPreview();
});
document.getElementById('typeFacture').addEventListener('change', () => {
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

document.getElementById('whatsappBtn').addEventListener('click', async () => {
  const numero = document.getElementById('pNumero').textContent || 'document';
  const type = docType() === 'facture' ? 'Facture' : 'Devis';
  const client = document.getElementById('cliName').value || 'client';
  const totalTTC = document.getElementById('pTotalTTC').textContent;
  const entName = document.getElementById('entName').value || '';
  const message = `Bonjour ${client}, voici votre ${type.toLowerCase()} ${numero}${entName ? ' de ' + entName : ''} : total ${totalTTC}. N'hésitez pas si vous avez des questions !`;

  const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  // Le partage de fichier (avec le PDF) n'est possible que via l'API Web Share du
  // navigateur (menu de partage natif) — un lien wa.me ne peut transporter que du texte.
  if (!navigator.share || !navigator.canShare) {
    window.open(waUrl, '_blank');
    return;
  }

  // On ouvre tout de suite un onglet vide, PENDANT le geste utilisateur (avant tout await) :
  // si on doit finalement retomber sur le lien texte après la génération asynchrone
  // du PDF, on redirige CET onglet déjà ouvert plutôt que d'en ouvrir un nouveau —
  // sinon le navigateur bloque silencieusement le window.open() tardif.
  const fallbackWindow = window.open('', '_blank');
  const shareTextOnly = () => {
    if (fallbackWindow) fallbackWindow.location.href = waUrl;
    else window.open(waUrl, '_blank');
  };

  setMobileView('preview');
  const element = document.getElementById('preview');
  const restoreScroll = resetScrollForCapture();
  const restore = forcePreviewCapturable();
  await waitTwoFrames();
  try {
    const blob = await html2pdf().set(pdfOptions(numero)).from(element).toPdf().get('pdf').then(pdf => { trimEmptyTrailingPage(pdf); return pdf; }).outputPdf('blob');
    restore();
    restoreScroll();

    const file = new File([blob], `${numero}.pdf`, { type: 'application/pdf' });

    if (navigator.canShare({ files: [file] })) {
      if (fallbackWindow) fallbackWindow.close();
      await navigator.share({ files: [file], title: `${type} ${numero}`, text: message });
    } else {
      shareTextOnly();
    }
  } catch (err) {
    restore();
    restoreScroll();
    if (err && err.name === 'AbortError') { if (fallbackWindow) fallbackWindow.close(); return; }
    shareTextOnly();
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
refreshDocumentsUI();
refreshClientPicker();
document.getElementById('pNumero').textContent = nextNumero(docType());
applyProfile(loadProfile());
renderForm();
renderPreview();
markSnapshotClean();
