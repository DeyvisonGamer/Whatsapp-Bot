const express = require('express');
const path = require('path');
const localtunnel = require('localtunnel'); 
const {
  listarConversas,
  obterConversa,
  pausar,
  devolverParaBot,
  renomearConversa,
  registrarMensagemAtendente,
} = require('./painel-cliente');
const {
  verificarLogin,
  criarSessao,
  obterSessao,
  encerrarSessao,
} = require('./painel-usuarios');
const {
  enviarMensagemInstagram,
} = require('./instagram');

// SUBDOMÍNIO FIXO E EXCLUSIVO (NUNCA MUDA):
const SUBDOMINIO_FIXO = 'luz-e-brilho-painel-7998851930';

// PAINEL_TOKEN é opcional e continua funcionando como uma camada extra
// (ex: se você quiser barrar o acesso mesmo antes da tela de login). O
// login de atendente (usuarios.json / criar-usuario.js) é quem garante que
// cada mensagem mandada pelo painel fique com o nome de quem mandou.
const TOKEN = process.env.PAINEL_TOKEN || null;
const app = express();

// Função (passada por index.js) que devolve o socket ativo do WhatsApp no
// momento. É uma função, e não o socket direto, porque o bot reconecta
// sozinho quando cai e o socket antigo fica inválido.
let obterSock = null;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Guarda o corpo bruto (antes do parse) em req.rawBody, necessário pra
// validar a assinatura HMAC que a Meta manda no webhook do Instagram
// (X-Hub-Signature-256). Não afeta as outras rotas, que continuam
// recebendo req.body normalmente via express.json().
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
app.use(express.static(path.join(__dirname, 'public')));

// A raiz do site ("/") não abria nada porque o arquivo se chama painel.html
// e não index.html (o express.static só serve index.html sozinho). Agora
// "/" entrega o painel direto.
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'painel.html')));

// Endpoint de saúde, público (sem token), usado pela própria checagem
// automática do túnel pra saber se ele ainda está de pé.
app.get('/health', (req, res) => res.json({ ok: true, hora: new Date().toISOString() }));

// O Instagram agora é feito via Puppeteer (instagram.js), que fica de olho
// no Direct sozinho e chama processarMensagemInstagram diretamente — não
// depende mais de webhook nenhum aqui no painel.

function checarToken(req, res, next) {
  if (!TOKEN) return next();
  const auth = req.headers.authorization || '';
  if (auth === `Bearer ${TOKEN}`) return next();
  return res.status(401).json({ erro: 'Não autorizado' });
}

// --- Login de atendente ---
// Rota pública (não passa pelo checarSessao, senão ninguém conseguiria
// logar). Continua atrás do checarToken acima se PAINEL_TOKEN estiver
// configurado.
app.use('/api/login', checarToken);
app.post('/api/login', (req, res) => {
  const { usuario, senha } = req.body || {};
  if (!usuario || !senha) {
    return res.status(400).json({ erro: 'Informe usuário e senha.' });
  }

  const dados = verificarLogin(usuario, senha);
  if (!dados) {
    return res.status(401).json({ erro: 'Usuário ou senha incorretos.' });
  }

  const token = criarSessao(dados.usuario, dados.nome);
  res.json({ ok: true, token, usuario: dados.usuario, nome: dados.nome });
});

// Todas as outras rotas /api exigem sessão de atendente logado (além do
// PAINEL_TOKEN, se estiver configurado).
function checarSessao(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const sessao = obterSessao(token);
  if (!sessao) {
    return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login novamente.' });
  }
  req.atendente = sessao; // { usuario, nome }
  next();
}

app.post('/api/logout', checarToken, (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  encerrarSessao(token);
  res.json({ ok: true });
});

app.use('/api', checarToken);
app.use('/api', checarSessao);

// Usado pelo painel.html pra confirmar (ao abrir a página) que o token
// salvo no navegador ainda é válido, e pra saber o nome de quem está logado.
app.get('/api/eu', (req, res) => res.json({ usuario: req.atendente.usuario, nome: req.atendente.nome }));

// ?canal=whatsapp ou ?canal=instagram filtra a lista; sem o parâmetro,
// devolve todas (usado pra manter compatibilidade com clientes antigos).
app.get('/api/conversas', (req, res) => res.json(listarConversas(req.query.canal || null)));
app.get('/api/conversas/:jid', (req, res) => {
  const conversa = obterConversa(decodeURIComponent(req.params.jid));
  if (!conversa) return res.status(404).json({ erro: 'Conversa não encontrada' });
  res.json(conversa);
});
app.post('/api/conversas/:jid/assumir', (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  pausar(jid);
  res.json({ ok: true, jid, pausado: true });
});
app.post('/api/conversas/:jid/devolver', (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  devolverParaBot(jid);
  res.json({ ok: true, jid, pausado: false });
});
app.post('/api/conversas/:jid/renomear', (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  const { nome } = req.body;
  if (!nome || !nome.trim()) return res.status(400).json({ erro: 'Nome vazio' });
  renomearConversa(jid, nome.trim());
  res.json({ ok: true, jid, nome: nome.trim() });
});
// Envia a mensagem de verdade pelo WhatsApp do bot (via Baileys) e só
// depois registra no histórico do painel. Assim o atendente responde
// direto pelo painel, sem precisar ter o WhatsApp dele mesmo aberto.
// Também pausa a conversa automaticamente, pra o bot não responder por
// cima logo em seguida.
app.post('/api/conversas/:jid/mensagem-atendente', async (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  const { texto } = req.body;
  if (!texto || !texto.trim()) return res.status(400).json({ erro: 'Texto vazio' });

  const conversa = obterConversa(jid);
  const canal = conversa?.canal || 'whatsapp';

  if (canal === 'instagram') {
    try {
      await enviarMensagemInstagram(jid, texto.trim());
    } catch (erro) {
      console.error('❌ Erro ao enviar mensagem pelo painel (Instagram):', erro.message);
      return res.status(500).json({ erro: 'Falha ao enviar a mensagem pelo Instagram.' });
    }
  } else {
    const sock = typeof obterSock === 'function' ? obterSock() : null;
    if (!sock) {
      return res.status(503).json({ erro: 'O bot ainda não está conectado ao WhatsApp. Aguarde e tente de novo.' });
    }

    try {
      await sock.sendMessage(jid, { text: texto.trim() });
    } catch (erro) {
      console.error('❌ Erro ao enviar mensagem pelo painel:', erro.message);
      return res.status(500).json({ erro: 'Falha ao enviar a mensagem pelo WhatsApp.' });
    }
  }

  pausar(jid);
  registrarMensagemAtendente(jid, texto.trim(), req.atendente?.nome);
  res.json({ ok: true });
});

// FUNÇÃO PARA CRIAR E RECONECTAR O TÚNEL AUTOMATICAMENTE
const URL_TUNEL_FIXO = `https://${SUBDOMINIO_FIXO}.loca.lt`;
const INTERVALO_CHECAGEM_MS = 45000; // checa a saúde do túnel a cada 45s
const TIMEOUT_CHECAGEM_MS = 12000; // timeout de cada checagem

let tunnelAtual = null;
let reconectando = false;
let intervaloChecagem = null;
let portaLocal = 24629; // atualizado em iniciarPainel() com a porta real do servidor

/**
 * Faz uma requisição de fora pra dentro (pela própria URL pública do
 * túnel) pra confirmar que ele está realmente entregando tráfego, e não
 * só "pendurado" no lado do processo local. O header
 * "Bypass-Tunnel-Reminder" é necessário pra localtunnel não devolver a
 * página de aviso em vez da resposta real.
 */
async function tunelEstaSaudavel() {
  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), TIMEOUT_CHECAGEM_MS);

  try {
    const resposta = await fetch(`${URL_TUNEL_FIXO}/health`, {
      headers: { 'Bypass-Tunnel-Reminder': '1' },
      signal: controlador.signal,
    });
    return resposta.ok;
  } catch (erro) {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

function pararChecagemPeriodica() {
  if (intervaloChecagem) {
    clearInterval(intervaloChecagem);
    intervaloChecagem = null;
  }
}

function iniciarChecagemPeriodica() {
  pararChecagemPeriodica();
  intervaloChecagem = setInterval(async () => {
    if (reconectando) return;

    const saudavel = await tunelEstaSaudavel();
    if (!saudavel) {
      console.log('⚠️  Checagem periódica detectou o túnel fora do ar (ex: 503 Tunnel Unavailable). Forçando reconexão...');
      forcarReconexao();
    }
  }, INTERVALO_CHECAGEM_MS);
}

/**
 * Fecha o túnel atual (se existir) e força uma nova conexão do zero.
 * Usada tanto pelos eventos 'close'/'error' do próprio localtunnel quanto
 * pela checagem periódica de saúde, com uma trava (reconectando) pra
 * nunca disparar duas reconexões ao mesmo tempo.
 */
function forcarReconexao() {
  if (reconectando) return;
  reconectando = true;
  pararChecagemPeriodica();

  const tunnelParaFechar = tunnelAtual;
  tunnelAtual = null;

  try {
    if (tunnelParaFechar) tunnelParaFechar.close();
  } catch (erro) {
    // Ignora — o túnel já pode estar morto do outro lado.
  }

  setTimeout(() => conectarTunel(), 3000);
}

async function conectarTunel(tentativa = 1) {
  try {
    console.log(`📡 Tentando estabelecer o túnel permanente (Tentativa ${tentativa}) na porta ${portaLocal}...`);

    const tunnel = await localtunnel({ 
      port: portaLocal, 
      subdomain: SUBDOMINIO_FIXO,
      host: 'https://localtunnel.me'
    });

    tunnelAtual = tunnel;
    reconectando = false;

    console.log('\n======================================================');
    console.log('🚀 TÚNEL PERMANENTE E FIXO CONECTADO!');
    console.log(`🔗 LINK DO NETLIFY ATIVO:`);
    console.log(`👉 ${URL_TUNEL_FIXO}`);
    console.log('======================================================\n');

    // Se o servidor do localtunnel derrubar o link, essa função roda sozinha:
    tunnel.on('close', () => {
      console.log('⚠️ O servidor do Localtunnel fechou a conexão espontaneamente. RECONECTANDO...');
      forcarReconexao();
    });

    // Se der qualquer erro interno na conexão do túnel:
    tunnel.on('error', (err) => {
      console.error('❌ Erro no evento do túnel:', err.message);
      forcarReconexao();
    });

    // A checagem periódica cobre o caso comum em que o túnel morre do
    // lado do servidor da localtunnel sem disparar 'close' nem 'error'
    // (é aí que aparece o "503 - Tunnel Unavailable" ao abrir o link,
    // com o processo aqui achando que ainda está tudo certo).
    iniciarChecagemPeriodica();

  } catch (err) {
    console.error('⚠️ Falha crítica ao abrir o túnel:', err.message);
    reconectando = false;
    // Loop de segurança: se falhar (ex: servidor deles fora do ar), tenta de novo em 10 segundos
    const proximaEspera = Math.min(30000, 5000 * tentativa);
    setTimeout(() => conectarTunel(tentativa + 1), proximaEspera);
  }
}

// O LocalTunnel fica desligado por padrão porque o próprio host (HidenCloud)
// já expõe esse app publicamente pelo domínio dele (ex: servegame.net) — não
// precisa de túnel nenhum, e era o próprio túnel que estava causando os
// "Bad Gateway"/"Tunnel Unavailable". Se um dia precisar dele de novo (ex:
// pra testar local na sua máquina), defina USAR_LOCALTUNNEL=true no ambiente.
const USAR_LOCALTUNNEL = process.env.USAR_LOCALTUNNEL === 'true';

function iniciarPainel(porta, obterSockFn, opcoes = {}) {
  obterSock = obterSockFn || null;
  portaLocal = porta; // garante que o túnel (se ativado) aponte pra mesma porta que o Express está usando
  app.listen(porta, () => {
    console.log(`🖥️  Painel interno do Express rodando na porta ${porta}`);
    if (USAR_LOCALTUNNEL) {
      conectarTunel();
    } else {
      console.log(`🌐 LocalTunnel desligado — acesse o painel direto pelo domínio do seu host (ex: https://luzebrilhoadmin.servegame.net)`);
    }
  });
}

module.exports = { iniciarPainel };