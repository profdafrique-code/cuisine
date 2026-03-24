/* ════════════════════════════════════════════════════════
   CUISINIÈRE 2.0 — app.js
   Logique principale : Firebase Auth, Firestore, Chef IA, UI
════════════════════════════════════════════════════════ */

// ─── ÉTAT GLOBAL ──────────────────────────────────────────
let currentUser     = null;      // Firebase user object
let userProfile     = null;      // Document Firestore /users/{uid}
let currentRecette  = null;      // Recette en cours de lecture
let listeCourses    = [];        // Liste de courses locale
let formPortions    = 4;         // Portions du formulaire admin
let selectedEmoji   = '🍽️';
let selectedBg      = 'bg-ayimolou';
let ingCount        = 2;
let etapeCount      = 1;
let accessRecette   = 'gratuit'; // 'gratuit' ou 'premium'
const ADMIN_EMAIL   = 'admin@cuisiniere2.tg'; // ← Changez par votre email admin

// ─── SPLASH SCREEN ────────────────────────────────────────
window.addEventListener('load', () => {
  updateClock();
  setInterval(updateClock, 30000);
  // Cacher le splash après 2.5s
  setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) splash.classList.add('hidden');
  }, 2500);
  // Surveiller l'authentification
  initAuth();
});

// ─── HORLOGE ─────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2,'0');
  const m = String(now.getMinutes()).padStart(2,'0');
  const el = document.getElementById('clock');
  if (el) el.textContent = h + ':' + m;
}

// ─── NAVIGATION ──────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + id);
  if (target) {
    target.classList.add('active');
    target.scrollTop = 0;
  }
  // Actions spéciales par écran
  if (id === 'accueil')        chargerAccueil();
  if (id === 'admin')          chargerAdminStats();
  if (id === 'profil')         afficherProfil();
  if (id === 'courses')        afficherCourses();
  if (id === 'ia')             preparerIA();
}

function showToast(msg, duration = 2500) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, duration);
}

// ─── AUTH ─────────────────────────────────────────────────
function initAuth() {
  if (!window.auth) return;
  window.fbAuth.onAuthStateChanged(window.auth, async (user) => {
    if (user) {
      currentUser = user;
      await chargerProfil(user.uid);
      showScreen('accueil');
    } else {
      currentUser = null;
      userProfile = null;
      showScreen('auth');
    }
  });
}

async function connecter() {
  const email = document.getElementById('login-email').value.trim();
  const pwd   = document.getElementById('login-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';
  try {
    await window.fbAuth.signInWithEmailAndPassword(window.auth, email, pwd);
  } catch (e) {
    errEl.style.display = 'block';
    errEl.textContent = tradFirebaseError(e.code);
  }
}

async function inscrire() {
  const email = document.getElementById('signup-email').value.trim();
  const pwd   = document.getElementById('signup-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';
  try {
    const cred = await window.fbAuth.createUserWithEmailAndPassword(window.auth, email, pwd);
    await creerProfil(cred.user.uid, email);
  } catch (e) {
    errEl.style.display = 'block';
    errEl.textContent = tradFirebaseError(e.code);
  }
}

async function creerProfil(uid, email) {
  const { doc, setDoc, serverTimestamp } = window.fbStore;
  await setDoc(doc(window.db, 'users', uid), {
    email,
    premium: false,
    dateFinAbonnement: null,
    questionsToday: 0,
    reputation: 0,
    niveau: 'Apprenti',
    favoris: [],
    createdAt: serverTimestamp()
  });
}

async function chargerProfil(uid) {
  const { doc, getDoc } = window.fbStore;
  const snap = await getDoc(doc(window.db, 'users', uid));
  if (snap.exists()) {
    userProfile = snap.data();
  } else {
    await creerProfil(uid, currentUser.email);
    userProfile = { premium: false, questionsToday: 0, reputation: 0, niveau: 'Apprenti', favoris: [] };
  }
}

async function deconnexion() {
  await window.fbAuth.signOut(window.auth);
  showToast('Déconnexion réussie 👋');
}

function continuerSansConnexion() {
  currentUser = null;
  userProfile = null;
  showScreen('accueil');
}

async function resetPassword() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) { showToast('⚠️ Entrez votre email d\'abord'); return; }
  try {
    await window.fbAuth.sendPasswordResetEmail(window.auth, email);
    showToast('📧 Email de réinitialisation envoyé !');
  } catch (e) {
    showToast('❌ Erreur : ' + tradFirebaseError(e.code));
  }
}

function switchAuthTab(tab) {
  document.getElementById('auth-form-login').style.display  = tab === 'login'  ? 'block' : 'none';
  document.getElementById('auth-form-signup').style.display = tab === 'signup' ? 'block' : 'none';
  document.getElementById('tab-login').classList.toggle('active',  tab === 'login');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('auth-error').style.display = 'none';
}

function tradFirebaseError(code) {
  const msg = {
    'auth/invalid-email':       'Email invalide.',
    'auth/user-not-found':      'Aucun compte avec cet email.',
    'auth/wrong-password':      'Mot de passe incorrect.',
    'auth/email-already-in-use':'Cet email est déjà utilisé.',
    'auth/weak-password':       'Mot de passe trop court (min. 6 caractères).',
    'auth/too-many-requests':   'Trop de tentatives. Réessayez plus tard.',
    'auth/network-request-failed': 'Erreur réseau. Vérifiez votre connexion.',
  };
  return msg[code] || 'Une erreur est survenue. (' + code + ')';
}

// ─── ACCUEIL ─────────────────────────────────────────────
async function chargerAccueil() {
  // Salutation contextuelle
  const h = new Date().getHours();
  const salut = h < 12 ? 'Bonjour ! 🌅' : h < 18 ? 'Bonsoir ! ☀️' : 'Bonsoir ! 🌙';
  const greetEl = document.getElementById('greeting-text');
  if (greetEl) greetEl.textContent = userProfile ? salut : 'Miawezon ! 🇹🇬';

  await chargerTendances();
  await chargerRecettesHonneur();
  await majCompteurCategories();
  majCompteurIA();
}

async function chargerTendances() {
  const container = document.getElementById('tendances-container');
  if (!container || !window.db) return;
  try {
    const { collection, getDocs, query, orderBy } = window.fbStore;
    const q = query(collection(window.db, 'recipes'), orderBy('nom'));
    const snap = await getDocs(q);
    const recettes = [];
    snap.forEach(d => recettes.push({ id: d.id, ...d.data() }));
    const affichees = recettes.slice(0, 4);
    if (affichees.length === 0) return;
    container.innerHTML = affichees.map(r => `
      <div class="tendance-card" onclick="ouvrirFiche('${r.id}')">
        <div class="tendance-img ${r.imageEmojiBg || 'bg-ayimolou'}" style="color:white;font-size:36px;">${r.imageEmoji || '🍽️'}
          <div class="tendance-badge">⏱ ${r.temps || '—'}</div>
        </div>
        <div class="tendance-body">
          <div class="tendance-name">${r.nom}</div>
          <div class="tendance-diff">${r.difficulte || '—'}</div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Erreur tendances:', e);
  }
}

async function chargerRecettesHonneur() {
  const container = document.getElementById('recettes-honneur-container');
  if (!container || !window.db) return;
  try {
    const { collection, getDocs, query, where } = window.fbStore;
    const q = query(collection(window.db, 'recipes'), where('statut', '==', 'approved'));
    const snap = await getDocs(q);
    const recettes = [];
    snap.forEach(d => {
      // Accès premium : masquer si premium et utilisateur non premium
      const data = d.data();
      if (data.premium && (!userProfile || !userProfile.premium)) return;
      recettes.push({ id: d.id, ...data });
    });
    if (recettes.length === 0) {
      container.innerHTML = '<div style="padding:20px;color:var(--gris);text-align:center;font-size:13px;">Aucune recette disponible pour l\'instant.</div>';
      return;
    }
    container.innerHTML = recettes.slice(0, 3).map(r => `
      <div class="recette-honneur" onclick="ouvrirFiche('${r.id}')">
        <div class="recette-img ${r.imageEmojiBg || 'bg-ayimolou'}" style="color:white;font-size:72px;">${r.imageEmoji || '🍽️'}
          <div class="recette-time">⏱ ${r.temps || '—'}</div>
          <div class="recette-diff-badge">${r.difficulte || '—'}</div>
          <div class="recette-fav" onclick="event.stopPropagation();toggleFavoriAccueil('${r.id}',this)">
            ${userProfile && userProfile.favoris && userProfile.favoris.includes(r.id) ? '❤️' : '🤍'}
          </div>
        </div>
        <div class="recette-body">
          <div class="recette-name">${r.nom}</div>
          <div class="recette-desc">${r.description || ''}</div>
          <div class="ingredients-label">Ingrédients clés</div>
          <div class="ingredients-tags">${(r.ingredients || []).slice(0,5).map(i => `<span class="ing-tag">${typeof i === 'object' ? i.nom : i}</span>`).join('')}</div>
          <div class="btn-actions">
            <button class="btn-primary" style="flex:1;" onclick="event.stopPropagation();ouvrirFiche('${r.id}')">👩‍🍳 Voir la recette</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Erreur recettes honneur:', e);
  }
}

async function majCompteurCategories() {
  if (!window.db) return;
  try {
    const { collection, getDocs, query, where } = window.fbStore;
    const categories = {
      sauce:    'Plats en sauce',
      grillade: 'Grillades',
      fufu:     'Pâtes & Fufu',
      dessert:  'Desserts',
    };
    for (const [key, cat] of Object.entries(categories)) {
      const q = query(collection(window.db, 'recipes'), where('categorie', '==', cat), where('statut', '==', 'approved'));
      const snap = await getDocs(q);
      const el = document.getElementById('count-' + key);
      if (el) el.textContent = snap.size + ' recette' + (snap.size > 1 ? 's' : '');
    }
  } catch (e) { /* silencieux */ }
}

function majCompteurIA() {
  if (!userProfile) return;
  const isPremium = userProfile.premium;
  const restantes = isPremium ? '∞' : (5 - (userProfile.questionsToday || 0));
  const el = document.getElementById('ia-counter-home');
  if (el) el.textContent = isPremium ? '✨ Questions illimitées' : `🔢 ${restantes}/5 questions aujourd'hui`;
}

// ─── FILTRAGE PAR CATÉGORIE ───────────────────────────────
function filterCategory(cat, el) {
  document.querySelectorAll('.cat-item').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  // À implémenter : filtrer les recettes à l'honneur par catégorie
  showToast('📁 Catégorie : ' + cat);
}

// ─── FICHE RECETTE ────────────────────────────────────────
async function ouvrirFiche(recetteId) {
  if (!window.db) return;
  showScreen('fiche-recette');
  try {
    const { doc, getDoc } = window.fbStore;
    const snap = await getDoc(doc(window.db, 'recipes', recetteId));
    if (!snap.exists()) { showToast('Recette introuvable.'); return; }
    const r = { id: snap.id, ...snap.data() };
    currentRecette = r;

    // Vérification accès premium
    if (r.premium && (!userProfile || !userProfile.premium)) {
      showScreen('premium');
      showToast('👑 Recette réservée aux abonnés Premium');
      return;
    }

    // Remplir l'interface
    const hero = document.getElementById('fiche-hero-img');
    hero.className = 'fiche-header ' + (r.imageEmojiBg || 'bg-ayimolou');
    hero.style.fontSize = '80px';

    // Remettre les éléments enfants
    hero.innerHTML = `${r.imageEmoji || '🍽️'}
      <div class="fiche-back" onclick="showScreen('accueil')">←</div>
      <div class="fiche-fav" id="fiche-fav-btn" onclick="toggleFavori()">${userProfile && userProfile.favoris && userProfile.favoris.includes(r.id) ? '❤️' : '🤍'}</div>
      <div class="fiche-badges">
        <span class="fiche-badge badge-green">${r.difficulte || '—'}</span>
        <span class="fiche-badge badge-dark">⏱ ${r.temps || '—'}</span>
      </div>`;

    document.getElementById('fiche-title').textContent      = r.nom;
    document.getElementById('fiche-desc').textContent       = r.description || '';
    document.getElementById('fiche-meta-temps').textContent = r.temps || '—';
    document.getElementById('fiche-meta-diff').textContent  = r.difficulte || '—';
    document.getElementById('fiche-meta-cal').textContent   = r.calories ? '~' + r.calories : '—';
    document.getElementById('portion-fiche').textContent    = r.portions || 4;

    // Ingrédients
    const ingsEl = document.getElementById('fiche-ingredients');
    ingsEl.innerHTML = (r.ingredients || []).map(i =>
      `<span class="ing-tag">${typeof i === 'object' ? i.nom + (i.qte ? ' — ' + i.qte : '') : i}</span>`
    ).join('');

    // Étapes
    const etapesEl = document.getElementById('fiche-etapes');
    etapesEl.innerHTML = (r.etapes || []).map((e, idx) => `
      <div class="etape-item">
        <div class="etape-num-circle">${idx + 1}</div>
        <div>
          <div class="etape-text">${typeof e === 'object' ? e.texte : e}</div>
          ${typeof e === 'object' && e.duree ? `<div class="etape-duree-badge">⏱ ${e.duree}</div>` : ''}
        </div>
      </div>`
    ).join('') || '<div style="color:var(--gris);font-size:13px;padding:8px 0;">Étapes à venir...</div>';

    await chargerCommentaires(r.id);
  } catch (e) {
    console.error('Erreur ouverture fiche:', e);
    showToast('❌ Erreur lors du chargement');
  }
}

// ─── FAVORIS ─────────────────────────────────────────────
async function toggleFavori() {
  if (!currentUser || !currentRecette) { showToast('Connectez-vous pour ajouter aux favoris'); return; }
  const { doc, updateDoc, getDoc } = window.fbStore;
  const userRef = doc(window.db, 'users', currentUser.uid);
  const snap = await getDoc(userRef);
  let favoris = snap.data().favoris || [];
  const id = currentRecette.id;
  const estFavori = favoris.includes(id);
  if (estFavori) {
    favoris = favoris.filter(f => f !== id);
    showToast('💔 Retiré des favoris');
  } else {
    favoris.push(id);
    showToast('❤️ Ajouté aux favoris !');
    await updateDoc(userRef, { reputation: (snap.data().reputation || 0) + 2 });
  }
  await updateDoc(userRef, { favoris });
  userProfile.favoris = favoris;
  const favBtn = document.getElementById('fiche-fav-btn');
  if (favBtn) favBtn.textContent = estFavori ? '🤍' : '❤️';
}

async function toggleFavoriAccueil(id, el) {
  if (!currentUser) { showToast('Connectez-vous pour ajouter aux favoris'); return; }
  const { doc, updateDoc, getDoc } = window.fbStore;
  const userRef = doc(window.db, 'users', currentUser.uid);
  const snap = await getDoc(userRef);
  let favoris = snap.data().favoris || [];
  const estFavori = favoris.includes(id);
  if (estFavori) { favoris = favoris.filter(f => f !== id); showToast('💔 Retiré'); }
  else           { favoris.push(id); showToast('❤️ Ajouté !'); }
  await updateDoc(userRef, { favoris });
  userProfile.favoris = favoris;
  if (el) el.textContent = estFavori ? '🤍' : '❤️';
}

// ─── PORTIONS ────────────────────────────────────────────
function changePortion(delta, key) {
  const el = document.getElementById('portion-' + key);
  if (!el) return;
  let val = parseInt(el.textContent) + delta;
  if (val < 1) val = 1;
  if (val > 20) val = 20;
  el.textContent = val;
}

// ─── LISTE DE COURSES ─────────────────────────────────────
function ajouterAuxCourses() {
  if (!currentRecette) return;
  const ings = currentRecette.ingredients || [];
  const section = {
    titre: currentRecette.nom,
    articles: ings.map(i => ({
      nom:  typeof i === 'object' ? i.nom   : i,
      qte:  typeof i === 'object' ? i.qte || '' : '',
      fait: false
    }))
  };
  // Vérifier si la recette est déjà dans les courses
  const existe = listeCourses.find(s => s.titre === section.titre);
  if (!existe) { listeCourses.push(section); showToast('🛒 Ajouté aux courses !'); }
  else { showToast('⚠️ Déjà dans votre liste !'); }
}

function afficherCourses() {
  const container = document.getElementById('courses-dynamic-container');
  if (!container) return;
  if (listeCourses.length === 0) {
    container.innerHTML = `
      <div style="padding:24px 20px;text-align:center;color:var(--gris);">
        <div style="font-size:40px;margin-bottom:10px;">🛒</div>
        <div style="font-size:14px;font-weight:600;margin-bottom:4px;">Votre liste est vide</div>
        <div style="font-size:12px;">Ajoutez des recettes depuis les fiches.</div>
      </div>`;
    return;
  }
  container.innerHTML = listeCourses.map((section, si) => `
    <div class="course-section">
      <div class="course-section-title">Pour — ${section.titre}</div>
      ${section.articles.map((a, ai) => `
        <div class="course-item">
          <div class="course-check ${a.fait ? 'checked' : ''}" onclick="toggleCoursesCheck(${si},${ai},this)">${a.fait ? '✓' : ''}</div>
          <div class="course-name ${a.fait ? 'checked' : ''}">${a.nom}</div>
          <div class="course-qty">${a.qte}</div>
        </div>`
      ).join('')}
    </div>`
  ).join('');
}

function toggleCoursesCheck(si, ai, el) {
  listeCourses[si].articles[ai].fait = !listeCourses[si].articles[ai].fait;
  afficherCourses();
}

function addManualCourse() {
  const nom = prompt('Nom de l\'article :');
  if (!nom) return;
  const qte = prompt('Quantité (optionnel) :') || '';
  if (listeCourses.length === 0) listeCourses.push({ titre: 'Manuel', articles: [] });
  listeCourses[listeCourses.length - 1].articles.push({ nom, qte, fait: false });
  afficherCourses();
}

function partagerCoursesWhatsApp() {
  if (listeCourses.length === 0) { showToast('Votre liste est vide'); return; }
  let txt = '🛒 *Ma liste de courses Cuisinière 2.0*\n\n';
  listeCourses.forEach(s => {
    txt += `*${s.titre}*\n`;
    s.articles.forEach(a => {
      txt += `${a.fait ? '✅' : '⬜'} ${a.nom}${a.qte ? ' — ' + a.qte : ''}\n`;
    });
    txt += '\n';
  });
  const url = 'https://wa.me/?text=' + encodeURIComponent(txt);
  window.open(url, '_blank');
}

// ─── PARTAGE WHATSAPP RECETTE ─────────────────────────────
function partagerWhatsApp() {
  if (!currentRecette) return;
  const txt = `🍽️ *${currentRecette.nom}* — Cuisinière 2.0\n\n${currentRecette.description || ''}\n\n⏱ ${currentRecette.temps || '—'} · ${currentRecette.difficulte || '—'}\n\nDécouvrez plus de recettes africaines sur Cuisinière 2.0 !`;
  window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
}

function apprendre() {
  showToast('🎬 Tutoriels bientôt disponibles !');
  showScreen('tutoriels');
}

// ─── COMMENTAIRES ─────────────────────────────────────────
async function chargerCommentaires(recetteId) {
  const el = document.getElementById('commentaires-list');
  if (!el || !window.db) return;
  try {
    const { collection, getDocs, query, where, orderBy } = window.fbStore;
    const q = query(collection(window.db, 'comments'), where('recipeId', '==', recetteId), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    if (snap.empty) { el.innerHTML = '<div style="color:var(--gris);font-size:12px;padding:4px 0;">Aucun avis pour l\'instant. Soyez le premier !</div>'; return; }
    el.innerHTML = '';
    snap.forEach(d => {
      const c = d.data();
      const stars = '⭐'.repeat(c.note || 5);
      el.innerHTML += `
        <div style="background:white;border-radius:12px;padding:12px 14px;margin-bottom:8px;border:1px solid #e8e4de;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <div style="font-size:12px;font-weight:700;">${c.userEmail || 'Utilisateur'}</div>
            <div style="font-size:11px;">${stars}</div>
          </div>
          <div style="font-size:13px;color:var(--texte);line-height:1.5;">${c.text}</div>
        </div>`;
    });
  } catch (e) { console.error('Erreur commentaires:', e); }
}

function toggleCommentaireForm() {
  const el = document.getElementById('commentaire-form');
  if (!el) return;
  if (!currentUser) { showToast('Connectez-vous pour commenter'); return; }
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function publierCommentaire() {
  if (!currentUser || !currentRecette) return;
  const text = document.getElementById('new-comment').value.trim();
  const note = parseInt(document.getElementById('new-note').value);
  if (!text) { showToast('⚠️ Écrivez un commentaire'); return; }
  const { collection, addDoc, serverTimestamp, doc, updateDoc, getDoc } = window.fbStore;
  await addDoc(collection(window.db, 'comments'), {
    recipeId: currentRecette.id,
    userId:   currentUser.uid,
    userEmail: currentUser.email,
    text, note,
    date: serverTimestamp()
  });
  // Ajouter points de réputation
  const userRef = doc(window.db, 'users', currentUser.uid);
  const snap = await getDoc(userRef);
  await updateDoc(userRef, { reputation: (snap.data().reputation || 0) + 5 });
  document.getElementById('new-comment').value = '';
  document.getElementById('commentaire-form').style.display = 'none';
  showToast('✅ Commentaire publié ! +5 points');
  await chargerCommentaires(currentRecette.id);
}

// ─── RECHERCHE ───────────────────────────────────────────
async function rechercherRecettes(terme) {
  const el = document.getElementById('search-results');
  if (!el) return;
  if (!terme || terme.length < 2) {
    el.innerHTML = '<div style="font-size:13px;color:var(--gris);">Tapez pour rechercher...</div>';
    return;
  }
  el.innerHTML = '<div style="font-size:13px;color:var(--gris);">Recherche en cours...</div>';
  try {
    const { collection, getDocs } = window.fbStore;
    const snap = await getDocs(collection(window.db, 'recipes'));
    const t = terme.toLowerCase();
    const resultats = [];
    snap.forEach(d => {
      const r = d.data();
      if (r.statut !== 'approved') return;
      if (r.nom.toLowerCase().includes(t) ||
          (r.description || '').toLowerCase().includes(t) ||
          (r.ingredients || []).some(i => (typeof i === 'object' ? i.nom : i).toLowerCase().includes(t))) {
        resultats.push({ id: d.id, ...r });
      }
    });
    if (resultats.length === 0) {
      el.innerHTML = '<div style="font-size:13px;color:var(--gris);">Aucun résultat pour "' + terme + '"</div>';
      return;
    }
    el.innerHTML = resultats.map(r => `
      <div onclick="ouvrirFiche('${r.id}')" style="display:flex;gap:12px;background:white;border-radius:14px;padding:12px;margin-bottom:8px;border:1px solid #e8e4de;cursor:pointer;">
        <div class="${r.imageEmojiBg || 'bg-ayimolou'}" style="width:52px;height:52px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">${r.imageEmoji || '🍽️'}</div>
        <div>
          <div style="font-size:14px;font-weight:700;">${r.nom}</div>
          <div style="font-size:11px;color:var(--gris);margin-top:2px;">${r.categorie || ''} · ${r.temps || '—'} · ${r.difficulte || '—'}</div>
        </div>
      </div>`
    ).join('');
  } catch (e) { el.innerHTML = '<div style="font-size:13px;color:var(--rouge);">Erreur de recherche.</div>'; }
}

// ─── CHEF IA ─────────────────────────────────────────────
function preparerIA() {
  const dots  = document.getElementById('ia-counter-dots');
  const texte = document.getElementById('ia-counter-text');
  if (!userProfile || !dots || !texte) return;
  if (userProfile.premium) {
    if (texte) texte.textContent = 'Questions illimitées ✨';
    if (dots)  dots.innerHTML = '<div class="ia-dot used" style="background:var(--or);width:20px;border-radius:4px;"></div>';
    return;
  }
  const used = userProfile.questionsToday || 0;
  const rest = Math.max(0, 5 - used);
  if (texte) texte.textContent = `${rest} / 5 questions aujourd'hui`;
  if (dots) {
    dots.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('div');
      d.className = 'ia-dot' + (i < used ? ' used' : '');
      dots.appendChild(d);
    }
  }
}

function sendSuggestion(el) {
  const input = document.getElementById('chat-input');
  if (input) { input.value = el.textContent.trim(); sendMessage(); }
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) return;

  // Vérification limite
  if (currentUser && userProfile && !userProfile.premium) {
    if ((userProfile.questionsToday || 0) >= 5) {
      showToast('⚠️ Limite de 5 questions/jour atteinte. Passez Premium !');
      showScreen('premium');
      return;
    }
  }

  input.value = '';
  appendMessage(msg, 'user');
  appendTyping();

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: 'Tu es Chef IA, assistant culinaire expert en cuisine togolaise et africaine (Ayimolou, Fufu, Djinkoumé, Tô, Kedjenu, Gboma, etc.). Réponds toujours en français. Sois chaleureux, culturellement ancré. Donne des conseils pratiques, des substitutions d\'ingrédients, des versions végétariennes et des estimations caloriques si demandé. Maximum 200 mots par réponse. Si tu ne peux pas répondre, dis-le poliment.',
        messages: [{ role: 'user', content: msg }]
      })
    });

    removeTyping();

    if (!response.ok) throw new Error('API indisponible');
    const data = await response.json();
    const reply = data.content && data.content[0] ? data.content[0].text : 'Désolé, je ne peux pas répondre en ce moment.';
    appendMessage(reply, 'ia');

    // Incrémenter compteur si utilisateur connecté
    if (currentUser && userProfile && !userProfile.premium) {
      const { doc, updateDoc } = window.fbStore;
      const newCount = (userProfile.questionsToday || 0) + 1;
      await updateDoc(doc(window.db, 'users', currentUser.uid), { questionsToday: newCount });
      userProfile.questionsToday = newCount;
      preparerIA();
      majCompteurIA();
    }

  } catch (e) {
    removeTyping();
    appendMessage('Le Chef IA est momentanément indisponible. Réessayez dans quelques instants. 🙏', 'ia');
  }

  // Scroll vers le bas
  const area = document.getElementById('ia-scroll-area');
  if (area) setTimeout(() => { area.scrollTop = area.scrollHeight; }, 100);
}

function appendMessage(text, type) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const div = document.createElement('div');
  if (type === 'user') {
    div.className = 'msg-user';
    div.innerHTML = `<div class="msg-bubble-user">${text.replace(/\n/g, '<br>')}</div>`;
  } else {
    div.className = 'msg-ia';
    div.innerHTML = `<div class="msg-ia-avatar">👩‍🍳</div><div class="msg-bubble-ia">${text.replace(/\n/g, '<br>')}</div>`;
  }
  container.appendChild(div);
}

function appendTyping() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'msg-ia'; div.id = 'typing-indicator';
  div.innerHTML = `<div class="msg-ia-avatar">👩‍🍳</div><div class="msg-bubble-ia msg-typing">En train de préparer une réponse... ⏳</div>`;
  container.appendChild(div);
}

function removeTyping() {
  const t = document.getElementById('typing-indicator');
  if (t) t.remove();
}

// Envoi avec touche Entrée
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('chat-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
  }
  // Listeners formulaire admin
  ['temps-recette','diff-recette','cat-recette'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.addEventListener('change', updatePreview); el.addEventListener('input', updatePreview); }
  });
});

// ─── PROFIL ──────────────────────────────────────────────
function afficherProfil() {
  if (!userProfile || !currentUser) {
    document.getElementById('profil-name').textContent  = 'Non connecté';
    document.getElementById('profil-badge').textContent = '🌍 GRATUIT';
    return;
  }
  const email = currentUser.email;
  const nom   = email.split('@')[0];
  document.getElementById('profil-name').textContent = nom.charAt(0).toUpperCase() + nom.slice(1);

  const isPremium = userProfile.premium;
  const badge = document.getElementById('profil-badge');
  badge.textContent = isPremium ? '👑 PREMIUM' : '🌍 GRATUIT';
  badge.style.background = isPremium ? 'var(--or)' : 'rgba(255,255,255,0.2)';
  badge.style.color      = isPremium ? '#1a1a1e'   : 'white';

  if (isPremium && userProfile.dateFinAbonnement) {
    const date = userProfile.dateFinAbonnement.toDate ? userProfile.dateFinAbonnement.toDate() : new Date(userProfile.dateFinAbonnement);
    document.getElementById('profil-expiry').textContent = 'Abonnement actif jusqu\'au ' + date.toLocaleDateString('fr-FR');
  }

  // Stats
  const favoris  = (userProfile.favoris || []).length;
  const points   = userProfile.reputation || 0;
  document.getElementById('stat-favoris').textContent = favoris;
  document.getElementById('stat-points').textContent  = points;
  document.getElementById('menu-favoris-sub').textContent = favoris + ' recette' + (favoris > 1 ? 's' : '') + ' sauvegardée' + (favoris > 1 ? 's' : '');

  // Chef IA
  const menuIaSub = document.getElementById('menu-ia-sub');
  if (menuIaSub) menuIaSub.textContent = isPremium ? 'Questions illimitées (Premium)' : `${5 - (userProfile.questionsToday || 0)}/5 questions restantes`;

  // Premium sub
  const menuPremiumSub = document.getElementById('menu-premium-sub');
  if (menuPremiumSub) menuPremiumSub.textContent = isPremium ? 'Actif — Gérer mon abonnement' : 'Passer à Premium — 1 200 FCFA / 6 mois';

  // Niveau
  const { nom: lvlNom, min, max, next } = getNiveau(points);
  document.getElementById('level-name').textContent = lvlNom;
  document.getElementById('level-pts').textContent  = points + ' / ' + max + ' pts';
  const pct = Math.min(100, Math.round(((points - min) / (max - min)) * 100));
  document.getElementById('level-fill').style.width  = pct + '%';
  document.getElementById('level-msg').textContent   = next ? 'Plus que ' + (max - points) + ' pts pour atteindre ' + next : '🏆 Niveau maximum !';

  // Admin
  const isAdmin = email === ADMIN_EMAIL;
  document.getElementById('admin-section-title').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('admin-menu-btn').style.display      = isAdmin ? 'flex'  : 'none';
}

function getNiveau(pts) {
  if (pts <= 30) return { nom: '🥄 Apprenti',        min: 0,  max: 30, next: 'Cuisinier' };
  if (pts <= 70) return { nom: '👨‍🍳 Cuisinier',       min: 31, max: 70, next: 'Chef Confirmé' };
  return          { nom: '🏆 Chef Confirmé',           min: 71, max: 200, next: null };
}

function checkPremiumAccess() {
  if (!userProfile || !userProfile.premium) {
    showScreen('premium');
    showToast('👑 Contenu réservé aux abonnés Premium');
  }
}

// ─── PAIEMENT PREMIUM ─────────────────────────────────────
function lancerPaiement() {
  if (!currentUser) { showScreen('auth'); return; }
  // Générer un token UUID et rediriger vers la plateforme de paiement externe
  const token = crypto.randomUUID();
  // Sauvegarder le token dans Firestore avant la redirection
  sauvegarderTokenPaiement(token);
  // ← Remplacez cette URL par votre vraie URL de paiement
  const urlPaiement = `https://votre-plateforme-paiement.tg/checkout?token=${token}&montant=1200&service=cuisiniere2-premium`;
  window.open(urlPaiement, '_blank');
  showToast('Vous allez être redirigé vers la page de paiement 🔒');
}

async function sauvegarderTokenPaiement(token) {
  if (!currentUser || !window.db) return;
  const { collection, addDoc, serverTimestamp } = window.fbStore;
  await addDoc(collection(window.db, 'subscriptions'), {
    userId: currentUser.uid,
    token,
    status: 'pending',
    dateDebut: serverTimestamp(),
    dateFin: null
  });
}

// ─── ACTIVATION PREMIUM (success.html) ───────────────────
// Cette fonction est appelée depuis success.html via le token URL
async function activerPremiumViaToken(token) {
  if (!window.db) return;
  try {
    const { collection, getDocs, query, where, doc, updateDoc, serverTimestamp } = window.fbStore;
    const q = query(collection(window.db, 'subscriptions'), where('token', '==', token), where('status', '==', 'pending'));
    const snap = await getDocs(q);
    if (snap.empty) { showToast('❌ Token invalide ou déjà utilisé'); return; }
    const subDoc = snap.docs[0];
    const sub    = subDoc.data();
    const now    = new Date();
    const dateFin = new Date(now); dateFin.setMonth(dateFin.getMonth() + 6);
    // Activer l'abonnement
    await updateDoc(doc(window.db, 'subscriptions', subDoc.id), {
      status: 'active', dateFin
    });
    // Mettre à jour le profil utilisateur
    await updateDoc(doc(window.db, 'users', sub.userId), {
      premium: true,
      dateFinAbonnement: dateFin
    });
    showScreen('success');
  } catch (e) {
    console.error('Erreur activation premium:', e);
  }
}

// ─── ADMIN ────────────────────────────────────────────────
async function chargerAdminStats() {
  if (!window.db) return;
  try {
    const { collection, getDocs, query, where } = window.fbStore;
    // Total recettes
    const allSnap = await getDocs(collection(window.db, 'recipes'));
    document.getElementById('admin-stat-recettes').textContent = allSnap.size;
    // En attente
    const pendSnap = await getDocs(query(collection(window.db, 'recipes'), where('statut', '==', 'pending')));
    document.getElementById('admin-stat-pending').textContent = pendSnap.size;
    document.getElementById('admin-pending-label').textContent = pendSnap.size + ' en attente';
    // Utilisateurs
    const usersSnap = await getDocs(collection(window.db, 'users'));
    document.getElementById('admin-stat-users').textContent = usersSnap.size;
    // Charger la liste des recettes en attente
    await chargerRecettesEnAttente();
  } catch (e) { console.error('Erreur admin:', e); }
}

async function chargerRecettesEnAttente() {
  if (!window.db) return;
  const el = document.getElementById('admin-pending-list');
  if (!el) return;
  try {
    const { collection, getDocs, query, where } = window.fbStore;
    const snap = await getDocs(query(collection(window.db, 'recipes'), where('statut', '==', 'pending')));
    if (snap.empty) {
      el.innerHTML = '<div style="color:var(--gris);font-size:13px;padding:12px;background:white;border-radius:14px;border:1px solid #e8e4de;">✅ Aucune recette en attente de validation</div>';
      return;
    }
    el.innerHTML = '<div style="background:white;border-radius:16px;overflow:hidden;border:1px solid #e8e4de;">';
    snap.forEach((d, i) => {
      const r = d.data();
      el.innerHTML += `
        <div style="padding:14px 16px;${i > 0 ? 'border-top:1px solid #f0ede6;' : ''}display:flex;align-items:center;gap:12px;">
          <div class="${r.imageEmojiBg || 'bg-ayimolou'}" style="width:40px;height:40px;background:var(--gris2);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">${r.imageEmoji || '🍽️'}</div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:700;">${r.nom}</div>
            <div style="font-size:11px;color:var(--gris);">Par ${r.auteurEmail || 'Utilisateur'}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button onclick="validerRecette('${d.id}',true)" style="background:#dcfce7;color:#166534;border:none;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;">✓</button>
            <button onclick="validerRecette('${d.id}',false)" style="background:#fee2e2;color:#991b1b;border:none;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;">✗</button>
          </div>
        </div>`;
    });
    el.innerHTML += '</div>';
  } catch (e) { el.innerHTML = '<div style="color:var(--rouge);font-size:13px;">Erreur de chargement.</div>'; }
}

async function validerRecette(id, approuver) {
  const { doc, updateDoc } = window.fbStore;
  await updateDoc(doc(window.db, 'recipes', id), { statut: approuver ? 'approved' : 'rejected' });
  showToast(approuver ? '✅ Recette approuvée !' : '❌ Recette refusée');
  await chargerAdminStats();
}

// ─── FORMULAIRE ADMIN — PUBLICATION ──────────────────────
function changeFormPortion(delta) {
  formPortions = Math.max(1, Math.min(50, formPortions + delta));
  document.getElementById('form-portions').textContent = formPortions;
  updateResume();
}

function setAccess(type) {
  accessRecette = type;
  document.getElementById('access-gratuit').classList.toggle('active', type === 'gratuit');
  document.getElementById('access-premium').classList.toggle('active', type === 'premium');
}

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('⚠️ Fichier trop grand (max 5 Mo)'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('uploadPlaceholder').style.display = 'none';
    document.getElementById('uploadPreview').style.display = 'block';
    const img = document.getElementById('previewImg');
    img.src = e.target.result;
    document.getElementById('imgEmoji').style.display = 'none';
    document.getElementById('preview-img-area').innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;" alt="">`;
    document.getElementById('preview-img-area').style.background = 'none';
  };
  reader.readAsDataURL(file);
}

function selectEmojiImg(emoji, bg) {
  selectedEmoji = emoji; selectedBg = bg;
  document.getElementById('uploadPlaceholder').style.display = 'none';
  document.getElementById('uploadPreview').style.display = 'block';
  const emojiEl = document.getElementById('imgEmoji');
  emojiEl.style.display = 'flex'; emojiEl.textContent = emoji;
  ['bg-ayimolou','bg-fufu','bg-djinkoume','bg-grillade','bg-dessert','bg-kedjenu'].forEach(c => emojiEl.classList.remove(c));
  emojiEl.classList.add(bg);
  document.getElementById('previewImg').src = '';
  const previewArea = document.getElementById('preview-img-area');
  ['bg-ayimolou','bg-fufu','bg-djinkoume','bg-grillade','bg-dessert','bg-kedjenu'].forEach(c => previewArea.classList.remove(c));
  previewArea.classList.add(bg); previewArea.style.background = '';
  previewArea.innerHTML = `${emoji}
    <div style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.55);color:white;font-size:9px;padding:2px 7px;border-radius:20px;font-weight:600;" id="preview-time">⏱ —</div>
    <div style="position:absolute;top:8px;left:8px;background:var(--vert);color:white;font-size:9px;padding:2px 7px;border-radius:20px;font-weight:700;" id="preview-diff">⭐ —</div>`;
  document.querySelectorAll('.emoji-img-btn').forEach(b => b.classList.remove('selected'));
  event.target && event.target.classList.add('selected');
}

function updatePreview() {
  const nom  = document.getElementById('nom-recette')?.value  || 'Nom de la recette';
  const desc = document.getElementById('desc-recette')?.value || 'Description de la recette...';
  const temps = document.getElementById('temps-recette')?.value || '—';
  const diff  = document.getElementById('diff-recette')?.value  || '—';
  const titleEl = document.getElementById('preview-title');
  const descEl  = document.getElementById('preview-desc');
  const timeEl  = document.getElementById('preview-time');
  const diffEl  = document.getElementById('preview-diff');
  if (titleEl) titleEl.textContent = nom;
  if (descEl)  descEl.textContent  = desc;
  if (timeEl)  timeEl.textContent  = `⏱ ${temps}`;
  if (diffEl)  diffEl.textContent  = diff || '⭐ —';
  updateResume();
}

function addIngredient() {
  ingCount++;
  const list = document.getElementById('ingredients-list');
  const row  = document.createElement('div');
  row.className = 'ingredient-row'; row.dataset.id = ingCount;
  row.innerHTML = `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
    <div style="width:24px;height:24px;background:var(--vert);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;" class="ing-num">${ingCount}</div>
    <input class="form-input ing-name" type="text" placeholder="Nom de l'ingrédient" style="flex:2;">
    <input class="form-input ing-qty"  type="text" placeholder="Qté" style="flex:1;min-width:0;">
    <button onclick="removeIngredient(this)" style="width:28px;height:28px;background:#fee2e2;color:#dc2626;border:none;border-radius:8px;font-size:14px;cursor:pointer;flex-shrink:0;">✕</button>
  </div>`;
  list.appendChild(row);
  row.querySelector('.ing-name').focus();
  renumberIngredients();
}

function removeIngredient(btn) {
  if (document.querySelectorAll('.ingredient-row').length <= 1) return;
  btn.closest('.ingredient-row').remove();
  renumberIngredients();
}

function renumberIngredients() {
  document.querySelectorAll('.ingredient-row').forEach((r, i) => {
    const n = r.querySelector('.ing-num');
    if (n) n.textContent = i + 1;
  });
}

function addQuickIng(name) {
  const inputs = document.querySelectorAll('.ing-name');
  for (let inp of inputs) {
    if (!inp.value.trim()) { inp.value = name; inp.focus(); return; }
  }
  addIngredient();
  setTimeout(() => {
    const ins = document.querySelectorAll('.ing-name');
    ins[ins.length - 1].value = name;
  }, 50);
}

function addEtape() {
  etapeCount++;
  const list = document.getElementById('etapes-list');
  const row  = document.createElement('div');
  row.className = 'etape-form-row'; row.dataset.id = etapeCount;
  row.innerHTML = `<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px;">
    <div style="width:28px;height:28px;background:var(--vert);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;margin-top:4px;" class="etape-num">${etapeCount}</div>
    <div style="flex:1;">
      <textarea class="form-input form-textarea" placeholder="Décrivez cette étape..." style="min-height:70px;"></textarea>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <span style="font-size:11px;color:var(--gris);">⏱ Durée :</span>
        <input type="text" class="form-input etape-duree" placeholder="Ex: 15 min" style="width:100px;padding:6px 10px;">
      </div>
    </div>
    <button onclick="removeEtape(this)" style="width:28px;height:28px;background:#fee2e2;color:#dc2626;border:none;border-radius:8px;font-size:14px;cursor:pointer;flex-shrink:0;margin-top:4px;">✕</button>
  </div>`;
  list.appendChild(row);
  row.querySelector('textarea').focus();
  renumberEtapes();
}

function removeEtape(btn) {
  if (document.querySelectorAll('.etape-form-row').length <= 1) return;
  btn.closest('.etape-form-row').remove();
  renumberEtapes();
}

function renumberEtapes() {
  document.querySelectorAll('.etape-form-row').forEach((r, i) => {
    const n = r.querySelector('.etape-num');
    if (n) n.textContent = i + 1;
  });
}

function addCourse() {
  const list = document.getElementById('courses-list');
  const row  = document.createElement('div');
  row.className = 'course-form-row';
  row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;';
  row.innerHTML = `
    <div style="width:22px;height:22px;background:var(--vert3);border:1.5px solid var(--vert2);border-radius:6px;flex-shrink:0;"></div>
    <input class="form-input" type="text" placeholder="Article" style="flex:2;">
    <input class="form-input" type="text" placeholder="Qté" style="flex:1;min-width:0;">
    <button onclick="removeCourse(this)" style="width:28px;height:28px;background:#fee2e2;color:#dc2626;border:none;border-radius:8px;font-size:14px;cursor:pointer;flex-shrink:0;">✕</button>`;
  list.appendChild(row);
  row.querySelector('input').focus();
}

function removeCourse(btn) {
  if (document.querySelectorAll('.course-form-row').length <= 1) return;
  btn.closest('.course-form-row').remove();
}

function updateResume() {
  const nom    = document.getElementById('nom-recette')?.value   || '—';
  const cat    = document.getElementById('cat-recette')?.value   || '—';
  const diff   = document.getElementById('diff-recette')?.value  || '—';
  const temps  = document.getElementById('temps-recette')?.value || '—';
  const nbIng  = document.querySelectorAll('.ing-name').length;
  const nbEtapes = document.querySelectorAll('.etape-form-row').length;
  const el = document.getElementById('resume-summary');
  if (el) el.innerHTML = `📌 <strong>${nom}</strong><br>📁 Catégorie : ${cat}<br>⭐ Difficulté : ${diff}<br>⏱ Durée : ${temps} · 👥 ${formPortions} personnes<br>🧄 ${nbIng} ingrédient(s) · 📋 ${nbEtapes} étape(s)`;
}

async function publierRecette() {
  const nom = document.getElementById('nom-recette')?.value?.trim();
  if (!nom) { showToast('⚠️ Veuillez saisir le nom de la recette'); return; }

  const btn = document.getElementById('btn-publier');
  if (btn) { btn.textContent = '⏳ Publication...'; btn.disabled = true; }

  try {
    // Collecter les ingrédients
    const ingredients = [];
    document.querySelectorAll('.ingredient-row').forEach(row => {
      const n = row.querySelector('.ing-name')?.value?.trim();
      const q = row.querySelector('.ing-qty')?.value?.trim();
      if (n) ingredients.push({ nom: n, qte: q || '' });
    });

    // Collecter les étapes
    const etapes = [];
    document.querySelectorAll('.etape-form-row').forEach(row => {
      const t = row.querySelector('textarea')?.value?.trim();
      const d = row.querySelector('.etape-duree')?.value?.trim();
      if (t) etapes.push({ texte: t, duree: d || '' });
    });

    // Collecter les courses
    const courses = [];
    document.querySelectorAll('.course-form-row').forEach(row => {
      const inputs = row.querySelectorAll('input');
      const article = inputs[0]?.value?.trim();
      const qte     = inputs[1]?.value?.trim();
      if (article) courses.push({ article, qte: qte || '' });
    });

    // Uploader l'image si nécessaire
    let imageUrl  = '';
    const imgFile = document.getElementById('fileInput')?.files[0];
    if (imgFile && window.storage) {
      const { ref, uploadBytes, getDownloadURL } = window.fbStorage;
      const storageRef = ref(window.storage, `recipes/${Date.now()}_${imgFile.name}`);
      await uploadBytes(storageRef, imgFile);
      imageUrl = await getDownloadURL(storageRef);
    }

    const { collection, addDoc, serverTimestamp } = window.fbStore;
    await addDoc(collection(window.db, 'recipes'), {
      nom,
      description: document.getElementById('desc-recette')?.value?.trim() || '',
      categorie:   document.getElementById('cat-recette')?.value  || '',
      difficulte:  document.getElementById('diff-recette')?.value || '',
      temps:       document.getElementById('temps-recette')?.value?.trim() || '',
      portions:    formPortions,
      premium:     accessRecette === 'premium',
      ingredients,
      etapes,
      courses,
      imageUrl,
      imageEmoji:   selectedEmoji,
      imageEmojiBg: selectedBg,
      statut:      'approved',
      auteurId:    currentUser ? currentUser.uid : 'admin',
      auteurEmail: currentUser ? currentUser.email : 'admin',
      createdAt:   serverTimestamp()
    });

    const cat    = document.getElementById('cat-recette')?.value   || '—';
    const diff   = document.getElementById('diff-recette')?.value  || '—';
    const temps  = document.getElementById('temps-recette')?.value || '—';
    document.getElementById('confirm-nom').textContent = `"${nom}"`;
    document.getElementById('confirm-details').innerHTML = `📁 Catégorie : ${cat}<br>⭐ Difficulté : ${diff}<br>⏱ Durée : ${temps}<br>👥 Pour ${formPortions} personnes`;
    showScreen('confirmation');

  } catch (e) {
    console.error('Erreur publication:', e);
    showToast('❌ Erreur lors de la publication : ' + e.message);
  } finally {
    if (btn) { btn.textContent = '✅ Publier la recette'; btn.disabled = false; }
  }
}

async function sauvegarderBrouillon() {
  const nom = document.getElementById('nom-recette')?.value || 'Sans titre';
  showToast(`💾 Brouillon "${nom}" sauvegardé !`);
}

function resetFormAndNew() {
  document.getElementById('nom-recette').value  = '';
  document.getElementById('desc-recette').value = '';
  document.getElementById('cat-recette').value  = '';
  document.getElementById('diff-recette').value = '';
  document.getElementById('temps-recette').value = '';
  formPortions = 4;
  ingCount = 2; etapeCount = 1;
  accessRecette = 'gratuit';
  document.getElementById('form-portions').textContent = '4';
  document.getElementById('access-gratuit').classList.add('active');
  document.getElementById('access-premium').classList.remove('active');
  showScreen('ajouter-recette');
  updatePreview();
}

// ─── TOGGLE COURSES (page courses) ───────────────────────
function toggleCheck(el) {
  el.classList.toggle('checked');
  el.textContent = el.classList.contains('checked') ? '✓' : '';
  const nameEl = el.nextElementSibling;
  if (nameEl) nameEl.classList.toggle('checked');
}

// ─── VÉRIFICATION TOKEN SUCCESS (success.html) ───────────
// À appeler depuis success.html :
// const token = new URLSearchParams(window.location.search).get('token');
// if (token) activerPremiumViaToken(token);
