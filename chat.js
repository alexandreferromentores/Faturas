// ─── chat.js ──────────────────────────────────────────────────────────────────
// Assistente IA: histórico de conversa e chamadas à API.

let chatHistory = [];

function initChat() {
  const msgs = document.getElementById('chat-msgs');
  if (msgs.children.length === 0) {
    addChatMsg('ai', 'Olá! Sou o teu assistente financeiro. Pergunta-me sobre faturas pendentes, cash flow, vencimentos ou qualquer outra questão.');
  }
}

function addChatMsg(role, text) {
  const msgs = document.getElementById('chat-msgs');
  const div  = document.createElement('div');
  div.className   = 'chat-msg ' + role;
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

async function sendChat() {
  const inp = document.getElementById('chat-inp');
  const q   = inp.value.trim();
  if (!q) return;
  if (!config.apiKey) { toast('Configura a API Key primeiro', 'error'); return; }

  inp.value = '';
  addChatMsg('user', q);
  document.getElementById('chat-btn').disabled = true;
  chatHistory.push({ role: 'user', content: q });

  // Contexto financeiro atual para o assistente
  const fornecedores = invoices.filter(i => !isClient(i));
  const clientes     = invoices.filter(i => isClient(i));
  const aPagar   = fornecedores.filter(i => !isPaid(i)).reduce((s, i) => s + toNum(i.total), 0);
  const aReceber = clientes.filter(i => !isPaid(i)).reduce((s, i) => s + toNum(i.total), 0);
  const ctx = [
    `A pagar: ${fmt(aPagar)} (${fornecedores.filter(i => !isPaid(i)).length} faturas).`,
    `A receber: ${fmt(aReceber)} (${clientes.filter(i => !isPaid(i)).length} faturas).`,
    `Vencidas: ${invoices.filter(isOverdue).length}.`,
    `Pastas: ${pastas.map(p => p.nome).join(', ') || 'nenhuma'}.`,
    `Total faturas: ${invoices.length}.`,
  ].join(' ');

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: 'És um assistente financeiro para gestão de faturas de uma PME portuguesa. Responde em português europeu, de forma concisa e direta. Dados actuais: ' + ctx,
        messages: chatHistory,
      }),
    });
    const d     = await resp.json();
    const reply = d.content?.[0]?.text || 'Sem resposta.';
    chatHistory.push({ role: 'assistant', content: reply });
    addChatMsg('ai', reply);
  } catch (e) {
    addChatMsg('ai', 'Erro ao processar a pergunta.');
  }

  document.getElementById('chat-btn').disabled = false;
}
