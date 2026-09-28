let lignes = [
  { desc: "Exemple : pose de carrelage", qty: 25, prix: 45 }
];
let logoData = null;
let currentId = null;

function fmt(n) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// ===== Lignes de prestation =====
function renderForm() {
  const container = document.getElementById('lignes');
  container.innerHTML = '';
  lignes.forEach((l, i) => {
    const row = document.createElement('div');
    row.className = 'ligne-row';
    row.innerHTML = `
      <input type="text" value="${l.desc}" data-i="${i}" data-field="desc" placeholder="Description">
      <input type="number" value="${l.qty}" data-i="${i}" data-field="qty" min="0">
      <input type="number" value="${l.prix}" data-i="${i}" data-field="prix" min="0" step="0.01">
      <button type="button" class="remove-ligne" data-i="${i}">×</button>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const i = e.target.dataset.i;
      const field = e.target.dataset.field;
      lignes[i][field] = field === 'desc' ? e.target.value : parseFloat(e.target.value) || 0;
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
    renderPreview();
  };
  reader.readAsDataURL(file);
});

// ===== Aperçu =====
function docType() {
  return document.getElementById('typeFacture').checked ? 'facture' : 'devis';
}

function renderPreview() {
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
    logoImg.style.display = 'none';
  }

  document.getElementById('pCliName').textContent = document.getElementById('cliName').value || '—';
  document.getElementById('pCliAdresse').textContent = document.getElementById('cliAdresse').value;

  document.getElementById('pDocType').textContent = docType() === 'facture' ? 'FACTURE' : 'DEVIS';
  document.getElementById('pDate').textContent = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const tbody = document.getElementById('pLignes');
  tbody.innerHTML = '';
  let totalHT = 0;
  lignes.forEach(l => {
    const totalLigne = (l.qty || 0) * (l.prix || 0);
    totalHT += totalLigne;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${l.desc || '—'}</td><td>${l.qty || 0}</td><td>${fmt(l.prix || 0)}</td><td>${fmt(totalLigne)}</td>`;
    tbody.appendChild(tr);
  });

  const tvaTaux = parseFloat(document.getElementById('tva').value);
  const totalTVA = totalHT * (tvaTaux / 100);
  const totalTTC = totalHT + totalTVA;

  document.getElementById('pTvaTaux').textContent = tvaTaux;
  document.getElementById('pTotalHT').textContent = fmt(totalHT);
  document.getElementById('pTotalTVA').textContent = fmt(totalTVA);
  document.getElementById('pTotalTTC').textContent = fmt(totalTTC);
}

// ===== Sauvegarde locale =====
function loadAllSaved() {
  return JSON.parse(localStorage.getItem('devisio_documents') || '[]');
}

function saveAllSaved(arr) {
  localStorage.setItem('devisio_documents', JSON.stringify(arr));
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

function collectState() {
  return {
    id: currentId || (Date.now().toString()),
    type: docType(),
    numero: document.getElementById('pNumero').textContent || nextNumero(docType()),
    entName: document.getElementById('entName').value,
    entSiret: document.getElementById('entSiret').value,
    entAdresse: document.getElementById('entAdresse').value,
    entTel: document.getElementById('entTel').value,
    entEmail: document.getElementById('entEmail').value,
    cliName: document.getElementById('cliName').value,
    cliAdresse: document.getElementById('cliAdresse').value,
    tva: document.getElementById('tva').value,
    lignes: lignes,
    logoData: logoData,
  };
}

function applyState(d) {
  currentId = d.id;
  document.getElementById('typeDevis').checked = d.type !== 'facture';
  document.getElementById('typeFacture').checked = d.type === 'facture';
  document.getElementById('entName').value = d.entName || '';
  document.getElementById('entSiret').value = d.entSiret || '';
  document.getElementById('entAdresse').value = d.entAdresse || '';
  document.getElementById('entTel').value = d.entTel || '';
  document.getElementById('entEmail').value = d.entEmail || '';
  document.getElementById('cliName').value = d.cliName || '';
  document.getElementById('cliAdresse').value = d.cliAdresse || '';
  document.getElementById('tva').value = d.tva || '20';
  lignes = d.lignes && d.lignes.length ? d.lignes : [{ desc: '', qty: 1, prix: 0 }];
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
  const all = loadAllSaved();
  const idx = all.findIndex(d => d.id === state.id);
  if (idx >= 0) all[idx] = state; else all.push(state);
  saveAllSaved(all);
  refreshSavedList();
  document.getElementById('savedList').value = state.id;
  showToast(`✓ ${state.type === 'facture' ? 'Facture' : 'Devis'} enregistré : ${state.numero}`);
});

document.getElementById('newBtn').addEventListener('click', () => {
  currentId = null;
  logoData = null;
  lignes = [{ desc: '', qty: 1, prix: 0 }];
  document.getElementById('entName').value = '';
  document.getElementById('entSiret').value = '';
  document.getElementById('entAdresse').value = '';
  document.getElementById('entTel').value = '';
  document.getElementById('entEmail').value = '';
  document.getElementById('cliName').value = '';
  document.getElementById('cliAdresse').value = '';
  document.getElementById('logoLabel').textContent = "+ Ajouter mon logo (optionnel)";
  document.getElementById('savedList').value = '';
  document.getElementById('typeDevis').checked = true;
  document.getElementById('typeFacture').checked = false;
  document.getElementById('pNumero').textContent = nextNumero(docType());
  renderForm();
  renderPreview();
});

document.getElementById('savedList').addEventListener('change', (e) => {
  if (!e.target.value) return;
  const all = loadAllSaved();
  const doc = all.find(d => d.id === e.target.value);
  if (doc) applyState(doc);
});

document.getElementById('typeDevis').addEventListener('change', () => {
  document.getElementById('pNumero').textContent = nextNumero(docType());
  renderPreview();
});
document.getElementById('typeFacture').addEventListener('change', () => {
  document.getElementById('pNumero').textContent = nextNumero(docType());
  renderPreview();
});

// ===== Autres écouteurs =====
document.getElementById('addLigne').addEventListener('click', () => {
  lignes.push({ desc: '', qty: 1, prix: 0 });
  renderForm();
  renderPreview();
});

document.getElementById('printBtn').addEventListener('click', () => window.print());

document.getElementById('pdfBtn').addEventListener('click', () => {
  const numero = document.getElementById('pNumero').textContent || 'document';
  const element = document.getElementById('preview');
  html2pdf().set({
    margin: 10,
    filename: `${numero}.pdf`,
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(element).save();
});

document.getElementById('whatsappBtn').addEventListener('click', () => {
  const numero = document.getElementById('pNumero').textContent || '';
  const type = docType() === 'facture' ? 'Facture' : 'Devis';
  const client = document.getElementById('cliName').value || 'client';
  const totalTTC = document.getElementById('pTotalTTC').textContent;
  const entName = document.getElementById('entName').value || '';
  const message = `Bonjour ${client}, voici votre ${type.toLowerCase()} ${numero}${entName ? ' de ' + entName : ''} : total ${totalTTC}. N'hésitez pas si vous avez des questions !`;
  const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
});

['entName','entSiret','entAdresse','entTel','entEmail','cliName','cliAdresse','tva'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderPreview);
});

// ===== Init =====
refreshSavedList();
document.getElementById('pNumero').textContent = nextNumero(docType());
renderForm();
renderPreview();
