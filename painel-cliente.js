/**
 * Estado do painel de atendimento humano.
 *
 * Guarda em memória (e persiste em disco pra sobreviver a reinícios do bot):
 *   - quais conversas estão "pausadas" (atendente assumiu, bot não responde)
 *   - nomes de exibição por conversa (pra aparecer nome, não número/JID)
 *   - as últimas mensagens de cada conversa, pra listar no painel
 *
 * Esse arquivo é usado tanto pelo bot.js (pra saber se deve responder ou
 * não) quanto pelo painel-server.js (pra alimentar a API que o painel web
 * ou app Android consultam).
 */

const fs = require('fs');
const path = require('path');

const ESTADO_PATH = path.join(__dirname, 'painel-estado.json');
const MAX_MENSAGENS_POR_CONVERSA = 50;

// Depois de quantos minutos sem atividade uma conversa pausada volta
// sozinha a ser respondida pelo bot (segurança, caso o atendente esqueça
// de devolver). Ajuste como quiser, ou remova a checagem se não quiser isso.
const AUTO_DEVOLVER_MINUTOS = 60;

let estado = {
  conversas: {}, // jid -> { nome, pausado, pausadoEm, ultimaAtividade, mensagens: [] }
};

function carregarEstado() {
  try {
    const conteudo = fs.readFileSync(ESTADO_PATH, 'utf-8');
    estado = JSON.parse(conteudo);
    if (!estado.conversas) estado.conversas = {};
  } catch (erro) {
    estado = { conversas: {} };
  }
}

function salvarEstado() {
  try {
    fs.writeFileSync(ESTADO_PATH, JSON.stringify(estado, null, 2), 'utf-8');
  } catch (erro) {
    console.error('Não consegui salvar painel-estado.json:', erro.message);
  }
}

carregarEstado();

// Canal padrão quando não informado, pra manter compatibilidade com
// conversas antigas (todas eram WhatsApp antes do Instagram existir aqui).
const CANAL_PADRAO = 'whatsapp';

function obterOuCriarConversa(jid, canal) {
  if (!estado.conversas[jid]) {
    estado.conversas[jid] = {
      nome: canal === 'instagram' ? String(jid) : formatarNumeroComoNome(jid),
      canal: canal || CANAL_PADRAO,
      pausado: false,
      pausadoEm: null,
      ultimaAtividade: Date.now(),
      mensagens: [],
    };
  } else if (canal && !estado.conversas[jid].canal) {
    // Conversa antiga (de antes do multi-canal) sem campo "canal" salvo.
    estado.conversas[jid].canal = canal;
  }
  return estado.conversas[jid];
}

// Enquanto não tem nome salvo (nem veio do WhatsApp), mostra pelo menos o
// número formatado de um jeito legível, em vez do JID cru cheio de sufixo.
function formatarNumeroComoNome(jid) {
  const numero = String(jid || '').split('@')[0];
  return numero ? `+${numero}` : jid;
}

/**
 * Chamado pelo bot.js (ou pelo index.js, no caso do Instagram) sempre que
 * chega uma mensagem nova do cliente. Atualiza nome (se veio um nome de
 * contato/perfil), histórico e atividade.
 *
 * `canal` é 'whatsapp' ou 'instagram' — usado só na primeira vez que essa
 * conversa é criada (não muda o canal de uma conversa já existente).
 */
function registrarMensagemRecebida(jid, texto, nomeContato, canal) {
  const conversa = obterOuCriarConversa(jid, canal);
  if (nomeContato) conversa.nome = nomeContato;
  conversa.ultimaAtividade = Date.now();

  conversa.mensagens.push({
    de: 'cliente',
    texto,
    timestamp: Date.now(),
  });
  if (conversa.mensagens.length > MAX_MENSAGENS_POR_CONVERSA) {
    conversa.mensagens.shift();
  }

  verificarAutoDevolucao(jid);
  salvarEstado();
}

/**
 * Chamado pelo bot.js sempre que o bot manda uma resposta automática,
 * só pra aparecer no histórico do painel também.
 */
function registrarMensagemBot(jid, texto) {
  const conversa = obterOuCriarConversa(jid);
  conversa.mensagens.push({
    de: 'bot',
    texto,
    timestamp: Date.now(),
  });
  if (conversa.mensagens.length > MAX_MENSAGENS_POR_CONVERSA) {
    conversa.mensagens.shift();
  }
  salvarEstado();
}

/**
 * Chamado pelo painel (via painel-server.js) quando o atendente digita e
 * manda manualmente pelo próprio WhatsApp — usado só pra manter o
 * histórico do painel completo (não envia nada, quem envia é o WhatsApp
 * do celular do atendente).
 *
 * `nomeAtendente` vem da sessão de login de quem está usando o painel
 * (veja painel-usuarios.js), pra cada mensagem mostrar quem exatamente
 * respondeu, não só "atendente" genérico.
 */
function registrarMensagemAtendente(jid, texto, nomeAtendente) {
  const conversa = obterOuCriarConversa(jid);
  conversa.mensagens.push({
    de: 'atendente',
    texto,
    atendente: nomeAtendente || null,
    timestamp: Date.now(),
  });
  if (conversa.mensagens.length > MAX_MENSAGENS_POR_CONVERSA) {
    conversa.mensagens.shift();
  }
  salvarEstado();
}

function pausar(jid) {
  const conversa = obterOuCriarConversa(jid);
  conversa.pausado = true;
  conversa.pausadoEm = Date.now();
  salvarEstado();
}

function devolverParaBot(jid) {
  const conversa = obterOuCriarConversa(jid);
  conversa.pausado = false;
  conversa.pausadoEm = null;
  salvarEstado();
}

function estaPausado(jid) {
  verificarAutoDevolucao(jid);
  const conversa = estado.conversas[jid];
  return !!(conversa && conversa.pausado);
}

function verificarAutoDevolucao(jid) {
  const conversa = estado.conversas[jid];
  if (!conversa || !conversa.pausado || !conversa.pausadoEm) return;

  const minutosPausado = (Date.now() - conversa.pausadoEm) / 1000 / 60;
  if (minutosPausado >= AUTO_DEVOLVER_MINUTOS) {
    conversa.pausado = false;
    conversa.pausadoEm = null;
  }
}

function listarConversas(canal) {
  return Object.entries(estado.conversas)
    .map(([jid, dados]) => ({
      jid,
      nome: dados.nome,
      canal: dados.canal || CANAL_PADRAO,
      pausado: dados.pausado,
      pausadoEm: dados.pausadoEm,
      ultimaAtividade: dados.ultimaAtividade,
      ultimaMensagem: dados.mensagens[dados.mensagens.length - 1] || null,
    }))
    .filter((c) => !canal || c.canal === canal)
    .sort((a, b) => (b.ultimaAtividade || 0) - (a.ultimaAtividade || 0));
}

function obterConversa(jid) {
  const conversa = estado.conversas[jid];
  if (!conversa) return null;
  return { jid, canal: conversa.canal || CANAL_PADRAO, ...conversa };
}

function renomearConversa(jid, novoNome) {
  const conversa = obterOuCriarConversa(jid);
  conversa.nome = novoNome;
  salvarEstado();
}

module.exports = {
  registrarMensagemRecebida,
  registrarMensagemBot,
  registrarMensagemAtendente,
  pausar,
  devolverParaBot,
  estaPausado,
  listarConversas,
  obterConversa,
  renomearConversa,
};