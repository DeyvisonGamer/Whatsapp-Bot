/**
 * Instagram Direct - Integração com instagram-web-api
 *
 * Usa a biblioteca instagram-web-api que é específica e funciona!
 * Não é Puppeteer, não é axios puro - é a forma CERTA.
 */

const fs = require('fs');
const path = require('path');

let InstagramAPI;
try {
  InstagramAPI = require('instagram-web-api').default;
} catch (e) {
  InstagramAPI = null;
}

// ==========================================
// CONFIGURAÇÕES
// ==========================================
const INSTAGRAM_USUARIO = process.env.INSTAGRAM_USUARIO || '';
const INSTAGRAM_SENHA = process.env.INSTAGRAM_SENHA || '';
const INTERVALO_VERIFICACAO_MS = Number(process.env.INSTAGRAM_INTERVALO_MS) || 30000;

const PASTA_SESSAO = path.join(__dirname, 'auth_info_instagram');
const ARQUIVO_SESSAO = path.join(PASTA_SESSAO, 'sessao.json');

// ==========================================
// ESTADO
// ==========================================

let client = null;
let monitorando = false;
let onMensagemCallback = null;
const threadCache = new Map();

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function instagramConfigurado() {
  return !!(InstagramAPI && INSTAGRAM_USUARIO && INSTAGRAM_SENHA);
}

// ==========================================
// SESSÃO
// ==========================================

async function salvarSessao(cookieFile) {
  try {
    if (!fs.existsSync(PASTA_SESSAO)) {
      fs.mkdirSync(PASTA_SESSAO, { recursive: true });
    }
    const cookies = fs.readFileSync(cookieFile, 'utf-8');
    fs.writeFileSync(ARQUIVO_SESSAO, cookies);
  } catch (e) {
    console.error('⚠️  [Instagram] Erro ao salvar sessão:', e.message);
  }
}

async function fazerLogin() {
  try {
    if (!fs.existsSync(PASTA_SESSAO)) {
      fs.mkdirSync(PASTA_SESSAO, { recursive: true });
    }

    const cookieFile = path.join(PASTA_SESSAO, 'cookies.json');

    console.log('📸 [Instagram] Fazendo login...');

    const instagram = new InstagramAPI({
      username: INSTAGRAM_USUARIO,
      password: INSTAGRAM_SENHA,
      cookieStore: cookieFile,
    });

    await instagram.login();
    console.log('📸 [Instagram] Login bem-sucedido!');

    // Salva sessão
    if (fs.existsSync(cookieFile)) {
      await salvarSessao(cookieFile);
    }

    return instagram;
  } catch (erro) {
    console.error('❌ [Instagram] Erro ao fazer login:', erro.message);
    if (erro.message.includes('401') || erro.message.includes('403')) {
      console.log('⚠️  [Instagram] Credenciais inválidas ou conta bloqueada');
    }
    return null;
  }
}

async function garantirConectado() {
  if (!client) {
    const cookieFile = path.join(PASTA_SESSAO, 'cookies.json');

    // Tenta usar sessão salva
    if (fs.existsSync(cookieFile)) {
      try {
        const instagram = new InstagramAPI({
          username: INSTAGRAM_USUARIO,
          password: INSTAGRAM_SENHA,
          cookieStore: cookieFile,
        });

        // Testa se está OK
        try {
          await instagram.getProfile();
          console.log('📸 [Instagram] Sessão anterior carregada.');
          client = instagram;
          return;
        } catch (e) {
          console.log('⚠️  [Instagram] Sessão expirou, fazendo login novo...');
        }
      } catch (e) {
        // Continua pro login novo
      }
    }

    // Login novo
    client = await fazerLogin();
    if (!client) {
      throw new Error('Falha ao conectar ao Instagram');
    }
  }
}

// ==========================================
// ENVIO DE MENSAGENS
// ==========================================

async function enviarMensagemInstagram(usuario, texto) {
  if (!instagramConfigurado()) {
    throw new Error('Instagram não está configurado');
  }

  try {
    await garantirConectado();

    if (!client) {
      throw new Error('Não conectado ao Instagram');
    }

    console.log(`📸 [Instagram] Enviando mensagem para @${usuario}...`);

    // Procura o usuário
    const searchResult = await client.getUserIdFromUsername(usuario);
    if (!searchResult) {
      throw new Error(`Usuário @${usuario} não encontrado`);
    }

    const userId = searchResult;

    // Manda mensagem
    await client.directSendText([userId], texto);
    console.log(`📤 [Instagram] Mensagem enviada para @${usuario}`);
  } catch (erro) {
    console.error('❌ [Instagram] Erro ao enviar:', erro.message);
    throw erro;
  }
}

// ==========================================
// MONITORAMENTO
// ==========================================

async function verificarNovasMensagens() {
  try {
    if (!client) return;

    // Pega inbox
    const inbox = await client.getDirectInbox();
    if (!inbox || !inbox.threads) return;

    for (const thread of inbox.threads) {
      try {
        // Pega últimas mensagens
        const messages = await client.getDirectMessages(thread.thread_id, { amount: 5 });
        if (!messages || messages.length === 0) continue;

        const ultimaMensagem = messages[0];

        // Se foi enviada por nós, ignora
        if (ultimaMensagem.user_id === client.state?.cookieUserId) {
          continue;
        }

        // Verifica se já foi processada
        if (threadCache.get(thread.thread_id) === ultimaMensagem.id) {
          continue;
        }

        // Marca como processada
        threadCache.set(thread.thread_id, ultimaMensagem.id);

        // Chama callback
        if (onMensagemCallback && ultimaMensagem.text) {
          const nomeUsuario = thread.users?.[0]?.username || 'desconhecido';
          try {
            await onMensagemCallback(nomeUsuario, ultimaMensagem.text);
          } catch (e) {
            console.error('❌ [Instagram] Erro no callback:', e.message);
          }
        }
      } catch (erroThread) {
        console.error('⚠️  [Instagram] Erro ao verificar thread:', erroThread?.message);
      }
    }
  } catch (erro) {
    console.error('⚠️  [Instagram] Erro ao verificar mensagens:', erro?.message);
  }
}

// ==========================================
// LOOP
// ==========================================

async function loopDeVerificacao() {
  while (monitorando) {
    try {
      await garantirConectado();
      await verificarNovasMensagens();
    } catch (erro) {
      // Log silencioso
    }
    await aguardar(INTERVALO_VERIFICACAO_MS);
  }
}

async function iniciarInstagram(callback) {
  if (!instagramConfigurado()) {
    console.log('📸 [Instagram] Desativado (instagram-web-api não instalado ou credenciais faltando)');
    return;
  }

  onMensagemCallback = callback;
  monitorando = true;

  try {
    await garantirConectado();
    console.log(
      '📸 [Instagram] Conectado! Verificando Direct a cada ' +
        `${Math.round(INTERVALO_VERIFICACAO_MS / 1000)}s`
    );
  } catch (erro) {
    console.error('❌ [Instagram] Erro ao conectar:', erro.message);
    monitorando = false;
  }

  // Loop em background
  loopDeVerificacao();
}

function pararInstagram() {
  monitorando = false;
  if (client) {
    client = null;
  }
}

module.exports = {
  instagramConfigurado,
  iniciarInstagram,
  pararInstagram,
  enviarMensagemInstagram,
};
