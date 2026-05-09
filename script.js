// ===== COUNTDOWN — Copa do Mundo 2026 (11 jun 2026) =====
function updateCountdown() {
  const target = new Date('2026-06-11T00:00:00');
  const now = new Date();
  const diff = target - now;
  if (diff <= 0) {
    ['cd-days','cd-hours','cd-mins','cd-secs'].forEach(id => {
      document.getElementById(id).textContent = '00';
    });
    return;
  }
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins  = Math.floor((diff % 3600000) / 60000);
  const secs  = Math.floor((diff % 60000) / 1000);
  document.getElementById('cd-days').textContent  = String(days).padStart(2,'0');
  document.getElementById('cd-hours').textContent = String(hours).padStart(2,'0');
  document.getElementById('cd-mins').textContent  = String(mins).padStart(2,'0');
  document.getElementById('cd-secs').textContent  = String(secs).padStart(2,'0');
}
updateCountdown();
setInterval(updateCountdown, 1000);

// ===== HAMBURGER =====
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('navLinks');
hamburger.addEventListener('click', () => navLinks.classList.toggle('open'));
navLinks.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => navLinks.classList.remove('open'));
});

// ===== FAQ =====
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item   = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

// ===== FADE-UP ON SCROLL =====
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

// ===== TOAST =====
function showToast(msg) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `
    position:fixed;bottom:32px;left:50%;transform:translateX(-50%) translateY(20px);
    background:linear-gradient(135deg,#0d2e12,#1a5c2a);
    color:#fbbf24;border:1px solid rgba(251,191,36,0.4);
    padding:14px 28px;border-radius:6px;
    font-family:'Barlow Condensed',sans-serif;
    font-size:.95rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
    box-shadow:0 8px 32px rgba(0,0,0,.5);
    z-index:9999;opacity:0;transition:all .35s ease;white-space:nowrap;max-width:90vw;
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

// ===== CHECKOUT & MODAL LOGIC =====
const modal = document.getElementById('checkoutModal');
const closeBtn = document.getElementById('closeModal');
const form = document.getElementById('checkoutForm');
const selGroup = document.getElementById('selecaoGroup');
const selSelect = document.getElementById('selecaoId');
const modalTitle = document.getElementById('modalTitle');
const modalPreco = document.getElementById('modalPreco');
const inputSlug = document.getElementById('pacoteSlug');

// Mock preços (na vida real isso viria do back)
const PACOTES = {
  'pacotinho': { nome: 'Pacotinho', preco: 4.00, slug: 'pacotinho', type: 'base' },
  'equipe': { nome: 'Equipe Completa', preco: 34.00, slug: 'equipe-completa', type: 'selecao' },
  'completo': { nome: 'Coleção Completa', preco: 349.00, slug: 'pacote-completo', type: 'base' },
  'especiais': { nome: 'Pack Especiais', preco: 79.00, slug: 'pack-especiais', type: 'base' },
  'ultimate': { nome: 'Tudo Incluso', preco: 399.00, slug: 'ultimate', type: 'base' }
};

// Abre modal
document.querySelectorAll('[id^="btn-"]').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    const id = btn.id.replace('btn-', '');
    const pack = PACOTES[id];
    if (!pack) return showToast('Pacote não encontrado.');

    modalTitle.textContent = pack.nome;
    modalPreco.textContent = `— R$ ${pack.preco.toFixed(2)}`;
    inputSlug.value = pack.slug;
    
    // Mostra combo de seleção se for pacote de equipe
    if (pack.type === 'selecao') {
      selGroup.style.display = 'block';
      selSelect.required = true;
      if (selSelect.children.length === 0) {
        selSelect.innerHTML = '<option value="">Carregando seleções...</option>';
        try {
          const res = await fetch('https://bnmarcfzarqdbjacpslj.supabase.co/rest/v1/selecoes?select=id,nome,codigo&order=nome', {
            headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubWFyY2Z6YXJxZGJqYWNwc2xqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMDg3MjEsImV4cCI6MjA5Mzg4NDcyMX0.Jw_4buYnRafB_FZK3hH2naetI5khs9qC3SId7AGPa28' }
          });
          const data = await res.json();
          selSelect.innerHTML = '<option value="">Selecione uma seleção...</option>' + 
            data.map(s => `<option value="${s.id}">${s.nome}</option>`).join('');
        } catch(e) {
          selSelect.innerHTML = '<option value="">Erro ao carregar</option>';
        }
      }
    } else {
      selGroup.style.display = 'none';
      selSelect.required = false;
    }

    modal.classList.add('open');
  });
});

closeBtn.addEventListener('click', () => {
  modal.classList.remove('open');
  document.getElementById('pixArea').style.display = 'none';
  form.style.display = 'block';
});

// Submit Form (Gerar PIX)
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const payload = {
    nome: document.getElementById('nome').value,
    email: document.getElementById('email').value,
    cpf: document.getElementById('cpf').value,
    cupom: document.getElementById('cupom').value,
    pacote_slug: inputSlug.value,
    selecao_id: selSelect.required ? parseInt(selSelect.value) : null
  };

  const btnPagar = document.getElementById('btnPagar');
  const loader = document.getElementById('loader');
  
  btnPagar.style.display = 'none';
  loader.style.display = 'block';

  try {
    const res = await fetch('https://bnmarcfzarqdbjacpslj.supabase.co/functions/v1/checkout-pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao processar');

    // Sucesso - Mostra PIX
    form.style.display = 'none';
    const pixArea = document.getElementById('pixArea');
    document.getElementById('pixQrImg').src = data.pix.qrcode_imagem;
    document.getElementById('pixCodeText').textContent = data.pix.qrcode;
    pixArea.style.display = 'block';
    
    document.getElementById('pixStatusMsg').style.display = 'block';
    
    // Inicia verificação contínua
    pollPixStatus(data.pix.txid, data.pedido_id);
    
  } catch(err) {
    showToast(err.message);
    btnPagar.style.display = 'block';
  } finally {
    loader.style.display = 'none';
  }
});

// Copiar PIX
document.getElementById('btnCopyPix').addEventListener('click', () => {
  const code = document.getElementById('pixCodeText').textContent;
  navigator.clipboard.writeText(code);
  showToast('Código PIX copiado!');
});

// Verifica status do PIX
async function pollPixStatus(txid, pedido_id) {
  let attempts = 0;
  const interval = setInterval(async () => {
    attempts++;
    if (attempts > 30) { // 30 min (1 verif/min)
      clearInterval(interval);
      return;
    }
    try {
      const res = await fetch('https://bnmarcfzarqdbjacpslj.supabase.co/functions/v1/webhook-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txid, pedido_id })
      });
      const data = await res.json();
      if (data.paid) {
        clearInterval(interval);
        document.getElementById('pixStatusMsg').textContent = '✅ Pagamento Confirmado! Seus PDFs foram enviados para o e-mail.';
        document.getElementById('pixStatusMsg').style.color = 'var(--gold)';
        document.getElementById('btnCopyPix').style.display = 'none';
        showToast('Pagamento confirmado! Olhe seu e-mail.');
      }
    } catch(e) {}
  }, 5000); // testa a cada 5s
}

